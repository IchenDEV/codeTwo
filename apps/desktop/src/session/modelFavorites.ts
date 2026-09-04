import { useCallback, useEffect, useMemo, useState } from "react";

export const MODEL_FAVORITES_STORAGE_KEY = "codetwo.modelFavorites";

const MODEL_FAVORITES_VERSION = 1;
const MODEL_FAVORITES_EVENT = "codetwo:model-favorites-change";
const MAX_PROVIDERS = 64;
const MAX_FAVORITES_PER_PROVIDER = 200;
const MAX_KEY_LENGTH = 512;
const RESERVED_PROVIDER_KEYS = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);

interface ModelFavoritesChangeDetail {
  provider: string;
  favorites: string[];
}

export interface ModelFavoritesStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

interface ModelFavoritesSnapshot {
  version: typeof MODEL_FAVORITES_VERSION;
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
    value.length <= MAX_KEY_LENGTH
  );
}

function isSafeProviderKey(value: unknown): value is string {
  return isSafeKey(value) && !RESERVED_PROVIDER_KEYS.has(value);
}

function emptySnapshot(): ModelFavoritesSnapshot {
  return { version: MODEL_FAVORITES_VERSION, providers: {} };
}

export function loadModelFavorites(
  storage: ModelFavoritesStorage | null = defaultStorage()
): ModelFavoritesSnapshot {
  if (!storage) {
    return emptySnapshot();
  }
  try {
    const raw = storage.getItem(MODEL_FAVORITES_STORAGE_KEY);
    if (!raw) {
      return emptySnapshot();
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return emptySnapshot();
    }
    const candidate = parsed as { version?: unknown; providers?: unknown };
    if (candidate.version !== MODEL_FAVORITES_VERSION) {
      return emptySnapshot();
    }
    if (!candidate.providers || typeof candidate.providers !== "object") {
      return emptySnapshot();
    }

    const providers: Record<string, string[]> = {};
    for (const [provider, favorites] of Object.entries(
      candidate.providers
    ).slice(0, MAX_PROVIDERS)) {
      if (!isSafeProviderKey(provider) || !Array.isArray(favorites)) {
        continue;
      }
      providers[provider] = [
        ...new Set(
          favorites.filter(isSafeKey).slice(0, MAX_FAVORITES_PER_PROVIDER)
        ),
      ];
    }
    return { version: MODEL_FAVORITES_VERSION, providers };
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
    : [...current, model].slice(-MAX_FAVORITES_PER_PROVIDER);
  snapshot.providers[provider] = next;
  if (storage) {
    try {
      storage.setItem(MODEL_FAVORITES_STORAGE_KEY, JSON.stringify(snapshot));
    } catch {
      // Keep the preference usable for this mounted picker when storage is unavailable.
    }
  }
  return next;
}

/**
Keep every visible picker in this renderer synchronized without lifting a local preference.
*/
export function useProviderModelFavorites(provider: string) {
  const [favorites, setFavorites] = useState(() =>
    favoritesForProvider(provider)
  );

  useEffect(() => {
    const syncFromStorage = () => {
      setFavorites(favoritesForProvider(provider));
    };
    const syncFromPicker = (event: Event) => {
      const { detail } = event as CustomEvent<ModelFavoritesChangeDetail>;
      if (detail?.provider === provider) {
        setFavorites(detail.favorites);
      }
    };
    syncFromStorage();
    if (typeof window === "undefined") {
      return;
    }
    window.addEventListener(MODEL_FAVORITES_EVENT, syncFromPicker);
    window.addEventListener("storage", syncFromStorage);
    return () => {
      window.removeEventListener(MODEL_FAVORITES_EVENT, syncFromPicker);
      window.removeEventListener("storage", syncFromStorage);
    };
  }, [provider]);

  const toggle = useCallback(
    (model: string) => {
      const next = toggleModelFavorite(provider, model);
      setFavorites(next);
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent<ModelFavoritesChangeDetail>(MODEL_FAVORITES_EVENT, {
            detail: { provider, favorites: next },
          })
        );
      }
    },
    [provider]
  );

  return {
    favorites: useMemo(() => new Set(favorites), [favorites]),
    toggle,
  };
}
