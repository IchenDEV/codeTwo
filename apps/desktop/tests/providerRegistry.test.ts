import { describe, expect, test } from "bun:test";

import type { ProviderInfo } from "../src/bridge";
import { loadProviderRegistry } from "../src/providers/registry";

const grok: ProviderInfo = {
  id: "grok",
  display_name: "Grok",
  available: true,
  needs_node: false,
  models: [],
  capabilities: [],
};

describe("provider registry startup", () => {
  test("bounds a lost first desktop request and retries", async () => {
    let attempts = 0;
    const providers = await loadProviderRegistry(
      () => {
        attempts += 1;
        return attempts === 1 ? new Promise(() => {}) : Promise.resolve([grok]);
      },
      [0, 0],
      5,
    );

    expect(attempts).toBe(2);
    expect(providers).toEqual([grok]);
  });

  test("rejects an empty registry instead of presenting an empty picker", async () => {
    let attempts = 0;
    await expect(loadProviderRegistry(
      async () => {
        attempts += 1;
        return [];
      },
      [0, 0, 0],
      5,
    )).rejects.toThrow("empty registry");
    expect(attempts).toBe(3);
  });
});
