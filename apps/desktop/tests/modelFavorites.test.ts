import { describe, expect, test } from "bun:test";

import {
  modelFavoritesStorageKey,
  favoritesForProvider,
  loadModelFavorites,
  toggleModelFavorite,
} from "../src/session/modelFavorites";
import type { ModelFavoritesStorage } from "../src/session/modelFavorites";

class MemoryStorage implements ModelFavoritesStorage {
  values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe("model favorites", () => {
  test("persists unique model identities independently for each provider", () => {
    const storage = new MemoryStorage();

    expect(toggleModelFavorite("opencode", "model-a", storage)).toEqual([
      "model-a",
    ]);
    expect(toggleModelFavorite("opencode", "model-b", storage)).toEqual([
      "model-a",
      "model-b",
    ]);
    expect(toggleModelFavorite("cursor", "model-a", storage)).toEqual([
      "model-a",
    ]);
    expect(toggleModelFavorite("opencode", "model-a", storage)).toEqual([
      "model-b",
    ]);

    expect(favoritesForProvider("opencode", storage)).toEqual(["model-b"]);
    expect(favoritesForProvider("cursor", storage)).toEqual(["model-a"]);
    expect(
      JSON.parse(storage.getItem(modelFavoritesStorageKey) ?? "null")
    ).toEqual({
      version: 1,
      providers: {
        opencode: ["model-b"],
        cursor: ["model-a"],
      },
    });
  });

  test("degrades corrupt, outdated, and partially invalid documents safely", () => {
    const storage = new MemoryStorage();
    storage.setItem(modelFavoritesStorageKey, "not json");
    expect(loadModelFavorites(storage).providers).toEqual({});

    storage.setItem(
      modelFavoritesStorageKey,
      JSON.stringify({ version: 0, providers: {} })
    );
    expect(loadModelFavorites(storage).providers).toEqual({});

    storage.setItem(
      modelFavoritesStorageKey,
      '{"version":1,"providers":{"codex":["gpt-5","gpt-5",42,""],"broken":"not-an-array","__proto__":["unsafe"]}}'
    );
    expect(loadModelFavorites(storage).providers).toEqual({ codex: ["gpt-5"] });
    expect(toggleModelFavorite("__proto__", "unsafe", storage)).toEqual([]);
  });

  test("keeps an in-memory toggle usable when storage writes fail", () => {
    const unavailable: ModelFavoritesStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("storage unavailable");
      },
    };
    expect(toggleModelFavorite("codex", "gpt-5", unavailable)).toEqual([
      "gpt-5",
    ]);
  });
});
