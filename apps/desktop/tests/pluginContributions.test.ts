import { describe, expect, test } from "bun:test";

import {
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
  spec_version: "1.0.0",
  standard: "agent_plugins" as const,
  standards: ["agent_plugins" as const],
  enabled: true,
  trusted: true,
  scope: "user" as const,
  counts: {
    skills: 0,
    subagents: 0,
    mcp_servers: 0,
    scaffolds: 0,
    commands: 0,
    hooks: 0,
    lsp_servers: 1,
    monitors: 0,
    apps: 0,
    scenes: 0,
    pipelines: 0,
  },
  scaffolds: [],
  extension_components: [],
  diagnostics: [],
  ui_contributions: uiSlots.map((slot, order) => ({
    id: `review-${order}`,
    slot,
    label: `Review ${order}`,
    description: "Run the review action.",
    command: "review.run",
    input: null,
    order,
  })),
  lsp_servers: [{
    id: "zls",
    languages: ["zig"],
    command: "zls",
    args: [],
    env: {},
  }],
};

function managed(status: "active" | "loading" | "disabled", effectiveEnabled = true) {
  return [{
    id: "bundle:review",
    name: "Review Tools",
    source: "bundle" as const,
    supportedScopes: ["user" as const],
    state: { effectiveEnabled, status },
  }];
}

describe("plugin UI and LSP contribution policy", () => {
  test("exposes only trusted, enabled, active bundle contributions", () => {
    const active = activePluginUiContributions([bundle], managed("active"));
    expect(Object.keys(active)).toEqual(uiSlots);
    for (const [order, slot] of uiSlots.entries()) {
      expect(active[slot])
        .toContainEqual(expect.objectContaining({ pluginId: "review", id: `review-${order}` }));
    }
    expect(activePluginLanguageServers([bundle], managed("active")))
      .toContainEqual(expect.objectContaining({ pluginId: "review", id: "zls" }));

    expect(Object.values(activePluginUiContributions([bundle], managed("loading"))).every(
      (contributions) => contributions.length === 0,
    )).toBe(true);
    expect(activePluginLanguageServers([{ ...bundle, trusted: false }], managed("active"))).toEqual([]);
    expect(activePluginLanguageServers([{ ...bundle, enabled: false }], managed("active"))).toEqual([]);
  });
});
