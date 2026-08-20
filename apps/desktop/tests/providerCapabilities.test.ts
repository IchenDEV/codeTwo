import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { normalizeProviderInfo } from "../src/bridge";
import { sessionRequestParams, validateMcpTransports } from "../src/electrobun/host/acp";
import {
  loadConfiguredBrowserUse,
  loadConfiguredComputerUse,
  projectProviderToolset,
  saveBrowserUseSelection,
  saveComputerUseSelection,
  stdioServer,
  withProviderToolInstructions,
  type AcpMcpServer,
  type HostToolEvidence,
} from "../src/electrobun/host/providerTools";

const computerMcp: AcpMcpServer = {
  name: "codetwo-openai-computer-use",
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
  browserSkillPath: "/plugins/browser/SKILL.md",
  chromeSkillPath: "/plugins/chrome/SKILL.md",
  browserBackends: ["chrome", "iab"],
  sitesEnabled: true,
  sitesVersion: "0.1.34",
  configError: null,
  configuredComputerUse: [],
  computerUseSelections: {},
  computerUseBackends: [],
  hostToolsConfigErrors: [],
  configuredBrowserUse: [],
  browserUseSelections: {},
  browserUseBackends: [{
    id: "openai-browser",
    displayName: "OpenAI Browser / Chrome",
    available: true,
    reason: null,
    providers: [],
    excludeProviders: [],
  }],
  browserUseConfigErrors: [],
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

  test("accepts the Browser and Chrome plugin backends independently", () => {
    for (const evidence of [
      { ...readyEvidence, chromeEnabled: false, browserBackends: ["iab"] },
      { ...readyEvidence, browserEnabled: false, browserBackends: ["chrome"] },
    ]) {
      const tools = projectProviderToolset(evidence, "claude_code");
      expect(tools.mcpServers.map((server) => server.name)).toContain("node_repl");
      expect(tools.capabilities.find((item) => item.id === "chrome_browser")?.state)
        .not.toBe("unavailable");
    }
  });

  test("projects portable host tools onto Claude without duplicating Codex-native tools", () => {
    const claude = projectProviderToolset(readyEvidence, "claude_code");
    expect(claude.mcpServers.map((server) => server.name)).toEqual(["codetwo-openai-computer-use", "node_repl"]);
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

  test("loads Cua Driver and other explicitly enabled stdio computer-use backends", () => {
    const directory = mkdtempSync(join(tmpdir(), "codetwo-host-tools-"));
    try {
      writeFileSync(join(directory, "host-tools.json"), JSON.stringify({
        schema_version: 1,
        computer_use: [
          {
            id: "cua",
            enabled: true,
            display_name: "Cua Driver",
            providers: ["claude_code", "grok"],
            server: {
              name: "cua-driver",
              command: process.execPath,
              args: ["mcp"],
            },
          },
          {
            id: "disabled-brand",
            enabled: false,
            server: { command: "/not/used" },
          },
        ],
      }));

      const configured = loadConfiguredComputerUse(directory);
      expect(configured.errors).toEqual([]);
      expect(configured.bridges).toHaveLength(1);
      const evidence = {
        ...readyEvidence,
        hostPresent: false,
        configuredComputerUse: configured.bridges,
      };
      const claude = projectProviderToolset(evidence, "claude_code");
      expect(claude.mcpServers.map((server) => server.name)).toContain("cua-driver");
      expect(claude.capabilities.find((item) => item.id === "computer_use")?.reason)
        .toContain("Cua Driver");
      expect(projectProviderToolset(evidence, "codex").mcpServers).toEqual([]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test("supports remote computer-use MCP only when the ACP provider advertises its transport", () => {
    const server: AcpMcpServer = {
      name: "remote-computer",
      type: "http",
      url: "http://127.0.0.1:8000/mcp",
      headers: [],
    };
    expect(() => validateMcpTransports([server], {
      agentCapabilities: { mcpCapabilities: { http: true } },
    })).not.toThrow();
    expect(() => validateMcpTransports([server], { agentCapabilities: {} }))
      .toThrow("did not advertise");
  });

  test("fails the configured computer-use registry closed when any enabled backend is invalid", () => {
    const directory = mkdtempSync(join(tmpdir(), "codetwo-host-tools-invalid-"));
    try {
      writeFileSync(join(directory, "host-tools.json"), JSON.stringify({
        schema_version: 1,
        computer_use: [
          {
            id: "otherwise-valid",
            enabled: true,
            server: { command: process.execPath },
          },
          {
            id: "missing",
            enabled: true,
            server: { command: "definitely-not-a-real-c2-test-command" },
          },
        ],
      }));

      const configured = loadConfiguredComputerUse(directory);
      expect(configured.bridges).toEqual([]);
      expect(configured.errors.join("\n")).toContain("definitely-not-a-real-c2-test-command");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test("persists a provider choice and attaches only the selected backend", () => {
    const directory = mkdtempSync(join(tmpdir(), "codetwo-host-tools-selection-"));
    try {
      writeFileSync(join(directory, "host-tools.json"), JSON.stringify({
        schema_version: 1,
        computer_use: [
          {
            id: "first",
            enabled: true,
            server: { name: "first-computer", command: process.execPath },
          },
          {
            id: "second",
            enabled: false,
            server: { name: "second-computer", command: process.execPath },
          },
        ],
      }));

      const configured = loadConfiguredComputerUse(directory);
      const evidence = {
        ...readyEvidence,
        configuredComputerUse: configured.bridges,
        computerUseSelections: configured.selections,
        computerUseBackends: configured.backends,
      };
      const grokServers = projectProviderToolset(evidence, "grok").mcpServers.map((server) => server.name);
      expect(grokServers).not.toContain("second-computer");
      saveComputerUseSelection(directory, "claude_code", "second", evidence);
      const selected = loadConfiguredComputerUse(directory);
      const toolset = projectProviderToolset({
        ...evidence,
        configuredComputerUse: selected.bridges,
        computerUseSelections: selected.selections,
        computerUseBackends: selected.backends,
      }, "claude_code");

      expect(selected.selections.claude_code).toBe("second");
      expect(toolset.mcpServers.map((server) => server.name)).toEqual(["node_repl", "second-computer"]);

      saveComputerUseSelection(directory, "claude_code", "automatic", {
        ...evidence,
        configuredComputerUse: selected.bridges,
        computerUseSelections: selected.selections,
        computerUseBackends: selected.backends,
      });
      const automatic = loadConfiguredComputerUse(directory);
      const automaticToolset = projectProviderToolset({
        ...readyEvidence,
        hostPresent: false,
        configuredComputerUse: automatic.bridges,
        computerUseSelections: automatic.selections,
        computerUseBackends: automatic.backends,
      }, "claude_code");
      expect(automaticToolset.mcpServers.map((server) => server.name)).toEqual(["first-computer"]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test("selects OpenAI Browser or a configured browser MCP independently per provider", () => {
    const directory = mkdtempSync(join(tmpdir(), "codetwo-browser-tools-selection-"));
    try {
      writeFileSync(join(directory, "host-tools.json"), JSON.stringify({
        schema_version: 1,
        browser_use: [{
          id: "playwright",
          enabled: false,
          display_name: "Playwright MCP",
          server: { name: "playwright", command: process.execPath, args: ["server.js"] },
        }],
      }));

      const configured = loadConfiguredBrowserUse(directory);
      const evidence = {
        ...readyEvidence,
        configuredBrowserUse: configured.bridges,
        browserUseSelections: configured.selections,
        browserUseBackends: [...readyEvidence.browserUseBackends, ...configured.backends],
      };
      saveBrowserUseSelection(directory, "claude_code", "playwright", evidence);
      const selected = loadConfiguredBrowserUse(directory);
      const custom = projectProviderToolset({
        ...evidence,
        configuredBrowserUse: selected.bridges,
        browserUseSelections: selected.selections,
      }, "claude_code");
      expect(custom.mcpServers.map((server) => server.name)).toEqual([
        "codetwo-openai-computer-use",
        "playwright",
      ]);
      expect(custom.capabilities.find((item) => item.id === "chrome_browser")?.reason)
        .toContain("Playwright MCP");

      saveBrowserUseSelection(directory, "claude_code", "openai-browser", {
        ...evidence,
        configuredBrowserUse: selected.bridges,
        browserUseSelections: selected.selections,
      });
      const openAi = loadConfiguredBrowserUse(directory);
      const portable = projectProviderToolset({
        ...evidence,
        configuredBrowserUse: openAi.bridges,
        browserUseSelections: openAi.selections,
      }, "claude_code");
      expect(portable.mcpServers.map((server) => server.name)).toEqual([
        "codetwo-openai-computer-use",
        "node_repl",
      ]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
