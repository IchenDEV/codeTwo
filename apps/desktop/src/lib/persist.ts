import { useEffect, useState } from "react";

export function usePersistedNumber(
  key: string,
  fallback: number
): [number, (n: number) => void] {
  const [value, setValue] = useState(() => {
    const raw =
      typeof localStorage === "undefined" ? null : localStorage.getItem(key);
    const n = raw === null ? NaN : Number(raw);
    return Number.isFinite(n) ? n : fallback;
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, String(value));
    } catch {
      /*
      private mode / no storage — the size just won't persist
      */
    }
  }, [key, value]);

  return [value, setValue];
}

export function usePersistedBoolean(
  key: string,
  isFallback: boolean
): [boolean, (isEnabled: boolean) => void] {
  const [value, setValue] = useState(() => {
    const raw =
      typeof localStorage === "undefined" ? null : localStorage.getItem(key);
    return raw === null ? isFallback : raw === "1";
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, value ? "1" : "0");
    } catch {
      /*
      private mode / no storage — the fold just won't persist
      */
    }
  }, [key, value]);

  return [value, setValue];
}
