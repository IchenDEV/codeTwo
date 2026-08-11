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
});
