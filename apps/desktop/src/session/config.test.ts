import { describe, expect, test } from "bun:test";

import { memoryPresetsForProvider } from "./config";

describe("memoryPresetsForProvider", () => {
  test("keeps inherited recall out of Codex by default and exposes explicit opt-in", () => {
    const presets = memoryPresetsForProvider("codex");

    expect(presets[0]).toEqual({
      id: "codex_default",
      read: "inherit",
      write: "inherit",
      isDefault: true,
    });
    expect(presets.find((preset) => preset.id === "standard")).toEqual({
      id: "standard",
      read: "allow",
      write: "allow",
    });
  });

  test("preserves the inherited standard preset for other providers", () => {
    expect(memoryPresetsForProvider("claude")[0]).toEqual({
      id: "standard",
      read: "inherit",
      write: "inherit",
      isDefault: true,
    });
  });
});
