#!/usr/bin/env bun

import { ToolBroker, type AcpMcpServer, type ToolPlan } from "../../../../packages/tool-broker/src";
import {
  detectHostToolEvidence,
  saveBrowserUseSelection,
  saveComputerUseSelection,
} from "./host/providerTools";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${name} is required`);
  return value;
}

function environment(value: unknown): NodeJS.ProcessEnv {
  if (!value || typeof value !== "object" || Array.isArray(value)) return process.env;
  return Object.fromEntries(Object.entries(value).flatMap(([name, candidate]) => {
    return typeof candidate === "string" ? [[name, candidate]] : [];
  }));
}

function wireServer(server: AcpMcpServer): Record<string, unknown> {
  if ("command" in server) {
    return {
      name: server.name,
      command: server.command,
      args: server.args,
      env: server.env.map(({ name, value }) => [name, value]),
      ...(server.cwd ? { cwd: server.cwd } : {}),
    };
  }
  return {
    name: server.name,
    type: server.type,
    url: server.url,
    headers: server.headers.map(({ name, value }) => [name, value]),
  };
}

function wirePlan(plan: ToolPlan): Record<string, unknown> {
  return {
    capabilities: plan.capabilities,
    native_capabilities: plan.nativeCapabilities,
    mcp_servers: plan.mcpServers.map(wireServer),
    instructions: plan.instructions,
  };
}

function wireSettings(settings: ReturnType<ToolBroker["catalog"]>): Record<string, unknown> {
  const encode = (section: typeof settings.computerUse) => ({
    selections: section.selections,
    backends: section.backends.map((backend) => ({
      id: backend.id,
      display_name: backend.displayName,
      available: backend.available,
      reason: backend.reason,
      providers: backend.providers,
      exclude_providers: backend.excludeProviders,
    })),
    errors: section.errors,
  });
  return {
    computer_use: encode(settings.computerUse),
    browser_use: encode(settings.browserUse),
  };
}

function handle(request: JsonRpcRequest): unknown {
  const params = request.params ?? {};
  const dataDir = requiredString(params.data_dir, "params.data_dir");
  let evidence = detectHostToolEvidence(environment(params.environment), dataDir);
  const broker = new ToolBroker();

  switch (request.method) {
    case "tool.catalog":
      return wireSettings(broker.catalog({ evidence }));
    case "tool.resolve":
      return wirePlan(broker.resolve({
        providerId: requiredString(params.provider_id, "params.provider_id"),
        context: { evidence },
      }));
    case "tool.snapshot": {
      if (!Array.isArray(params.provider_ids)
        || params.provider_ids.length === 0
        || !params.provider_ids.every((providerId) => typeof providerId === "string" && providerId.length > 0)) {
        throw new Error("params.provider_ids must be a non-empty string array");
      }
      return {
        catalog: wireSettings(broker.catalog({ evidence })),
        plans: Object.fromEntries(params.provider_ids.map((providerId) => [
          providerId,
          wirePlan(broker.resolve({ providerId, context: { evidence } })),
        ])),
      };
    }
    case "selection.set": {
      const backendId = requiredString(params.backend_id, "params.backend_id");
      const kind = requiredString(params.kind, "params.kind");
      if (kind === "computer_use") {
        saveComputerUseSelection(dataDir, backendId, evidence);
      } else if (kind === "browser_use") {
        saveBrowserUseSelection(dataDir, backendId, evidence);
      } else {
        throw new Error(`unsupported selection kind ${JSON.stringify(kind)}`);
      }
      evidence = detectHostToolEvidence(environment(params.environment), dataDir);
      return wireSettings(broker.catalog({ evidence }));
    }
    default:
      throw new Error(`method not found: ${request.method}`);
  }
}

async function main(): Promise<void> {
  let request: JsonRpcRequest | null = null;
  try {
    request = JSON.parse(await Bun.stdin.text()) as JsonRpcRequest;
    if (request.jsonrpc !== "2.0") throw new Error("jsonrpc must be 2.0");
    process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: request.id, result: handle(request) })}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify({
      jsonrpc: "2.0",
      id: request?.id ?? null,
      error: {
        code: -32000,
        message: error instanceof Error ? error.message : String(error),
      },
    })}\n`);
    process.exitCode = 1;
  }
}

await main();
