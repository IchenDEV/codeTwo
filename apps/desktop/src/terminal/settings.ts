import { useSyncExternalStore } from "react";

import { asJsonObject } from "../lib/jsonValue";

/**
 * Terminal appearance, kept next to the theme and language preferences in `localStorage` rather
 * than in the core: these only describe how the renderer draws, and the core's emulator is
 * indifferent to fonts. Scrollback is the exception — it's passed to the core on first attach.
 */
export interface TerminalSettings {
  /**
  Empty means "use the app's mono stack" (`--font-mono`).
  */
  fontFamily: string;
  fontSize: number;
  scrollback: number;
}

const storageKey = "codetwo.terminal";

export const defaultTerminalSettings: TerminalSettings = {
  fontFamily: "",
  fontSize: 13,
  scrollback: 10_000,
};

function read(): TerminalSettings {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw == null || raw === "") {
      return defaultTerminalSettings;
    }
    const parsed = asJsonObject(JSON.parse(raw) as unknown) ?? {};
    return {
      fontFamily:
        typeof parsed.fontFamily === "string" ? parsed.fontFamily : "",
      fontSize: clamp(parsed.fontSize, 8, 32, defaultTerminalSettings.fontSize),
      scrollback: clamp(
        parsed.scrollback,
        100,
        200_000,
        defaultTerminalSettings.scrollback
      ),
    };
  } catch {
    return defaultTerminalSettings;
  }
}

function clamp(
  value: unknown,
  min: number,
  max: number,
  fallback: number
): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.round(value)))
    : fallback;
}

// Terminals are mounted all over the dock, so a settings change has to reach every one of them.
const listeners = new Set<() => void>();
let snapshot = read();

function subscribe(functionValue: () => void): () => void {
  listeners.add(functionValue);
  return () => listeners.delete(functionValue);
}

export function setTerminalSettings(patch: Partial<TerminalSettings>): void {
  snapshot = { ...snapshot, ...patch };
  try {
    localStorage.setItem(storageKey, JSON.stringify(snapshot));
  } catch {
    /*
    private mode — the choice just won't survive a restart
    */
  }
  for (const functionValue of listeners) {
    functionValue();
  }
}

export function useTerminalSettings(): TerminalSettings {
  return useSyncExternalStore(subscribe, () => snapshot);
}
