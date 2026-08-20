import { describe, expect, test } from "bun:test";

import { normalizeProviderInfo } from "../src/bridge";
import { sessionRequestParams } from "../src/electrobun/host/acp";
import {
  projectProviderToolset,
  stdioServer,
  withProviderToolInstructions,
  type AcpMcpServer,
  type HostToolEvidence,
} from "../src/electrobun/host/providerTools";

const computerMcp: AcpMcpServer = {
  name: "computer-use",
  command: "/plugins/computer-use-client-launcher",
  args: ["mcp"],
  env: [{ name: "CODEX_HOME", value: "/tmp/codex-home" }],
};

const chromeMcp: AcpMcpServer = {
  name: "node_repl",
  command: "/plugins/node_repl",
  args: [],
  env: [],
};

const readyEvidence: HostToolEvidence = {
  hostPresent: true,
  hostVerified: true,
  hostVersion: "26.803.41515",
  computerEnabled: true,
  computerVersion: "1.0.1000761",
  computerMcp,
  cuaVerified: true,
  browserEnabled: true,
  chromeEnabled: true,
  chromeMcp,
  chromeSkillPath: "/plugins/chrome/SKILL.md",
  browserBackends: ["chrome", "iab"],
  sitesEnabled: true,
  sitesVersion: "0.1.34",
  configError: null,
};

describe("provider capability wire compatibility", () => {
  test("defaults a missing capability list from older or compact backends", () => {
    expect(
      normalizeProviderInfo({
        id: "opencode",
        display_name: "OpenCode",
        available: true,
        needs_node: false,
        models: [],
      }).capabilities,
    ).toEqual([]);
  });

  test("accepts provider-neutral special-tool capabilities on non-Codex providers", () => {
    const provider = normalizeProviderInfo({
      id: "claude_code",
      display_name: "Claude Code",
      available: true,
      needs_node: true,
      models: [],
      capabilities: [
        {
          id: "computer_use",
          state: "ready",
          version: "1.0.1000761",
          experimental: true,
          reason: "Available through a provider-neutral MCP adapter.",
        },
      ],
    });
    expect(provider.capabilities[0]).toMatchObject({
      id: "computer_use",
      state: "ready",
      version: "1.0.1000761",
    });
  });

  test("passes provider-neutral MCP servers through the Pure Bun ACP session seam", () => {
    const mcpServers = [computerMcp];

    expect(sessionRequestParams("/tmp/project", mcpServers)).toEqual({
      cwd: "/tmp/project",
      mcpServers,
    });
    expect(sessionRequestParams("/tmp/project", mcpServers, "claude-session")).toEqual({
      sessionId: "claude-session",
      cwd: "/tmp/project",
      mcpServers,
    });
  });

  test("projects portable host tools onto Claude without duplicating Codex-native tools", () => {
    const claude = projectProviderToolset(readyEvidence, "claude_code");
    expect(claude.mcpServers.map((server) => server.name)).toEqual(["computer-use", "node_repl"]);
    expect(claude.capabilities.find((item) => item.id === "computer_use")?.state).toBe("ready");
    expect(claude.capabilities.find((item) => item.id === "image_generation")?.state).toBe("unavailable");
    expect(claude.capabilities.find((item) => item.id === "sites")?.state).toBe("unavailable");
    expect(withProviderToolInstructions([{ type: "text", text: "hello" }], claude.instructions)[0])
      .toMatchObject({ type: "text" });

    const codex = projectProviderToolset(readyEvidence, "codex");
    expect(codex.mcpServers).toEqual([]);
    expect(codex.instructions).toEqual([]);
    expect(codex.capabilities.find((item) => item.id === "image_generation")?.state).toBe("ready");
  });

  test("forwards only the browser trust hash from the shell policy", () => {
    const server = stdioServer(
      "node_repl",
      { command: process.execPath, env: { BROWSER_USE_AVAILABLE_BACKENDS: "chrome" } },
      {
        NODE_REPL_TRUSTED_BROWSER_CLIENT_SHA256S: "abc123",
        SKY_PRIVATE_TOKEN: "must-not-cross-the-provider-boundary",
      },
    );
    expect(server?.env).toContainEqual({
      name: "NODE_REPL_TRUSTED_BROWSER_CLIENT_SHA256S",
      value: "abc123",
    });
    expect(server?.env.some((entry) => entry.name === "SKY_PRIVATE_TOKEN")).toBe(false);
  });
});
