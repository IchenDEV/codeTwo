import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

/** What actually gets painted. */
export type ColorScheme = "light" | "dark";
/** What the user chose. `system` defers to the OS and keeps following it. */
export type ThemePreference = ColorScheme | "system";

const STORAGE_KEY = "codetwo.theme";

function systemScheme(): ColorScheme {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function storedPreference(): ThemePreference {
  const raw = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
  return raw === "light" || raw === "dark" || raw === "system" ? raw : "system";
}

interface ThemeValue {
  /** The user's choice, which is what a settings control should show. */
  preference: ThemePreference;
  /** The resolved scheme, which is what components should render against. */
  scheme: ColorScheme;
  setPreference: (p: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeValue>({
  preference: "system",
  scheme: "light",
  setPreference: () => {},
});

/**
 * Theme, as a preference rather than a reading.
 *
 * The distinction matters: `system` has to keep listening after the fact, because the OS can flip
 * at sunset while the app is open. An explicit light/dark must *stop* listening, or the user's
 * choice would be silently overridden the next time the OS changed its mind.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(storedPreference);
  const [system, setSystem] = useState<ColorScheme>(systemScheme);

  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mq) return;
    const onChange = (e: MediaQueryListEvent) => setSystem(e.matches ? "dark" : "light");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const scheme: ColorScheme = preference === "system" ? system : preference;

  // shadcn keys dark styles off a `.dark` class; mirror the resolved scheme onto <html>.
  useEffect(() => {
    document.documentElement.classList.toggle("dark", scheme === "dark");
    // Tells the webview to render form controls and scrollbars in the matching scheme, so the bits
    // the OS draws don't stay light while the app goes dark.
    document.documentElement.style.colorScheme = scheme;
  }, [scheme]);

  const setPreference = useCallback((p: ThemePreference) => {
    setPreferenceState(p);
    try {
      localStorage.setItem(STORAGE_KEY, p);
    } catch {
      /* private mode — the choice just won't survive a restart */
    }
  }, []);

  return (
    <ThemeContext.Provider value={{ preference, scheme, setPreference }}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeValue {
  return useContext(ThemeContext);
}

/** The resolved scheme, for components that only need to know what to paint. */
export function useColorScheme(): ColorScheme {
  return useContext(ThemeContext).scheme;
}
