import { useEffect, useState } from "react";

export const MODEL_PREFERENCES_STORAGE_KEY = "codetwo.providerModelPreferences";

const MODEL_PREFERENCES_VERSION = 1;
const MODEL_PREFERENCES_EVENT = "codetwo:model-preferences-change";
const MAX_PROVIDERS = 64;
const MAX_HIDDEN_MODELS = 200;
const MAX_KEY_LENGTH = 512;
const RESERVED_PROVIDER_KEYS = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);

export interface ModelPreferencesStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface ProviderModelPreference {
  hidden: string[];
}

interface ModelPreferencesSnapshot {
  version: typeof MODEL_PREFERENCES_VERSION;
  providers: Record<string, ProviderModelPreference>;
}

interface ModelPreferencesChangeDetail {
  provider: string;
  hidden: string[];
}

function defaultStorage(): ModelPreferencesStorage | null {
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

function emptySnapshot(): ModelPreferencesSnapshot {
  return { version: MODEL_PREFERENCES_VERSION, providers: {} };
}

export function loadModelPreferences(
  storage: ModelPreferencesStorage | null = defaultStorage()
): ModelPreferencesSnapshot {
  if (!storage) return emptySnapshot();
  try {
    const raw = storage.getItem(MODEL_PREFERENCES_STORAGE_KEY);
    if (raw == null || raw === "") return emptySnapshot();
    const parsed = JSON.parse(raw) as unknown;
    if (parsed == null || typeof parsed !== "object") return emptySnapshot();
    const candidate = parsed as { version?: unknown; providers?: unknown };
    if (candidate.version !== MODEL_PREFERENCES_VERSION) return emptySnapshot();
    if (candidate.providers == null || typeof candidate.providers !== "object")
      return emptySnapshot();

    const providers: Record<string, ProviderModelPreference> = {};
    for (const [provider, preference] of Object.entries(
      candidate.providers
    ).slice(0, MAX_PROVIDERS)) {
      if (
        !isSafeProviderKey(provider) ||
        preference == null ||
        typeof preference !== "object"
      )
        continue;
      const { hidden } = preference as { hidden?: unknown };
      if (!Array.isArray(hidden)) continue;
      providers[provider] = {
        hidden: [
          ...new Set(hidden.filter(isSafeKey).slice(0, MAX_HIDDEN_MODELS)),
        ],
      };
    }
    return { version: MODEL_PREFERENCES_VERSION, providers };
  } catch {
    return emptySnapshot();
  }
}

export function hiddenModelsForProvider(
  provider: string,
  storage: ModelPreferencesStorage | null = defaultStorage()
): string[] {
  if (!isSafeProviderKey(provider)) return [];
  return loadModelPreferences(storage).providers[provider]?.hidden ?? [];
}

export function setModelHidden(
  provider: string,
  model: string,
  hidden: boolean,
  storage: ModelPreferencesStorage | null = defaultStorage()
): string[] {
  if (!isSafeProviderKey(provider) || !isSafeKey(model)) {
    return hiddenModelsForProvider(provider, storage);
  }
  const snapshot = loadModelPreferences(storage);
  const current = snapshot.providers[provider]?.hidden ?? [];
  const next = hidden
    ? [...new Set([...current, model])].slice(-MAX_HIDDEN_MODELS)
    : current.filter((candidate) => candidate !== model);
  if (next.length === 0) delete snapshot.providers[provider];
  else snapshot.providers[provider] = { hidden: next };
  if (storage) {
    try {
      storage.setItem(MODEL_PREFERENCES_STORAGE_KEY, JSON.stringify(snapshot));
    } catch {
      // The mounted UI still updates even if persistence is unavailable.
    }
  }
  return next;
}

export function showAllProviderModels(
  provider: string,
  storage: ModelPreferencesStorage | null = defaultStorage()
): string[] {
  if (!isSafeProviderKey(provider)) return [];
  const snapshot = loadModelPreferences(storage);
  delete snapshot.providers[provider];
  if (storage) {
    try {
      storage.setItem(MODEL_PREFERENCES_STORAGE_KEY, JSON.stringify(snapshot));
    } catch {
      // The mounted UI still updates even if persistence is unavailable.
    }
  }
  return [];
}

export function useProviderModelPreferences(provider: string) {
  const [hidden, setHidden] = useState(() => hiddenModelsForProvider(provider));

  useEffect(() => {
    const syncFromStorage = () => setHidden(hiddenModelsForProvider(provider));
    const syncFromPreference = (event: Event) => {
      const { detail } = event as CustomEvent<ModelPreferencesChangeDetail>;
      if (detail?.provider === provider) setHidden(detail.hidden);
    };
    syncFromStorage();
    if (typeof window === "undefined") return;
    window.addEventListener(MODEL_PREFERENCES_EVENT, syncFromPreference);
    window.addEventListener("storage", syncFromStorage);
    return () => {
      window.removeEventListener(MODEL_PREFERENCES_EVENT, syncFromPreference);
      window.removeEventListener("storage", syncFromStorage);
    };
  }, [provider]);

  const publish = (next: string[]) => {
    setHidden(next);
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent<ModelPreferencesChangeDetail>(MODEL_PREFERENCES_EVENT, {
          detail: { provider, hidden: next },
        })
      );
    }
  };

  const setVisible = (model: string, visible: boolean) => {
    publish(setModelHidden(provider, model, !visible));
  };

  const showAll = () => {
    publish(showAllProviderModels(provider));
  };

  return {
    hidden: new Set(hidden),
    setVisible,
    showAll,
  };
}
