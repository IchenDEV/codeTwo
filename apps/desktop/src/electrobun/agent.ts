#!/usr/bin/env bun

import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

import type { DesktopEvent } from "./rpc";
import { PureBunHost } from "./host";

interface AgentOptions {
  cwd: string;
  dataDir: string;
  port: number;
  pair: boolean;
  protocol: "t3" | "legacy";
  pairingTtl: number;
  json: boolean;
}

function usage(): string {
  return [
    "C2 remote programming agent",
    "",
    "Usage: codetwo-agent [options] [workspace]",
    "",
    "Options:",
    "  --data-dir <path>       Durable agent state (default: ~/.codetwo-agent)",
    "  --port <port>           Listen port (default: 4599; 0 chooses a free port)",
    "  --protocol <t3|legacy>  Pairing client (default: t3)",
    "  --pair-ttl <seconds>    One-time pairing lifetime (default: 900)",
    "  --no-pair               Start without printing a pairing credential",
    "  --json                  Emit startup details as one JSON object",
    "  -h, --help              Show this help",
  ].join("\n");
}

function valueAfter(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

function positiveInteger(value: string, flag: string, allowZero = false): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < (allowZero ? 0 : 1)) throw new Error(`${flag} must be an integer`);
  return parsed;
}

function parseArgs(args: string[]): AgentOptions | null {
  let cwd = process.cwd();
  let dataDir = process.env.CODETWO_AGENT_DATA_DIR ?? join(homedir(), ".codetwo-agent");
  let port = 4599;
  let pair = true;
  let protocol: "t3" | "legacy" = "t3";
  let pairingTtl = 15 * 60;
  let json = false;
  let workspaceSeen = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "-h" || arg === "--help") return null;
    if (arg === "--no-pair") {
      pair = false;
    } else if (arg === "--json") {
      json = true;
    } else if (arg === "--data-dir") {
      dataDir = valueAfter(args, index, arg);
      index += 1;
    } else if (arg === "--port") {
      port = positiveInteger(valueAfter(args, index, arg), arg, true);
      if (port > 65_535) throw new Error("--port must not exceed 65535");
      index += 1;
    } else if (arg === "--pair-ttl") {
      pairingTtl = positiveInteger(valueAfter(args, index, arg), arg);
      index += 1;
    } else if (arg === "--protocol") {
      const value = valueAfter(args, index, arg);
      if (value !== "t3" && value !== "legacy") throw new Error("--protocol must be t3 or legacy");
      protocol = value;
      index += 1;
    } else if (arg.startsWith("-")) {
      throw new Error(`unknown option: ${arg}`);
    } else if (workspaceSeen) {
      throw new Error("only one workspace may be supplied");
    } else {
      cwd = arg;
      workspaceSeen = true;
    }
  }
  return {
    cwd: resolve(cwd),
    dataDir: isAbsolute(dataDir) ? dataDir : resolve(dataDir),
    port,
    pair,
    protocol,
    pairingTtl,
    json,
  };
}

function eventLine(event: DesktopEvent): void {
  if (event.name !== "engine-event") return;
  const payload = event.payload as Record<string, unknown>;
  if (payload?.event !== "error") return;
  process.stderr.write(`[codetwo-agent] ${String(payload.message ?? "engine error")}\n`);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (!options) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  process.chdir(options.cwd);
  const host = new PureBunHost(options.dataDir, eventLine, { defaultCwd: options.cwd });
  let shuttingDown = false;
  const shutdown = async (code: number) => {
    if (shuttingDown) return;
    shuttingDown = true;
    await host.shutdown();
    process.exit(code);
  };
  process.on("SIGINT", () => void shutdown(0));
  process.on("SIGTERM", () => void shutdown(0));

  try {
    const status = await host.call("remote.start", { port: options.port }, null) as {
      port: number;
      endpoints: Array<{ id: string; label: string; url: string; qr_shareable: boolean }>;
    };
    const reachable = status.endpoints.find((endpoint) => endpoint.qr_shareable)
      ?? status.endpoints.find((endpoint) => endpoint.id === "loopback")
      ?? status.endpoints[0];
    const pairing = options.pair
      ? await host.call("remote.pairing_link", {
        endpoint_id: reachable?.id,
        client_protocol: options.protocol,
        ttl_secs: options.pairingTtl,
      }, null)
      : null;
    const startup = {
      kind: "codetwo-agent-ready",
      pid: process.pid,
      workspace: options.cwd,
      data_dir: options.dataDir,
      port: status.port,
      endpoints: status.endpoints,
      protocol: options.protocol,
      pairing,
    };
    if (options.json) {
      process.stdout.write(`${JSON.stringify(startup)}\n`);
    } else {
      process.stdout.write(`C2 remote programming agent is listening on port ${status.port}\n`);
      for (const endpoint of status.endpoints) process.stdout.write(`  ${endpoint.label}: ${endpoint.url}\n`);
      if (pairing && typeof pairing === "object" && "url" in pairing) {
        process.stdout.write(`Pairing URL: ${String((pairing as { url: unknown }).url)}\n`);
      }
    }
  } catch (error) {
    await host.shutdown();
    throw error;
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
