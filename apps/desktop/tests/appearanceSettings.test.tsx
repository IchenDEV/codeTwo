// @ts-nocheck
import { afterEach, describe, expect, test } from "bun:test";
import { useState } from "react";
import { activateDom, dom, flush, mount, restoreDom } from "./domTestHarness";

activateDom();
const { I18nProvider } = await import("../src/i18n");
const { AppearanceSettings } = await import("../src/settings/AppearanceSettings");
const {
  getAppearanceSettings,
  importAppearanceTheme,
  normalizeAppearanceSettings,
  resetAppearanceSettings,
  serializeAppearanceTheme,
  setAppearanceSettings,
} = await import("../src/appearance");

function installThemeTokens() {
  const root = dom.document.documentElement;
  root.style.setProperty("--ds-theme-code2-light-accent", "#3366ff");
  root.style.setProperty("--ds-theme-code2-light-background", "#ffffff");
  root.style.setProperty("--ds-theme-code2-light-foreground", "#101828");
  root.style.setProperty("--ds-theme-code2-dark-accent", "#77a7ff");
  root.style.setProperty("--ds-theme-code2-dark-background", "#18191d");
  root.style.setProperty("--ds-theme-code2-dark-foreground", "#f2f4f8");
}

afterEach(() => {
  resetAppearanceSettings();
  dom.document.body.replaceChildren();
  dom.window.localStorage.clear();
  restoreDom();
});

function Harness() {
  const [value, setValue] = useState("system");
  return (
    <I18nProvider>
      <AppearanceSettings value={value} onChange={setValue} />
    </I18nProvider>
  );
}

describe("Appearance settings", () => {
  test("renders the three official schemes and changes the selected preference", async () => {
    activateDom();
    const view = mount(<Harness />);
    await flush();

    const radios = Array.from(view.container.querySelectorAll('input[name="appearance-color-scheme"]'));
    expect(radios.map((radio) => radio.getAttribute("value"))).toEqual(["system", "light", "dark"]);
    expect(radios[0].checked).toBe(true);

    radios[2].click();
    await flush();
    expect(radios[2].checked).toBe(true);
    expect(radios[0].checked).toBe(false);
    expect(view.container.querySelector('[role="radiogroup"]')?.getAttribute("aria-labelledby")).toBe(
      "appearance-color-scheme",
    );

    view.unmount();
  });

  test("renders a split system preview and explicit light and dark previews", async () => {
    activateDom();
    const view = mount(<Harness />);
    await flush();

    expect(view.container.querySelectorAll(".appearance-system-half")).toHaveLength(2);
    expect(view.container.querySelectorAll(".appearance-mini-app")).toHaveLength(4);

    view.unmount();
  });

  test("shows the session pet by default and persists an explicit hide", async () => {
    activateDom();
    expect(normalizeAppearanceSettings({}).petEnabled).toBe(true);
    setAppearanceSettings({ petEnabled: true });
    const view = mount(<Harness />);
    await flush();

    const checkbox = view.container.querySelector<HTMLButtonElement>('[role="checkbox"]');
    expect(checkbox?.hasAttribute("data-checked")).toBe(true);
    expect(getAppearanceSettings().petEnabled).toBe(true);

    checkbox?.click();
    await flush();
    expect(getAppearanceSettings().petEnabled).toBe(false);

    view.unmount();
  });

  test("renders the theme library and creates an editable theme copy", async () => {
    activateDom();
    installThemeTokens();
    const view = mount(<Harness />);
    await flush();

    expect(view.container.querySelectorAll(".appearance-theme-card")).toHaveLength(6);
    const createButton = view.container.querySelector<HTMLButtonElement>('[data-appearance-action="create-theme"]');
    expect(createButton).not.toBeNull();
    createButton!.click();
    await flush();

    expect(getAppearanceSettings().customThemes).toHaveLength(1);
    expect(getAppearanceSettings().activeThemeId.startsWith("custom-")).toBe(true);
    expect(view.container.querySelectorAll(".appearance-theme-card")).toHaveLength(7);

    view.unmount();
  });

  test("imports and serializes a versioned theme document", () => {
    activateDom();
    const imported = importAppearanceTheme(JSON.stringify({
      format: "codetwo-theme",
      version: 1,
      theme: {
        name: "Test Theme",
        light: { accent: "#3366ff", background: "#ffffff", foreground: "#101828" },
        dark: { accent: "#77a7ff", background: "#18191d", foreground: "#f2f4f8" },
      },
    }));

    expect(imported.name).toBe("Test Theme");
    expect(getAppearanceSettings().activeThemeId).toBe(imported.id);
    const exported = JSON.parse(serializeAppearanceTheme(imported.id));
    expect(exported.format).toBe("codetwo-theme");
    expect(exported.theme.dark.background).toBe("#18191d");
    expect(() => importAppearanceTheme('{"format":"codetwo-theme","version":1,"theme":{}}')).toThrow();
  });
});
