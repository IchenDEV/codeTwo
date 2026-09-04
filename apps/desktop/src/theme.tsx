import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";

import {
  applyAppearanceSettings,
  setAppearanceSettings,
  useAppearanceSettings,
} from "./appearance";
import type { ColorScheme, ThemePreference } from "./appearance";

export type { ColorScheme, ThemePreference } from "./appearance";

function systemScheme(): ColorScheme {
  return typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
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
  setPreference: () => {
    /* empty */
  },
});

/**
 * Theme, as a preference rather than a reading.
 *
 * The distinction matters: `system` has to keep listening after the fact, because the OS can flip
 * at sunset while the app is open. An explicit light/dark must *stop* listening, or the user's
 * choice would be silently overridden the next time the OS changed its mind.
 */
export function ThemeProvider({
  children,
  preferenceOverride,
}: {
  children: ReactNode;
  /** A non-persistent preview value. UI Lab uses this without changing the user's app setting. */
  preferenceOverride?: ThemePreference;
}) {
  const appearance = useAppearanceSettings();
  const preference = preferenceOverride ?? appearance.preference;
  const [system, setSystem] = useState<ColorScheme>(systemScheme);

  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (mq == null) return;
    const onChange = (e: MediaQueryListEvent) =>
      setSystem(e.matches ? "dark" : "light");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const scheme: ColorScheme = preference === "system" ? system : preference;

  // shadcn keys dark styles off a `.dark` class; mirror the resolved scheme onto <html>.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", scheme === "dark");
    // The macOS window glass lets the native desktop material show through, and that material
    // always follows the *system* scheme. While the app disagrees with the OS the rails and dock
    // panels go fully tinted (see `.macos-window-glass.scheme-mismatch`), or the other scheme
    // would bleed through and read as murky gray.
    root.classList.toggle("scheme-mismatch", scheme !== system);
    // Tells the webview to render form controls and scrollbars in the matching scheme, so the bits
    // the OS draws don't stay light while the app goes dark.
    root.style.colorScheme = scheme;
  }, [scheme, system]);

  // Palette, type, and surface settings remain independent from the resolved color scheme.
  useEffect(() => {
    applyAppearanceSettings(document.documentElement, appearance, scheme);
  }, [appearance, scheme]);

  const setPreference = (p: ThemePreference) => {
    if (preferenceOverride !== undefined) return;
    setAppearanceSettings({ preference: p });
  };

  return (
    <ThemeContext.Provider value={{ preference, scheme, setPreference }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeValue {
  return useContext(ThemeContext);
}

/** The resolved scheme, for components that only need to know what to paint. */
export function useColorScheme(): ColorScheme {
  return useContext(ThemeContext).scheme;
}
