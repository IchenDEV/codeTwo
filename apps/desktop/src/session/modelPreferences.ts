import { useEffect, useState } from "react";

import { fromDomAny } from "../lib/ipcResult";
import { asJsonObject } from "../lib/jsonValue";

export const modelPreferencesStorageKey = "codetwo.providerModelPreferences";

const modelPreferencesVersion = 1;
const modelPreferencesEvent = "codetwo:model-preferences-change";
const maxProviders = 64;
const maxHiddenModels = 200;
const maxKeyLength = 512;
const reservedProviderKeys = new Set(["__proto__", "constructor", "prototype"]);

export interface ModelPreferencesStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

interface ProviderModelPreference {
  hidden: string[];
}

interface ModelPreferencesSnapshot {
  version: typeof modelPreferencesVersion;
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
    value.length <= maxKeyLength
  );
}

function isSafeProviderKey(value: unknown): value is string {
  return isSafeKey(value) && !reservedProviderKeys.has(value);
}

function emptySnapshot(): ModelPreferencesSnapshot {
  return { providers: {}, version: modelPreferencesVersion };
}

export function loadModelPreferences(
  storage: ModelPreferencesStorage | null = defaultStorage()
): ModelPreferencesSnapshot {
  if (!storage) {
    return emptySnapshot();
  }
  try {
    const raw = storage.getItem(modelPreferencesStorageKey);
    if (raw == null || raw === "") {
      return emptySnapshot();
    }
    const parsed = JSON.parse(raw) as unknown;
    if (parsed == null || typeof parsed !== "object") {
      return emptySnapshot();
    }
    const candidate = parsed as { version?: unknown; providers?: unknown };
    if (candidate.version !== modelPreferencesVersion) {
      return emptySnapshot();
    }
    if (
      candidate.providers == null ||
      typeof candidate.providers !== "object"
    ) {
      return emptySnapshot();
    }

    const providers: Record<string, ProviderModelPreference> = {};
    for (const [provider, preference] of Object.entries(
      candidate.providers
    ).slice(0, maxProviders)) {
      const preferenceRecord = asJsonObject(preference);
      if (!isSafeProviderKey(provider) || preferenceRecord == null) {
        continue;
      }
      const { hidden } = preferenceRecord;
      if (!Array.isArray(hidden)) {
        continue;
      }
      providers[provider] = {
        hidden: [
          ...new Set(hidden.filter(isSafeKey).slice(0, maxHiddenModels)),
        ],
      };
    }
    return { providers, version: modelPreferencesVersion };
  } catch {
    return emptySnapshot();
  }
}

export function hiddenModelsForProvider(
  provider: string,
  storage: ModelPreferencesStorage | null = defaultStorage()
): string[] {
  if (!isSafeProviderKey(provider)) {
    return [];
  }
  return loadModelPreferences(storage).providers[provider]?.hidden ?? [];
}

export function setModelHidden(
  provider: string,
  model: string,
  isHidden: boolean,
  storage: ModelPreferencesStorage | null = defaultStorage()
): string[] {
  if (!isSafeProviderKey(provider) || !isSafeKey(model)) {
    return hiddenModelsForProvider(provider, storage);
  }
  const snapshot = loadModelPreferences(storage);
  const current = snapshot.providers[provider]?.hidden ?? [];
  const next = isHidden
    ? [...new Set([...current, model])].slice(-maxHiddenModels)
    : current.filter((candidate) => candidate !== model);
  if (next.length === 0) {
    delete snapshot.providers[provider];
  } else {
    snapshot.providers[provider] = { hidden: next };
  }
  if (storage) {
    try {
      storage.setItem(modelPreferencesStorageKey, JSON.stringify(snapshot));
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
  if (!isSafeProviderKey(provider)) {
    return [];
  }
  const snapshot = loadModelPreferences(storage);
  delete snapshot.providers[provider];
  if (storage) {
    try {
      storage.setItem(modelPreferencesStorageKey, JSON.stringify(snapshot));
    } catch {
      // The mounted UI still updates even if persistence is unavailable.
    }
  }
  return [];
}

export function useProviderModelPreferences(provider: string) {
  const [hidden, setHidden] = useState(() => hiddenModelsForProvider(provider));

  useEffect(() => {
    const syncFromStorage = () => {
      setHidden(hiddenModelsForProvider(provider));
    };
    const syncFromPreference = (event: Event) => {
      const detail = asJsonObject(
        fromDomAny(event instanceof CustomEvent ? event.detail : undefined)
      );
      if (
        detail != null &&
        detail.provider === provider &&
        Array.isArray(detail.hidden) &&
        detail.hidden.every((entry) => typeof entry === "string")
      ) {
        setHidden(detail.hidden);
      }
    };
    syncFromStorage();
    if (typeof window === "undefined") {
      return;
    }
    window.addEventListener(modelPreferencesEvent, syncFromPreference);
    window.addEventListener("storage", syncFromStorage);
    return () => {
      window.removeEventListener(modelPreferencesEvent, syncFromPreference);
      window.removeEventListener("storage", syncFromStorage);
    };
  }, [provider]);

  const publish = (next: string[]) => {
    setHidden(next);
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent<ModelPreferencesChangeDetail>(modelPreferencesEvent, {
          detail: { hidden: next, provider },
        })
      );
    }
  };

  const setVisible = (model: string, isVisible: boolean) => {
    publish(setModelHidden(provider, model, !isVisible));
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
