import { describe, expect, test } from "bun:test";

import { normalizeProviderInfo } from "../src/bridge";

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

  test("accepts the experimental Sites capability from current backends", () => {
    const provider = normalizeProviderInfo({
      id: "codex",
      display_name: "Codex",
      available: true,
      needs_node: true,
      models: [],
      capabilities: [
        {
          id: "sites",
          state: "unverified",
          version: "0.1.34",
          experimental: true,
        },
      ],
    });
    expect(provider.capabilities[0]).toMatchObject({
      id: "sites",
      state: "unverified",
      version: "0.1.34",
    });
  });
});
