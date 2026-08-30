// Landing light/dark wiring. The pre-paint inline script in config.mts
// already put `home-light` on <html> when the stored choice or the system
// preference calls for it; this module only wires the header toggle.

const APPEARANCE_STORAGE_KEY = "vitepress-theme-appearance";

const THEME_COLOR_DARK = "#030504";
const THEME_COLOR_LIGHT = "#f1f3ec";

export function initLandingAppearance(): void {
  if (typeof document === "undefined") {
    return;
  }

  const buttons = Array.from(
    document.querySelectorAll<HTMLButtonElement>(".theme-toggle"),
  );
  if (buttons.length === 0) {
    return;
  }

  const root = document.documentElement;
  const meta = document.querySelector<HTMLMetaElement>(
    'meta[name="theme-color"]',
  );

  const apply = (light: boolean, persist: "light" | "dark" | null = null) => {
    root.classList.toggle("home-light", light);
    if (persist) {
      try {
        localStorage.setItem(APPEARANCE_STORAGE_KEY, persist);
      } catch {
        /* persistence is best-effort */
      }
    }
    if (meta) {
      meta.content = light ? THEME_COLOR_LIGHT : THEME_COLOR_DARK;
    }
    for (const button of buttons) {
      button.setAttribute("aria-pressed", light ? "true" : "false");
    }
  };

  for (const button of buttons) {
    button.addEventListener("click", () => {
      const next = !root.classList.contains("home-light");
      apply(next, next ? "light" : "dark");
    });
  }

  apply(root.classList.contains("home-light"));
}
