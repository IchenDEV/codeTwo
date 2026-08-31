import { describe, expect, it } from "bun:test";

import {
  MODEL_PREFERENCES_STORAGE_KEY,
  hiddenModelsForProvider,
  loadModelPreferences,
  setModelHidden,
  showAllProviderModels,
  type ModelPreferencesStorage,
} from "../src/session/modelPreferences";

class MemoryStorage implements ModelPreferencesStorage {
  values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

describe("provider model preferences", () => {
  it("stores hidden models per provider and restores all without touching another provider", () => {
    const storage = new MemoryStorage();
    expect(setModelHidden("codex", "gpt-5.6-sol", true, storage)).toEqual(["gpt-5.6-sol"]);
    setModelHidden("claude_code", "opus", true, storage);
    expect(hiddenModelsForProvider("codex", storage)).toEqual(["gpt-5.6-sol"]);

    expect(showAllProviderModels("codex", storage)).toEqual([]);
    expect(hiddenModelsForProvider("codex", storage)).toEqual([]);
    expect(hiddenModelsForProvider("claude_code", storage)).toEqual(["opus"]);
  });

  it("deduplicates entries and removes the provider record when the final model is shown", () => {
    const storage = new MemoryStorage();
    setModelHidden("codex", "gpt-5.6-sol", true, storage);
    expect(setModelHidden("codex", "gpt-5.6-sol", true, storage)).toEqual(["gpt-5.6-sol"]);
    expect(setModelHidden("codex", "gpt-5.6-sol", false, storage)).toEqual([]);
    expect(loadModelPreferences(storage).providers.codex).toBeUndefined();
  });

  it("fails closed on malformed, stale, or prototype-bearing storage", () => {
    const storage = new MemoryStorage();
    storage.values.set(MODEL_PREFERENCES_STORAGE_KEY, "not json");
    expect(loadModelPreferences(storage).providers).toEqual({});

    storage.values.set(MODEL_PREFERENCES_STORAGE_KEY, JSON.stringify({
      version: 1,
      providers: {
        codex: { hidden: ["safe", "safe", 42, ""] },
        constructor: { hidden: ["unsafe"] },
      },
    }));
    expect(hiddenModelsForProvider("codex", storage)).toEqual(["safe"]);
    expect(hiddenModelsForProvider("constructor", storage)).toEqual([]);
  });
});
