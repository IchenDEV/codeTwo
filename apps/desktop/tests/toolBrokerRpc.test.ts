import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const entrypoint = fileURLToPath(new URL("../src/electrobun/toolBrokerRpc.ts", import.meta.url));

describe("Tool Broker JSON-RPC adapter", () => {
  test("resolves configured MCP backends through the real subprocess boundary", () => {
    const dataDir = mkdtempSync(join(tmpdir(), "codetwo-tool-broker-rpc-"));
    try {
      writeFileSync(join(dataDir, "host-tools.json"), JSON.stringify({
        schema_version: 1,
        computer_use_selection: { "*": "cua" },
        computer_use: [{
          id: "cua",
          enabled: true,
          server: { name: "cua-driver", command: process.execPath, env: { CUA_MODE: "mcp" } },
        }],
      }));
      const request = {
        jsonrpc: "2.0",
        id: 7,
        method: "tool.resolve",
        params: { data_dir: dataDir, provider_id: "claude_code", environment: {} },
      };
      const child = Bun.spawnSync(["bun", entrypoint], {
        stdin: new TextEncoder().encode(JSON.stringify(request)),
        stdout: "pipe",
        stderr: "pipe",
      });

      expect(child.exitCode).toBe(0);
      const response = JSON.parse(child.stdout.toString());
      expect(response.id).toBe(7);
      expect(response.result.browser_access_enabled).toBe(true);
      expect(response.result.native_capabilities).toEqual([]);
      expect(response.result.mcp_servers).toEqual([{
        name: "cua-driver",
        command: process.execPath,
        args: [],
        env: [["CUA_MODE", "mcp"]],
      }]);
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  test("persists Computer Use as one global selection without a provider id", () => {
    const dataDir = mkdtempSync(join(tmpdir(), "codetwo-tool-broker-global-selection-"));
    try {
      const request = {
        jsonrpc: "2.0",
        id: 8,
        method: "selection.set",
        params: {
          data_dir: dataDir,
          kind: "computer_use",
          backend_id: "automatic",
          environment: {},
        },
      };
      const child = Bun.spawnSync(["bun", entrypoint], {
        stdin: new TextEncoder().encode(JSON.stringify(request)),
        stdout: "pipe",
        stderr: "pipe",
      });

      expect(child.exitCode).toBe(0);
      expect(JSON.parse(child.stdout.toString()).result.computer_use.selections).toEqual({ "*": "automatic" });
      expect(JSON.parse(readFileSync(join(dataDir, "host-tools.json"), "utf8")).computer_use_selection)
        .toEqual({ "*": "automatic" });
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  }, 10_000);

  test("persists Browser Use as one global selection without a provider id", () => {
    const dataDir = mkdtempSync(join(tmpdir(), "codetwo-tool-broker-global-browser-selection-"));
    try {
      const request = {
        jsonrpc: "2.0",
        id: 9,
        method: "selection.set",
        params: {
          data_dir: dataDir,
          kind: "browser_use",
          backend_id: "automatic",
          environment: {},
        },
      };
      const child = Bun.spawnSync(["bun", entrypoint], {
        stdin: new TextEncoder().encode(JSON.stringify(request)),
        stdout: "pipe",
        stderr: "pipe",
      });

      expect(child.exitCode).toBe(0);
      expect(JSON.parse(child.stdout.toString()).result.browser_use.selections).toEqual({ "*": "automatic" });
      expect(JSON.parse(readFileSync(join(dataDir, "host-tools.json"), "utf8")).browser_use_selection)
        .toEqual({ "*": "automatic" });
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  }, 10_000);

  test("persists the Agent browser access gate and projects a Codex blocker", () => {
    const dataDir = mkdtempSync(join(tmpdir(), "codetwo-tool-broker-browser-access-"));
    try {
      const setRequest = {
        jsonrpc: "2.0",
        id: 10,
        method: "browser_access.set",
        params: { data_dir: dataDir, enabled: false, environment: {} },
      };
      const setChild = Bun.spawnSync(["bun", entrypoint], {
        stdin: new TextEncoder().encode(JSON.stringify(setRequest)),
        stdout: "pipe",
        stderr: "pipe",
      });
      expect(setChild.exitCode).toBe(0);
      expect(JSON.parse(setChild.stdout.toString()).result.browser_use.access_enabled).toBe(false);
      expect(JSON.parse(readFileSync(join(dataDir, "host-tools.json"), "utf8")).agent_browser_access)
        .toBe(false);

      const resolveRequest = {
        jsonrpc: "2.0",
        id: 11,
        method: "tool.resolve",
        params: { data_dir: dataDir, provider_id: "codex", environment: {} },
      };
      const resolveChild = Bun.spawnSync(["bun", entrypoint], {
        stdin: new TextEncoder().encode(JSON.stringify(resolveRequest)),
        stdout: "pipe",
        stderr: "pipe",
      });
      const plan = JSON.parse(resolveChild.stdout.toString()).result;
      expect(plan.browser_access_enabled).toBe(false);
      expect(plan.mcp_servers.map((server) => server.name)).toEqual(["node_repl"]);
      expect(plan.instructions).toEqual([]);
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  }, 10_000);

  test("the browser blocker is a valid MCP server with no tools", () => {
    const requests = [
      { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } },
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
    ];
    const child = Bun.spawnSync(["bun", entrypoint, "--empty-mcp"], {
      stdin: new TextEncoder().encode(`${requests.map((request) => JSON.stringify(request)).join("\n")}\n`),
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(child.exitCode).toBe(0);
    const responses = child.stdout.toString().trim().split("\n").map((line) => JSON.parse(line));
    expect(responses).toHaveLength(2);
    expect(responses[0].result).toMatchObject({
      protocolVersion: "2025-06-18",
      serverInfo: { name: "codetwo-browser-access-disabled" },
    });
    expect(responses[1]).toMatchObject({ id: 2, result: { tools: [] } });
  });
});
