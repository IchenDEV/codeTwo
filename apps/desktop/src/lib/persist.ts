import { useEffect, useState } from "react";

/**
 * A number that survives a restart. Used for the layout sizes the user drags (composer height,
 * dock width) — re-dragging them on every launch is exactly the kind of thing an app should
 * remember.
 */
export function usePersistedNumber(
  key: string,
  fallback: number
): [number, (n: number) => void] {
  const [value, setValue] = useState(() => {
    const raw =
      typeof localStorage !== "undefined" ? localStorage.getItem(key) : null;
    const n = raw === null ? NaN : Number(raw);
    return Number.isFinite(n) ? n : fallback;
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, String(value));
    } catch {
      /* private mode / no storage — the size just won't persist */
    }
  }, [key, value]);

  return [value, setValue];
}

/**
 * A yes/no that survives a restart. Used for the fold states the user toggles (the archived
 * group in the rail) — reopening them on every launch would undo the point of folding them.
 */
export function usePersistedBoolean(
  key: string,
  fallback: boolean
): [boolean, (b: boolean) => void] {
  const [value, setValue] = useState(() => {
    const raw =
      typeof localStorage !== "undefined" ? localStorage.getItem(key) : null;
    return raw === null ? fallback : raw === "1";
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, value ? "1" : "0");
    } catch {
      /* private mode / no storage — the fold just won't persist */
    }
  }, [key, value]);

  return [value, setValue];
}
