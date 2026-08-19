#!/usr/bin/env node
// A complete C2 plugin, in one file. See docs/plugin-protocol.md.
//
// It contributes one command, calls one of the host's from inside it, and listens for a host
// event. Nothing here is C2-specific machinery: JSON-RPC 2.0, one object per line, on stdio.
//
// Run it by installing this directory as a plugin and marking it **trusted** — installing alone
// never starts a process.

const readline = require("readline");

const send = (message) => process.stdout.write(JSON.stringify(message) + "\n");
const log = (message, level = "info") => send({ jsonrpc: "2.0", method: "log", params: { level, message } });

// stdout is the protocol channel, so never console.log — use `log` above, or stderr.
const rl = readline.createInterface({ input: process.stdin });

// Outstanding requests *we* made to the host, by id.
let nextId = 1;
const pending = new Map();

function callHost(name, args) {
  const id = nextId++;
  send({ jsonrpc: "2.0", id, method: "command/call", params: { name, args } });
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

rl.on("line", async (line) => {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return;
  }

  // A response to something we asked the host.
  if (message.method === undefined) {
    const waiting = pending.get(message.id);
    if (!waiting) return;
    pending.delete(message.id);
    if (message.error) waiting.reject(new Error(message.error.message));
    else waiting.resolve(message.result);
    return;
  }

  switch (message.method) {
    case "initialize": {
      // `params.host.commands` is the host's surface right now — feature-detect rather than assume.
      const hostHasGit = (message.params.host.commands ?? []).includes("git.status");
      send({
        jsonrpc: "2.0",
        id: message.id,
        result: {
          name: "hello-runtime",
          version: "1.0.0",
          protocolVersion: "1.0.0",
          description: "Example plugin.",
          commands: [
            {
              name: "hello.dirty",
              description: "How many files are modified in a workspace?",
              schema: {
                type: "object",
                required: ["cwd"],
                properties: { cwd: { type: "string" } },
              },
            },
          ],
          events: hostHasGit ? ["skills/changed"] : [],
        },
      });
      log(`ready; the host offers ${(message.params.host.commands ?? []).length} commands`);
      return;
    }

    case "command/invoke": {
      const { name, args } = message.params;
      try {
        if (name !== "hello.dirty") throw new Error(`no command ${name}`);
        // Reach a host command by name — the same registry a Rust plugin uses.
        const status = await callHost("git.status", { cwd: args.cwd });
        send({
          jsonrpc: "2.0",
          id: message.id,
          result: { branch: status.branch ?? null, dirty: (status.files ?? []).length },
        });
      } catch (error) {
        send({
          jsonrpc: "2.0",
          id: message.id,
          error: { code: -32000, message: String(error.message ?? error) },
        });
      }
      return;
    }

    case "event/emit": {
      log(`host event: ${message.params.name}`, "debug");
      return;
    }
  }
});

// Losing stdin means the host is gone.
rl.on("close", () => process.exit(0));
