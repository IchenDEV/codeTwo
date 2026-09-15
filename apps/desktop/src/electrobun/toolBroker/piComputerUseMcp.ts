#!/usr/bin/env bun

import { createInterface } from "node:readline";

import computerUseExtension from "@injaneity/pi-computer-use/extensions/computer-use.ts";

interface PiTool {
  name: string;
  description?: string;
  parameters?: unknown;
  execute: (
    toolCallId: string,
    params: Record<string, unknown>,
    signal: AbortSignal | undefined,
    onUpdate: undefined,
    ctx: PiToolContext
  ) => Promise<PiToolResult>;
}

interface PiToolContext {
  cwd: string;
  hasUI: boolean;
  ui: { select: () => Promise<undefined>; notify: () => void };
}

interface PiToolResult {
  content?: { type: string; text?: string }[];
}

function collectTools(): PiTool[] {
  const tools: PiTool[] = [];
  const registration = {
    registerTool: (tool: PiTool) => {
      tools.push(tool);
    },
    registerCommand: () => {},
    on: () => {},
  };
  computerUseExtension(registration as never);
  return tools;
}

const TOOLS = collectTools();
const CONTEXT: PiToolContext = {
  cwd: process.cwd(),
  hasUI: false,
  ui: { select: async () => undefined, notify: () => {} },
};

function content(result: PiToolResult): { type: string; text: string }[] {
  const entries = Array.isArray(result?.content) ? result.content : [];
  return entries.map((entry) =>
    entry.type === "text" && typeof entry.text === "string"
      ? { type: "text", text: entry.text }
      : { type: "text", text: JSON.stringify(entry) }
  );
}

async function callTool(
  name: string,
  args: Record<string, unknown>
): Promise<{ content: { type: string; text: string }[]; isError?: boolean }> {
  const tool = TOOLS.find((candidate) => candidate.name === name);
  if (tool === undefined) {
    return {
      content: [{ type: "text", text: `Unknown tool: ${name}` }],
      isError: true,
    };
  }
  try {
    return {
      content: content(
        await tool.execute(
          crypto.randomUUID(),
          args,
          undefined,
          undefined,
          CONTEXT
        )
      ),
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: error instanceof Error ? error.message : String(error),
        },
      ],
      isError: true,
    };
  }
}

function respond(id: unknown, result: unknown): void {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
}

function respondError(id: unknown, code: number, message: string): void {
  process.stdout.write(
    `${JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } })}\n`
  );
}

function handle(
  id: unknown,
  method: string,
  params: Record<string, unknown>
): void {
  switch (method) {
    case "initialize": {
      respond(id, {
        protocolVersion:
          typeof params.protocolVersion === "string"
            ? params.protocolVersion
            : "2024-11-05",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "pi-computer-use", version: "1" },
      });
      return;
    }
    case "tools/list": {
      respond(id, {
        tools: TOOLS.map((tool) => ({
          name: tool.name,
          description: tool.description ?? tool.name,
          inputSchema: tool.parameters ?? { type: "object", properties: {} },
        })),
      });
      return;
    }
    case "tools/call": {
      const name = typeof params.name === "string" ? params.name : "";
      const args =
        params.arguments != null &&
        typeof params.arguments === "object" &&
        !Array.isArray(params.arguments)
          ? (params.arguments as Record<string, unknown>)
          : {};
      void callTool(name, args).then((result) => respond(id, result));
      return;
    }
    case "ping": {
      respond(id, {});
      return;
    }
    default: {
      respondError(id, -32_601, `method not found: ${method}`);
    }
  }
}

async function main(): Promise<void> {
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) continue;
    let request: { id?: unknown; method?: string; params?: unknown };
    try {
      request = JSON.parse(line) as typeof request;
    } catch {
      continue;
    }
    if (!("id" in request) || request.id === undefined) continue;
    const params =
      request.params != null &&
      typeof request.params === "object" &&
      !Array.isArray(request.params)
        ? (request.params as Record<string, unknown>)
        : {};
    handle(request.id, String(request.method), params);
  }
}

if (process.argv.includes("--list-tools")) {
  process.stdout.write(
    `${JSON.stringify(
      TOOLS.map((tool) => tool.name),
      null,
      2
    )}\n`
  );
} else {
  await main();
}
