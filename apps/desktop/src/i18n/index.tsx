import { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";

import { LOCALES } from "./strings";
import type { Locale, StringKey } from "./strings";

/**
`system` resolves from the OS language and keeps whatever the OS reports.
*/
export type LanguagePreference = Locale | "system";

const storageKey = "codetwo.language";

export function resolveSystemLocale(): Locale {
  const tags =
    typeof navigator !== "undefined"
      ? (navigator.languages ?? [navigator.language])
      : [];
  for (const tag of tags) {
    if (!tag) {
      continue;
    }
    // Exact first ("zh-CN"), then the base language ("zh" → the first zh-* we ship).
    if (tag in LOCALES) {
      return tag as Locale;
    }
    const base = tag.split("-")[0];
    const match = (Object.keys(LOCALES) as Locale[]).find(
      (l) => l.split("-")[0] === base
    );
    if (match) {
      return match;
    }
  }
  return "en";
}

function storedPreference(): LanguagePreference {
  const raw =
    typeof localStorage !== "undefined"
      ? localStorage.getItem(storageKey)
      : null;
  return raw === "system" || (raw && raw in LOCALES)
    ? (raw as LanguagePreference)
    : "system";
}

function interpolate(
  template: string,
  vars?: Record<string, string | number>
): string {
  if (!vars) {
    return template;
  }
  return template.replace(/\{(\w+)\}/gu, (whole, key) =>
    key in vars ? String(vars[key]) : whole
  );
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
  locale: "en",
  preference: "system",
  setPreference: () => {},
  t: (k) => k,
});

export const I18nProvider = ({
  children,
}: {
  readonly children: ReactNode;
}) => {
  const [preference, setPreferenceState] =
    useState<LanguagePreference>(storedPreference);

  const locale: Locale =
    preference === "system" ? resolveSystemLocale() : preference;

  const t: Translate = (() => {
    const table = LOCALES[locale].strings;
    return (key, vars) => interpolate(table[key] ?? key, vars);
  })();

  const setPreference = (p: LanguagePreference) => {
    setPreferenceState(p);
    try {
      localStorage.setItem(storageKey, p);
    } catch {
      /*
      private mode — the choice just won't survive a restart
      */
    }
    // `lang` drives font fallback and hyphenation; leaving it as "en" makes CJK text render with
    // the wrong face on some systems.
    document.documentElement.lang = p === "system" ? resolveSystemLocale() : p;
  };

  return (
    <I18nContext.Provider value={{ locale, preference, setPreference, t }}>
      {children}
    </I18nContext.Provider>
  );
};

export function useT(): Translate {
  return useContext(I18nContext).t;
}

export function useLanguage(): I18nValue {
  return useContext(I18nContext);
}

// Deliberately no re-export of LOCALES here: mixing non-component exports into a module that
// exports components breaks React Fast Refresh, which turns every edit to this file into a full
// page reload that discards whatever you were doing. Import it from `./strings` instead.
export type { Locale, StringKey };
