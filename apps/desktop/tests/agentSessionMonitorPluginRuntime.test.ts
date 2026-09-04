import { expect, test } from "bun:test";
import { resolve } from "node:path";

test("agent session monitor orders three sessions and reveals a selected action", async () => {
  const pluginRoot = resolve(
    import.meta.dir,
    "../../../packs/agent-session-monitor"
  );
  const child = Bun.spawn(["node", "plugin.js"], {
    cwd: pluginRoot,
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  const reader = child.stdout.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const send = (message: unknown) => {
    child.stdin.write(`${JSON.stringify(message)}\n`);
    child.stdin.flush();
  };
  const receive = async (): Promise<Record<string, unknown>> => {
    while (!buffer.includes("\n")) {
      const { value, done } = await reader.read();
      if (done) throw new Error("plugin closed stdout");
      buffer += decoder.decode(value, { stream: true });
    }
    const newline = buffer.indexOf("\n");
    const line = buffer.slice(0, newline);
    buffer = buffer.slice(newline + 1);
    return JSON.parse(line);
  };

  try {
    send({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "1.0.0",
        host: {
          name: "code2",
          version: "0.0.0",
          commands: ["sessions.summary", "desktop.reveal_session"],
        },
        config: {},
      },
    });
    const initialized = await receive();
    expect((initialized.result as { events: string[] }).events).toEqual([]);

    send({
      jsonrpc: "2.0",
      id: 2,
      method: "command/invoke",
      params: {
        name: "agent-monitor.actions",
        args: { context: { operation: "render" }, input: null },
      },
    });
    const summaryCall = await receive();
    expect((summaryCall.params as { name: string }).name).toBe(
      "sessions.summary"
    );
    send({
      jsonrpc: "2.0",
      id: summaryCall.id,
      result: [
        {
          id: "idle",
          title: "Idle",
          last_active_at: 50,
          activity_state: "idle",
        },
        {
          id: "run",
          title: "Running",
          last_active_at: 20,
          activity_state: "running",
        },
        {
          id: "input",
          title: "Needs input",
          last_active_at: 10,
          activity_state: "awaiting_input",
        },
        {
          id: "failed",
          title: "Failed",
          last_active_at: 30,
          activity_state: "failed",
        },
      ],
    });
    const rendered = await receive();
    expect(
      (rendered.result as { items: Array<{ id: string }> }).items.map(
        (item) => item.id
      )
    ).toEqual(["input", "run", "failed"]);

    send({
      jsonrpc: "2.0",
      id: 3,
      method: "command/invoke",
      params: {
        name: "agent-monitor.actions",
        args: {
          context: { operation: "invoke", input: { session: "input" } },
          input: null,
        },
      },
    });
    const revealCall = await receive();
    expect(revealCall.params).toEqual({
      name: "desktop.reveal_session",
      args: { session: "input" },
    });
    send({ jsonrpc: "2.0", id: revealCall.id, result: true });
    expect((await receive()).result).toBe(true);
  } finally {
    child.kill();
    await child.exited;
  }
});
