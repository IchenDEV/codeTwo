import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { LOCALES, type Locale, type StringKey } from "./strings";

/** `system` resolves from the OS language and keeps whatever the OS reports. */
export type LanguagePreference = Locale | "system";

const STORAGE_KEY = "codetwo.language";

/** The closest locale we have to what the OS asked for, falling back to English. */
export function resolveSystemLocale(): Locale {
  const tags =
    typeof navigator !== "undefined"
      ? (navigator.languages ?? [navigator.language])
      : [];
  for (const tag of tags) {
    if (!tag) continue;
    // Exact first ("zh-CN"), then the base language ("zh" → the first zh-* we ship).
    if (tag in LOCALES) return tag as Locale;
    const base = tag.split("-")[0];
    const match = (Object.keys(LOCALES) as Locale[]).find(
      (l) => l.split("-")[0] === base
    );
    if (match) return match;
  }
  return "en";
}

function storedPreference(): LanguagePreference {
  const raw =
    typeof localStorage !== "undefined"
      ? localStorage.getItem(STORAGE_KEY)
      : null;
  return raw === "system" || (raw && raw in LOCALES)
    ? (raw as LanguagePreference)
    : "system";
}

/** Substitute `{name}` placeholders. Missing values are left visible rather than blanked. */
function interpolate(
  template: string,
  vars?: Record<string, string | number>
): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (whole, key) =>
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
  preference: "system",
  locale: "en",
  setPreference: () => {},
  t: (k) => k,
});

export const I18nProvider = ({ children }: { readonly children: ReactNode }) => {
  const [preference, setPreferenceState] =
    useState<LanguagePreference>(storedPreference);

  const locale: Locale =
    preference === "system" ? resolveSystemLocale() : preference;

  const t = useMemo<Translate>(() => {
    const table = LOCALES[locale].strings;
    return (key, vars) => interpolate(table[key] ?? key, vars);
  }, [locale]);

  const setPreference = useCallback((p: LanguagePreference) => {
    setPreferenceState(p);
    try {
      localStorage.setItem(STORAGE_KEY, p);
    } catch {
      /* private mode — the choice just won't survive a restart */
    }
    // `lang` drives font fallback and hyphenation; leaving it as "en" makes CJK text render with
    // the wrong face on some systems.
    document.documentElement.lang = p === "system" ? resolveSystemLocale() : p;
  }, []);

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
export type { Locale, StringKey };
