import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import {
  applyAppearanceSettings,
  setAppearanceSettings,
  useAppearanceSettings,
  type ColorScheme,
  type ThemePreference,
} from "./appearance";

export type { ColorScheme, ThemePreference } from "./appearance";

function systemScheme(): ColorScheme {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches
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
  const appearance = useAppearanceSettings();
  const preference = appearance.preference;
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
    const root = document.documentElement;
    root.classList.toggle("dark", scheme === "dark");
    // Tells the webview to render form controls and scrollbars in the matching scheme, so the bits
    // the OS draws don't stay light while the app goes dark.
    root.style.colorScheme = scheme;

    // And tell the *window*. The sidebar's vibrancy is an NSVisualEffectView, which follows the
    // window's appearance rather than our CSS — so picking Dark in the app while macOS is Light
    // left a pale sidebar against dark content. CSS can't reach that surface; only this can.
    void (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        await getCurrentWindow().setTheme(scheme);
      } catch {
        /* not in Tauri, or the window is gone — the CSS above is still correct */
      }
    })();
  }, [scheme]);

  // Palette, type, and surface settings are independent from the native window appearance. Keep
  // this separate so moving a slider does not send a redundant setTheme call over Tauri IPC.
  useEffect(() => {
    applyAppearanceSettings(document.documentElement, appearance, scheme);
  }, [appearance, scheme]);

  const setPreference = useCallback((p: ThemePreference) => {
    setAppearanceSettings({ preference: p });
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
