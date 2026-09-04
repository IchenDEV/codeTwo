import { describe, expect, test } from "bun:test";

import {
  activePluginConnectorContributions,
  activePluginLanguageServers,
  activePluginUiContributions,
} from "../src/plugins/contributions";

const uiSlots = [
  "rail.features",
  "session.header",
  "transcript.before",
  "composer.above",
  "composer.toolbar",
] as const;

const bundle = {
  id: "review",
  name: "Review Tools",
  version: "1.0.0",
  description: "Review this workspace.",
  author: "C2",
  source: "Test",
  repository: "local",
  standard_version: "1.2.0",
  enabled: true,
  trusted: true,
  scope: "user" as const,
  counts: {
    skills: 0,
    subagents: 0,
    mcp_servers: 0,
    scaffolds: 0,
    commands: 0,
    runtime_commands: 2,
    hooks: 0,
    lsp_servers: 1,
    monitors: 0,
    apps: 0,
    ui: uiSlots.length,
    connectors: 1,
    scenes: 0,
    pipelines: 0,
    runtime: 1,
  },
  scaffolds: [],
  extension_components: [],
  diagnostics: [],
  runtime_commands: ["review.run", "review.connector"].map((id) => ({
    id,
    title: id,
    description: "",
    argsSchema: null,
  })),
  ui_contributions: uiSlots.map((slot, order) => ({
    id: `review-${order}`,
    slot,
    label: `Review ${order}`,
    description: "Run the review action.",
    command: "review.run",
    input: null,
    order,
  })),
  connector_contributions: [
    {
      id: "workspace",
      provider: "test-chat",
      command: "review.connector",
      capabilities: ["conversations" as const],
    },
  ],
  lsp_servers: [
    {
      id: "zls",
      languages: ["zig"],
      command: "zls",
      args: [],
      env: {},
    },
  ],
};

function managed(
  status: "active" | "loading" | "disabled",
  effectiveEnabled = true
) {
  return [
    {
      id: "bundle:review",
      name: "Review Tools",
      source: "bundle" as const,
      supportedScopes: ["user" as const],
      state: { effectiveEnabled, status },
    },
  ];
}

describe("plugin UI and LSP contribution policy", () => {
  test("exposes only trusted, enabled, active bundle contributions", () => {
    const active = activePluginUiContributions([bundle], managed("active"));
    expect(Object.keys(active)).toEqual(uiSlots);
    for (const [order, slot] of uiSlots.entries()) {
      expect(active[slot]).toContainEqual(
        expect.objectContaining({ pluginId: "review", id: `review-${order}` })
      );
    }
    expect(
      activePluginLanguageServers([bundle], managed("active"))
    ).toContainEqual(
      expect.objectContaining({ pluginId: "review", id: "zls" })
    );
    expect(
      activePluginConnectorContributions([bundle], managed("active"))
    ).toContainEqual(
      expect.objectContaining({ pluginId: "review", id: "workspace" })
    );

    expect(
      Object.values(
        activePluginUiContributions([bundle], managed("loading"))
      ).every((contributions) => contributions.length === 0)
    ).toBe(true);
    expect(
      activePluginLanguageServers(
        [{ ...bundle, trusted: false }],
        managed("active")
      )
    ).toEqual([]);
    expect(
      activePluginLanguageServers(
        [{ ...bundle, enabled: false }],
        managed("active")
      )
    ).toEqual([]);
    expect(
      activePluginConnectorContributions([bundle], managed("loading"))
    ).toEqual([]);
  });

  test("applies component policy to UI actions", () => {
    const components = [
      {
        id: "bundle:review:ui:review-1",
        pluginId: "bundle:review",
        pluginName: "Review Tools",
        name: "Review 1",
        kind: "uiAction",
        slot: "session.header",
        source: "bundle" as const,
        supportedScopes: ["user" as const],
        state: { effectiveEnabled: false, status: "disabled" as const },
      },
    ];
    const active = activePluginUiContributions(
      [bundle],
      managed("active"),
      components
    );
    expect(active["session.header"]).toEqual([]);
    expect(active["rail.features"]).toHaveLength(1);
  });
});
