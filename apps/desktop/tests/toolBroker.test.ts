import { describe, expect, test } from "bun:test";

import {
  ToolBroker,
  type BrokerContext,
} from "../../../packages/tool-broker/src";

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
    browserAccessBlockerMcp: {
      name: "node_repl",
      command: "/codetwo/tool-broker",
      args: ["--empty-mcp"],
      env: [],
    },
    agentBrowserAccessEnabled: true,
    browserBackends: ["chrome", "iab"],
    sitesEnabled: true,
    sitesVersion: "0.1.34",
    configError: null,
    configuredComputerUse: [
      {
        id: "cua",
        enabled: true,
        displayName: "Cua Driver",
        version: "0.4.0",
        providers: ["claude_code"],
        excludeProviders: [],
        server: {
          name: "cua-driver",
          command: "/usr/local/bin/cua-driver",
          args: ["mcp"],
          env: [],
        },
      },
    ],
    computerUseSelections: { "*": "cua" },
    computerUseBackends: [
      {
        id: "cua",
        displayName: "Cua Driver",
        available: true,
        reason: null,
        providers: ["claude_code"],
        excludeProviders: [],
      },
    ],
    hostToolsConfigErrors: [],
    configuredBrowserUse: [
      {
        id: "playwright",
        enabled: true,
        displayName: "Playwright MCP",
        version: "1.0.0",
        providers: ["claude_code"],
        excludeProviders: [],
        server: {
          name: "playwright",
          command: "/usr/local/bin/playwright-mcp",
          args: [],
          env: [],
        },
      },
    ],
    browserUseSelections: { "*": "playwright" },
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

    expect(claude.mcpServers.map((server) => server.name)).toEqual([
      "cua-driver",
      "playwright",
    ]);
    expect(claude.nativeCapabilities).toEqual([]);
    expect(claude.mcpServers.map((server) => server.name)).not.toContain(
      "node_repl"
    );

    expect(codex.mcpServers).toEqual([]);
    expect(codex.browserAccessEnabled).toBe(true);
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
    expect(
      Object.isFrozen(context.evidence.configuredComputerUse[0].server)
    ).toBe(false);
    expect(
      Object.isFrozen(context.evidence.configuredComputerUse[0].providers)
    ).toBe(false);
    expect(
      Object.isFrozen(context.evidence.computerUseBackends[0].providers)
    ).toBe(false);
  });

  test("withholds every browser route while retaining a credential-free Codex blocker", () => {
    const denied = {
      evidence: { ...context.evidence, agentBrowserAccessEnabled: false },
    };
    const broker = new ToolBroker();
    const codex = broker.resolve({ providerId: "codex", context: denied });
    const claude = broker.resolve({
      providerId: "claude_code",
      context: denied,
    });

    expect(broker.catalog(denied).browserUse.accessEnabled).toBe(false);
    expect(codex.browserAccessEnabled).toBe(false);
    expect(codex.nativeCapabilities).not.toContain("chrome_browser");
    expect(codex.nativeCapabilities).not.toContain("computer_use");
    expect(codex.mcpServers).toEqual([
      context.evidence.browserAccessBlockerMcp,
    ]);
    expect(codex.instructions.join("\n")).not.toContain("browser MCP");
    expect(
      codex.capabilities.find((item) => item.id === "chrome_browser")
    ).toMatchObject({
      state: "unavailable",
      reason: "Agent browser access is disabled.",
    });
    expect(claude.mcpServers.map((server) => server.name)).not.toContain(
      "playwright"
    );
  });
});
