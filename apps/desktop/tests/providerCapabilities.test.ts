import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { normalizeProviderInfo } from "../src/bridge";
import { sessionRequestParams, validateMcpTransports } from "../src/electrobun/host/acp";
import {
  detectHostToolEvidence,
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
    providers: ["codex"],
    excludeProviders: [],
  }],
  browserUseConfigErrors: [],
};

describe("provider capability wire compatibility", () => {
  test("publishes the built-in backend catalog with the correct provider scopes", () => {
    const directory = mkdtempSync(join(tmpdir(), "codetwo-host-tools-catalog-"));
    try {
      const evidence = detectHostToolEvidence({}, directory);
      expect(evidence.computerUseBackends.find((backend) => backend.id === "cua")?.providers)
        .toEqual([]);
      expect(evidence.browserUseBackends.find((backend) => backend.id === "openai-browser")?.providers)
        .toEqual(["codex"]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

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

  test("keeps the Browser and Chrome plugin backends native to Codex", () => {
    for (const evidence of [
      { ...readyEvidence, chromeEnabled: false, browserBackends: ["iab"] },
      { ...readyEvidence, browserEnabled: false, browserBackends: ["chrome"] },
    ]) {
      const codex = projectProviderToolset(evidence, "codex");
      expect(codex.mcpServers).toEqual([]);
      expect(codex.capabilities.find((item) => item.id === "chrome_browser")?.state)
        .not.toBe("unavailable");

      const claude = projectProviderToolset(evidence, "claude_code");
      expect(claude.mcpServers.map((server) => server.name)).not.toContain("node_repl");
      expect(claude.capabilities.find((item) => item.id === "chrome_browser")?.state)
        .toBe("unavailable");
    }
  });

  test("projects portable host tools onto Claude without duplicating Codex-native tools", () => {
    const claude = projectProviderToolset(readyEvidence, "claude_code");
    expect(claude.mcpServers.map((server) => server.name)).toEqual(["codetwo-openai-computer-use"]);
    expect(claude.capabilities.find((item) => item.id === "computer_use")?.state).toBe("ready");
    expect(claude.capabilities.find((item) => item.id === "image_generation")?.state).toBe("unavailable");
    expect(claude.capabilities.find((item) => item.id === "sites")?.state).toBe("unavailable");
    expect(claude.capabilities.find((item) => item.id === "chrome_browser")?.state).toBe("unavailable");
    expect(claude.capabilities.find((item) => item.id === "chrome_browser")?.reason)
      .toContain("Codex-native");
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
        computer_use_selection: { claude_code: "second" },
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

  test("persists one global choice and attaches the selected backend across providers", () => {
    const directory = mkdtempSync(join(tmpdir(), "codetwo-host-tools-selection-"));
    try {
      writeFileSync(join(directory, "host-tools.json"), JSON.stringify({
        schema_version: 1,
        computer_use_selection: { claude_code: "second" },
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
      expect(configured.selections).toEqual({});
      const evidence = {
        ...readyEvidence,
        configuredComputerUse: configured.bridges,
        computerUseSelections: configured.selections,
        computerUseBackends: configured.backends,
      };
      const grokServers = projectProviderToolset(evidence, "grok").mcpServers.map((server) => server.name);
      expect(grokServers).not.toContain("second-computer");
      saveComputerUseSelection(directory, "second", evidence);
      const selected = loadConfiguredComputerUse(directory);
      const selectedEvidence = {
        ...evidence,
        configuredComputerUse: selected.bridges,
        computerUseSelections: selected.selections,
        computerUseBackends: selected.backends,
      };
      const claudeToolset = projectProviderToolset(selectedEvidence, "claude_code");
      const grokToolset = projectProviderToolset(selectedEvidence, "grok");

      expect(selected.selections).toEqual({ "*": "second" });
      expect(claudeToolset.mcpServers.map((server) => server.name)).toEqual(["second-computer"]);
      expect(grokToolset.mcpServers.map((server) => server.name)).toEqual(["second-computer"]);

      saveComputerUseSelection(directory, "automatic", {
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

  test("persists one Browser Use choice and resolves it across compatible providers", () => {
    const directory = mkdtempSync(join(tmpdir(), "codetwo-browser-tools-selection-"));
    try {
      writeFileSync(join(directory, "host-tools.json"), JSON.stringify({
        schema_version: 1,
        browser_use_selection: { claude_code: "playwright" },
        browser_use: [{
          id: "playwright",
          enabled: false,
          display_name: "Playwright MCP",
          server: { name: "playwright", command: process.execPath, args: ["server.js"] },
        }],
      }));

      const configured = loadConfiguredBrowserUse(directory);
      expect(configured.selections).toEqual({});
      const evidence = {
        ...readyEvidence,
        configuredBrowserUse: configured.bridges,
        browserUseSelections: configured.selections,
        browserUseBackends: [...readyEvidence.browserUseBackends, ...configured.backends],
      };
      saveBrowserUseSelection(directory, "playwright", evidence);
      const selected = loadConfiguredBrowserUse(directory);
      const selectedEvidence = {
        ...evidence,
        configuredBrowserUse: selected.bridges,
        browserUseSelections: selected.selections,
      };
      const claude = projectProviderToolset(selectedEvidence, "claude_code");
      const grok = projectProviderToolset(selectedEvidence, "grok");
      expect(selected.selections).toEqual({ "*": "playwright" });
      expect(claude.mcpServers.map((server) => server.name)).toEqual([
        "codetwo-openai-computer-use",
        "playwright",
      ]);
      expect(grok.mcpServers.map((server) => server.name)).toContain("playwright");
      expect(claude.capabilities.find((item) => item.id === "chrome_browser")?.reason)
        .toContain("Playwright MCP");

      saveBrowserUseSelection(directory, "openai-browser", selectedEvidence);
      const openAi = loadConfiguredBrowserUse(directory);
      const openAiEvidence = {
        ...evidence,
        configuredBrowserUse: openAi.bridges,
        browserUseSelections: openAi.selections,
      };
      const native = projectProviderToolset(openAiEvidence, "codex");
      expect(native.mcpServers).toEqual([]);
      expect(native.capabilities.find((item) => item.id === "chrome_browser")?.state)
        .not.toBe("unavailable");
      const unsupported = projectProviderToolset(openAiEvidence, "claude_code");
      expect(unsupported.mcpServers.map((server) => server.name)).not.toContain("playwright");
      expect(unsupported.capabilities.find((item) => item.id === "chrome_browser")?.state)
        .toBe("unavailable");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
