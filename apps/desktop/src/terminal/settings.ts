import { useSyncExternalStore } from "react";

/**
 * Terminal appearance, kept next to the theme and language preferences in `localStorage` rather
 * than in the core: these only describe how the renderer draws, and the core's emulator is
 * indifferent to fonts. Scrollback is the exception — it's passed to the core on first attach.
 */
export interface TerminalSettings {
  /** Empty means "use the app's mono stack" (`--font-mono`). */
  fontFamily: string;
  fontSize: number;
  scrollback: number;
}

const STORAGE_KEY = "codetwo.terminal";

export const DEFAULT_TERMINAL_SETTINGS: TerminalSettings = {
  fontFamily: "",
  fontSize: 13,
  scrollback: 10_000,
};

function read(): TerminalSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw == null || raw === "") return DEFAULT_TERMINAL_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<TerminalSettings>;
    return {
      fontFamily:
        typeof parsed.fontFamily === "string" ? parsed.fontFamily : "",
      fontSize: clamp(
        parsed.fontSize,
        8,
        32,
        DEFAULT_TERMINAL_SETTINGS.fontSize
      ),
      scrollback: clamp(
        parsed.scrollback,
        100,
        200_000,
        DEFAULT_TERMINAL_SETTINGS.scrollback
      ),
    };
  } catch {
    return DEFAULT_TERMINAL_SETTINGS;
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

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setTerminalSettings(patch: Partial<TerminalSettings>): void {
  snapshot = { ...snapshot, ...patch };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    /* private mode — the choice just won't survive a restart */
  }
  for (const fn of listeners) fn();
}

export function useTerminalSettings(): TerminalSettings {
  return useSyncExternalStore(subscribe, () => snapshot);
}
