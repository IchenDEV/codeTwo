import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";

import { LOCALES } from "./strings";
import type { Locale, StringKey } from "./strings";

export { type Locale, type StringKey } from "./strings";
export type LanguagePreference = Locale | "system";

const STORAGE_KEY = "codetwo.language";

function isLocale(value: string): value is Locale {
  return Object.hasOwn(LOCALES, value);
}

function localeKeys(): Locale[] {
  const keys: Locale[] = [];
  for (const key of Object.keys(LOCALES)) {
    if (isLocale(key)) keys.push(key);
  }
  return keys;
}

/** The closest locale we have to what the OS asked for, falling back to English. */
export function resolveSystemLocale(): Locale {
  const tags =
    typeof navigator === "undefined"
      ? []
      : (navigator.languages ?? [navigator.language]);
  for (const tag of tags) {
    if (tag == null || tag === "") continue;
    // Exact first ("zh-CN"), then the base language ("zh" → the first zh-* we ship).
    if (isLocale(tag)) return tag;
    const base = tag.split("-")[0];
    const match = localeKeys().find((l) => l.split("-")[0] === base);
    if (match) return match;
  }
  return "en";
}

function storedPreference(): LanguagePreference {
  const raw =
    typeof localStorage === "undefined"
      ? null
      : localStorage.getItem(STORAGE_KEY);
  if (raw === "system") return "system";
  if (raw != null && raw !== "" && isLocale(raw)) return raw;
  return "system";
}

/** Substitute `{name}` placeholders. Missing values are left visible rather than blanked. */
function interpolate(
  template: string,
  vars?: Record<string, string | number>
): string {
  if (vars == null) return template;
  return template.replaceAll(/\{(\w+)\}/g, (whole, key: string) => {
    const value = vars[key];
    return value === undefined ? whole : String(value);
  });
}

export type Translate = (
  key: StringKey,
  vars?: Record<string, string | number>
) => string;

interface I18nValue {
  preference: LanguagePreference;
  locale: Locale;
  setPreference: (p: LanguagePreference) => void;
  t: Translate;
}

const I18nContext = createContext<I18nValue>({
  preference: "system",
  locale: "en",
  setPreference: () => {},
  t: (k) => k,
});

export function I18nProvider({
  children,
  preferenceOverride,
}: {
  children: ReactNode;
  /** A non-persistent preview value. UI Lab uses this without changing the user's app setting. */
  preferenceOverride?: LanguagePreference;
}) {
  const [storedPreferenceState, setPreferenceState] =
    useState<LanguagePreference>(storedPreference);
  const preference = preferenceOverride ?? storedPreferenceState;

  const locale: Locale =
    preference === "system" ? resolveSystemLocale() : preference;

  useEffect(() => {
    const root = document.documentElement;
    const previous = root.lang;
    root.lang = locale;
    return () => {
      root.lang = previous;
    };
  }, [locale]);

  const t = (() => {
    const table = LOCALES[locale].strings;
    const translate: Translate = (key, vars) =>
      interpolate(table[key] ?? key, vars);
    return translate;
  })();

  const setPreference = (p: LanguagePreference) => {
    if (preferenceOverride !== undefined) return;
    setPreferenceState(p);
    try {
      localStorage.setItem(STORAGE_KEY, p);
    } catch {
      /* private mode — the choice just won't survive a restart */
    }
  };

  return (
    <I18nContext.Provider value={{ preference, locale, setPreference, t }}>
      {children}
    </I18nContext.Provider>
  );
}

/** The translate function. The common case — components only need `t`. */
export function useT(): Translate {
  return useContext(I18nContext).t;
}

/** Full language state, for the settings control that changes it. */
export function useLanguage(): I18nValue {
  return useContext(I18nContext);
}

// Deliberately no re-export of LOCALES here: mixing non-component exports into a module that
// exports components breaks React Fast Refresh, which turns every edit to this file into a full
// page reload that discards whatever you were doing. Import it from `./strings` instead.
