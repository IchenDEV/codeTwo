#!/usr/bin/env node
const readline = require("readline");

const send = (message) => process.stdout.write(`${JSON.stringify(message)}\n`);
const rl = readline.createInterface({ input: process.stdin });
const pending = new Map();
let nextRequestId = 1;
let hostReady = false;

function callHost(name, args) {
  const id = nextRequestId++;
  send({ jsonrpc: "2.0", id, method: "command/call", params: { name, args } });
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

function rank(session) {
  const state = session.activity_state;
  if (state === "awaiting_input") return 0;
  if (state === "running") return 1;
  if (state === "failed") return 2;
  return 3;
}

function detailFor(state) {
  if (state === "awaiting_input") return "INPUT";
  if (state === "running") return "RUNNING";
  if (state === "failed") return "FAILED";
  return "IDLE";
}

function semanticState(state) {
  if (state === "awaiting_input") return "attention";
  if (state === "running") return "running";
  if (state === "failed") return "failure";
  return "default";
}

function boundedLabel(value) {
  const label = Array.from(String(value ?? "").trim()).slice(0, 80).join("");
  return label || "Untitled session";
}

async function render() {
  const sessions = await callHost("sessions.summary", {});
  return {
    items: sessions
      .slice()
      .sort((left, right) =>
        rank(left) - rank(right) ||
        right.last_active_at - left.last_active_at ||
        left.id.localeCompare(right.id))
      .slice(0, 3)
      .map((session) => {
        const label = boundedLabel(session.title);
        const detail = detailFor(session.activity_state);
        return {
          id: session.id,
          label,
          detail,
          state: semanticState(session.activity_state),
          enabled: true,
          input: { session: session.id },
          accessibilityLabel: `${label}, ${detail.toLowerCase()}`
        };
      })
  };
}

async function invoke(input) {
  if (!input || typeof input.session !== "string") throw new Error("session is required");
  return callHost("desktop.reveal_session", { session: input.session });
}

rl.on("line", async (line) => {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return;
  }

  if (message.method === undefined) {
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
    return;
  }

  if (message.method === "initialize") {
    const commands = message.params.host.commands ?? [];
    hostReady = commands.includes("sessions.summary") && commands.includes("desktop.reveal_session");
    send({
      jsonrpc: "2.0",
      id: message.id,
      result: {
        name: "agent-session-monitor",
        version: "0.1.0",
        protocolVersion: "1.0.0",
        description: "C2 agent sessions as compact host actions.",
        commands: [{
          name: "agent-monitor.actions",
          description: "Render or invoke compact agent-session actions."
        }],
        events: []
      }
    });
    return;
  }

  if (message.method !== "command/invoke") return;
  try {
    if (!hostReady) throw new Error("the required desktop host capabilities are unavailable");
    if (message.params.name !== "agent-monitor.actions") {
      throw new Error(`unknown command ${message.params.name}`);
    }
    const operation = message.params.args?.context?.operation;
    const result = operation === "render"
      ? await render()
      : operation === "invoke"
        ? await invoke(message.params.args?.context?.input)
        : (() => { throw new Error(`unknown operation ${operation}`); })();
    send({ jsonrpc: "2.0", id: message.id, result });
  } catch (error) {
    send({
      jsonrpc: "2.0",
      id: message.id,
      error: { code: -32000, message: String(error.message ?? error) }
    });
  }
});

rl.on("close", () => process.exit(0));
