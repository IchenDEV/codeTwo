#!/usr/bin/env bun

import { createInterface } from "node:readline";

import { ToolBroker } from "../../../../packages/tool-broker/src";
import type {
  AcpMcpServer,
  ToolPlan,
} from "../../../../packages/tool-broker/src";
import {
  detectHostToolEvidence,
  saveAgentBrowserAccess,
  saveBrowserUseSelection,
  saveComputerUseSelection,
} from "./toolBroker/providerTools";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function requiredBoolean(value: unknown, name: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${name} must be a boolean`);
  }
  return value;
}

function environment(value: unknown): NodeJS.ProcessEnv {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return process.env;
  }
  return Object.fromEntries(
    Object.entries(value).flatMap(([name, candidate]) =>
      typeof candidate === "string" ? [[name, candidate]] : []
    )
  );
}

function wireServer(server: AcpMcpServer): Record<string, unknown> {
  if ("command" in server) {
    return {
      args: server.args,
      command: server.command,
      env: server.env.map(({ name, value }) => [name, value]),
      name: server.name,
      ...(server.cwd != null && server.cwd !== "" ? { cwd: server.cwd } : {}),
    };
  }
  return {
    headers: server.headers.map(({ name, value }) => [name, value]),
    name: server.name,
    type: server.type,
    url: server.url,
  };
}

function wirePlan(plan: ToolPlan): Record<string, unknown> {
  return {
    browser_access_enabled: plan.browserAccessEnabled,
    capabilities: plan.capabilities,
    instructions: plan.instructions,
    mcp_servers: plan.mcpServers.map(wireServer),
    native_capabilities: plan.nativeCapabilities,
  };
}

function wireSettings(
  settings: ReturnType<ToolBroker["catalog"]>
): Record<string, unknown> {
  const encode = (section: typeof settings.computerUse) => {
    return {
      backends: section.backends.map((backend) => {
        return {
          available: backend.available,
          display_name: backend.displayName,
          exclude_providers: backend.excludeProviders,
          id: backend.id,
          providers: backend.providers,
          reason: backend.reason,
        };
      }),
      errors: section.errors,
      selections: section.selections,
    };
  };
  return {
    browser_use: {
      ...encode(settings.browserUse),
      access_enabled: settings.browserUse.accessEnabled,
    },
    computer_use: encode(settings.computerUse),
  };
}

function handle(request: JsonRpcRequest): unknown {
  const params = request.params ?? {};
  const dataDirectory = requiredString(params.data_dir, "params.data_dir");
  let evidence = detectHostToolEvidence(
    environment(params.environment),
    dataDirectory
  );
  const broker = new ToolBroker();

  switch (request.method) {
    case "tool.catalog": {
      return wireSettings(broker.catalog({ evidence }));
    }
    case "tool.resolve": {
      return wirePlan(
        broker.resolve({
          context: { evidence },
          providerId: requiredString(params.provider_id, "params.provider_id"),
        })
      );
    }
    case "tool.snapshot": {
      if (
        !Array.isArray(params.provider_ids) ||
        params.provider_ids.length === 0 ||
        !params.provider_ids.every(
          (providerId) =>
            typeof providerId === "string" && providerId.length > 0
        )
      ) {
        throw new Error("params.provider_ids must be a non-empty string array");
      }
      return {
        catalog: wireSettings(broker.catalog({ evidence })),
        plans: Object.fromEntries(
          params.provider_ids.map((providerId) => {
            return [
              providerId,
              wirePlan(broker.resolve({ context: { evidence }, providerId })),
            ];
          })
        ),
      };
    }
    case "selection.set": {
      const backendId = requiredString(params.backend_id, "params.backend_id");
      const kind = requiredString(params.kind, "params.kind");
      if (kind === "computer_use") {
        saveComputerUseSelection(dataDirectory, backendId, evidence);
      } else if (kind === "browser_use") {
        saveBrowserUseSelection(dataDirectory, backendId, evidence);
      } else {
        throw new Error(`unsupported selection kind ${JSON.stringify(kind)}`);
      }
      evidence = detectHostToolEvidence(
        environment(params.environment),
        dataDirectory
      );
      return wireSettings(broker.catalog({ evidence }));
    }
    case "browser_access.set": {
      saveAgentBrowserAccess(
        dataDirectory,
        requiredBoolean(params.enabled, "params.enabled")
      );
      evidence = detectHostToolEvidence(
        environment(params.environment),
        dataDirectory
      );
      return wireSettings(broker.catalog({ evidence }));
    }
    default: {
      throw new Error(`method not found: ${request.method}`);
    }
  }
}

async function runEmptyMcpServer(): Promise<void> {
  const lines = createInterface({ crlfDelay: Infinity, input: process.stdin });
  for await (const line of lines) {
    if (!line.trim()) {
      continue;
    }
    let request: Record<string, unknown>;
    try {
      request = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (!("id" in request)) {
      continue;
    }
    const method = request.method;
    const params =
      Boolean(request.params) &&
      typeof request.params === "object" &&
      !Array.isArray(request.params)
        ? (request.params as Record<string, unknown>)
        : {};
    let result: Record<string, unknown>;
    switch (method) {
      case "initialize": {
        result = {
          capabilities: { tools: { listChanged: false } },
          protocolVersion:
            typeof params.protocolVersion === "string"
              ? params.protocolVersion
              : "2024-11-05",
          serverInfo: { name: "codetwo-browser-access-disabled", version: "1" },
        };
        break;
      }
      case "tools/list": {
        result = { tools: [] };
        break;
      }
      case "resources/list": {
        result = { resources: [] };
        break;
      }
      case "prompts/list": {
        result = { prompts: [] };
        break;
      }
      case "ping": {
        result = {};
        break;
      }
      default: {
        process.stdout.write(
          `${JSON.stringify({
            error: {
              code: -32601,
              message: `method not found: ${String(method)}`,
            },
            id: request.id,
            jsonrpc: "2.0",
          })}\n`
        );
        continue;
      }
    }
    process.stdout.write(
      `${JSON.stringify({ id: request.id, jsonrpc: "2.0", result })}\n`
    );
  }
}

async function main(): Promise<void> {
  let request: JsonRpcRequest | null = null;
  try {
    request = JSON.parse(await Bun.stdin.text()) as JsonRpcRequest;
    if (request.jsonrpc !== "2.0") {
      throw new Error("jsonrpc must be 2.0");
    }
    process.stdout.write(
      `${JSON.stringify({ id: request.id, jsonrpc: "2.0", result: handle(request) })}\n`
    );
  } catch (error) {
    process.stdout.write(
      `${JSON.stringify({
        error: {
          code: -32000,
          message: error instanceof Error ? error.message : String(error),
        },
        id: request?.id ?? null,
        jsonrpc: "2.0",
      })}\n`
    );
    process.exitCode = 1;
  }
}

if (process.argv.includes("--empty-mcp")) {
  await runEmptyMcpServer();
} else {
  await main();
}
