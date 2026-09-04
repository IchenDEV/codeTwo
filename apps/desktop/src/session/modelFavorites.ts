import { useEffect, useState } from "react";

import { fromDomAny } from "../lib/ipcResult";
import { asJsonObject } from "../lib/jsonValue";

export const modelFavoritesStorageKey = "codetwo.modelFavorites";

const modelFavoritesVersion = 1;
const modelFavoritesEvent = "codetwo:model-favorites-change";
const maxProviders = 64;
const maxFavoritesPerProvider = 200;
const maxKeyLength = 512;
const reservedProviderKeys = new Set(["__proto__", "constructor", "prototype"]);

interface ModelFavoritesChangeDetail {
  provider: string;
  favorites: string[];
}

export interface ModelFavoritesStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

interface ModelFavoritesSnapshot {
  version: typeof modelFavoritesVersion;
  providers: Record<string, string[]>;
}

function defaultStorage(): ModelFavoritesStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function isSafeKey(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maxKeyLength
  );
}

function isSafeProviderKey(value: unknown): value is string {
  return isSafeKey(value) && !reservedProviderKeys.has(value);
}

function emptySnapshot(): ModelFavoritesSnapshot {
  return { providers: {}, version: modelFavoritesVersion };
}

export function loadModelFavorites(
  storage: ModelFavoritesStorage | null = defaultStorage()
): ModelFavoritesSnapshot {
  if (!storage) {
    return emptySnapshot();
  }
  try {
    const raw = storage.getItem(modelFavoritesStorageKey);
    if (raw == null || raw === "") {
      return emptySnapshot();
    }
    const parsed = JSON.parse(raw) as unknown;
    if (parsed == null || typeof parsed !== "object") {
      return emptySnapshot();
    }
    const candidate = parsed as { version?: unknown; providers?: unknown };
    if (candidate.version !== modelFavoritesVersion) {
      return emptySnapshot();
    }
    if (
      candidate.providers == null ||
      typeof candidate.providers !== "object"
    ) {
      return emptySnapshot();
    }

    const providers: Record<string, string[]> = {};
    for (const [provider, favorites] of Object.entries(
      candidate.providers
    ).slice(0, maxProviders)) {
      if (!isSafeProviderKey(provider) || !Array.isArray(favorites)) {
        continue;
      }
      providers[provider] = [
        ...new Set(
          favorites.filter(isSafeKey).slice(0, maxFavoritesPerProvider)
        ),
      ];
    }
    return { providers, version: modelFavoritesVersion };
  } catch {
    return emptySnapshot();
  }
}

export function favoritesForProvider(
  provider: string,
  storage: ModelFavoritesStorage | null = defaultStorage()
): string[] {
  if (!isSafeProviderKey(provider)) {
    return [];
  }
  return loadModelFavorites(storage).providers[provider] ?? [];
}

export function toggleModelFavorite(
  provider: string,
  model: string,
  storage: ModelFavoritesStorage | null = defaultStorage()
): string[] {
  if (!isSafeProviderKey(provider) || !isSafeKey(model)) {
    return favoritesForProvider(provider, storage);
  }
  const snapshot = loadModelFavorites(storage);
  const current = snapshot.providers[provider] ?? [];
  const next = current.includes(model)
    ? current.filter((favorite) => favorite !== model)
    : [...current, model].slice(-maxFavoritesPerProvider);
  snapshot.providers[provider] = next;
  if (storage) {
    try {
      storage.setItem(modelFavoritesStorageKey, JSON.stringify(snapshot));
    } catch {
      // Keep the preference usable for this mounted picker when storage is unavailable.
    }
  }
  return next;
}

export function useProviderModelFavorites(provider: string) {
  const [favorites, setFavorites] = useState(() =>
    favoritesForProvider(provider)
  );

  useEffect(() => {
    const syncFromStorage = () => {
      setFavorites(favoritesForProvider(provider));
    };
    const syncFromPicker = (event: Event) => {
      const detail = asJsonObject(
        fromDomAny(event instanceof CustomEvent ? event.detail : undefined)
      );
      if (
        detail != null &&
        detail.provider === provider &&
        Array.isArray(detail.favorites) &&
        detail.favorites.every((entry) => typeof entry === "string")
      ) {
        setFavorites(detail.favorites);
      }
    };
    syncFromStorage();
    if (typeof window === "undefined") {
      return;
    }
    window.addEventListener(modelFavoritesEvent, syncFromPicker);
    window.addEventListener("storage", syncFromStorage);
    return () => {
      window.removeEventListener(modelFavoritesEvent, syncFromPicker);
      window.removeEventListener("storage", syncFromStorage);
    };
  }, [provider]);

  const toggle = (model: string) => {
    const next = toggleModelFavorite(provider, model);
    setFavorites(next);
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent<ModelFavoritesChangeDetail>(modelFavoritesEvent, {
          detail: { favorites: next, provider },
        })
      );
    }
  };

  return {
    favorites: new Set(favorites),
    toggle,
  };
}
