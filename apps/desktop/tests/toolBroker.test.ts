import { describe, expect, test } from "bun:test";

import { ToolBroker, type BrokerContext } from "../../../packages/tool-broker/src";

const context: BrokerContext = {
  evidence: {
    hostPresent: true,
    hostVerified: true,
    hostVersion: "26.803.41515",
    computerEnabled: true,
    computerVersion: "1.0.1000761",
    computerMcp: {
      name: "codetwo-openai-computer-use",
      command: "/plugins/computer-use-client-launcher",
      args: ["mcp"],
      env: [],
    },
    cuaVerified: true,
    browserEnabled: true,
    chromeEnabled: true,
    chromeMcp: {
      name: "node_repl",
      command: "/private/node_repl",
      args: [],
      env: [],
    },
    browserBackends: ["chrome", "iab"],
    sitesEnabled: true,
    sitesVersion: "0.1.34",
    configError: null,
    configuredComputerUse: [{
      id: "cua",
      enabled: true,
      displayName: "Cua Driver",
      version: "0.4.0",
      providers: ["claude_code"],
      excludeProviders: [],
      server: { name: "cua-driver", command: "/usr/local/bin/cua-driver", args: ["mcp"], env: [] },
    }],
    computerUseSelections: { claude_code: "cua" },
    computerUseBackends: [{
      id: "cua",
      displayName: "Cua Driver",
      available: true,
      reason: null,
      providers: ["claude_code"],
      excludeProviders: [],
    }],
    hostToolsConfigErrors: [],
    configuredBrowserUse: [{
      id: "playwright",
      enabled: true,
      displayName: "Playwright MCP",
      version: "1.0.0",
      providers: ["claude_code"],
      excludeProviders: [],
      server: { name: "playwright", command: "/usr/local/bin/playwright-mcp", args: [], env: [] },
    }],
    browserUseSelections: { claude_code: "playwright" },
    browserUseBackends: [
      {
        id: "openai-browser",
        displayName: "OpenAI Browser / Chrome",
        available: true,
        reason: null,
        providers: ["codex"],
        excludeProviders: [],
      },
      {
        id: "playwright",
        displayName: "Playwright MCP",
        available: true,
        reason: null,
        providers: ["claude_code"],
        excludeProviders: [],
      },
    ],
    browserUseConfigErrors: [],
  },
};

describe("provider-neutral Tool Broker", () => {
  test("keeps provider-native tools private while resolving portable MCP adapters", () => {
    const broker = new ToolBroker();
    const catalog = broker.catalog(context);
    const claude = broker.resolve({ providerId: "claude_code", context });
    const codex = broker.resolve({ providerId: "codex", context });

    expect(claude.mcpServers.map((server) => server.name)).toEqual(["cua-driver", "playwright"]);
    expect(claude.nativeCapabilities).toEqual([]);
    expect(claude.mcpServers.map((server) => server.name)).not.toContain("node_repl");

    expect(codex.mcpServers).toEqual([]);
    expect(codex.nativeCapabilities).toEqual([
      "image_generation",
      "computer_use",
      "chrome_browser",
      "sites",
    ]);
    expect(Object.isFrozen(codex)).toBe(true);
    expect(Object.isFrozen(codex.mcpServers)).toBe(true);
    expect(Object.isFrozen(catalog.computerUse.backends)).toBe(true);
    expect(Object.isFrozen(context.evidence.computerMcp)).toBe(false);
    expect(Object.isFrozen(context.evidence.configuredComputerUse[0].server)).toBe(false);
    expect(Object.isFrozen(context.evidence.configuredComputerUse[0].providers)).toBe(false);
    expect(Object.isFrozen(context.evidence.computerUseBackends[0].providers)).toBe(false);
  });
});
