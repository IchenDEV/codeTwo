// @ts-nocheck
import { afterEach, describe, expect, test } from "bun:test";
import { useState } from "react";
import { activateDom, dom, flush, mount, restoreDom } from "./domTestHarness";

activateDom();
const { I18nProvider } = await import("../src/i18n");
const { AppearanceSettings } =
  await import("../src/settings/AppearanceSettings");
const {
  applyAppearanceSettings,
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

    const radios = Array.from(
      view.container.querySelectorAll('input[name="appearance-color-scheme"]')
    );
    expect(radios.map((radio) => radio.getAttribute("value"))).toEqual([
      "system",
      "light",
      "dark",
    ]);
    expect(radios[0].checked).toBe(true);

    radios[2].click();
    await flush();
    expect(radios[2].checked).toBe(true);
    expect(radios[0].checked).toBe(false);
    expect(
      view.container
        .querySelector('[role="radiogroup"]')
        ?.getAttribute("aria-labelledby")
    ).toBe("appearance-color-scheme");

    view.unmount();
  });

  test("renders a split system preview and explicit light and dark previews", async () => {
    activateDom();
    const view = mount(<Harness />);
    await flush();

    expect(
      view.container.querySelectorAll(".appearance-system-half")
    ).toHaveLength(2);
    expect(
      view.container.querySelectorAll(".appearance-mini-app")
    ).toHaveLength(4);

    view.unmount();
  });

  test("uses standard setting rows for palette, typography, and surface controls", async () => {
    activateDom();
    installThemeTokens();
    const view = mount(<Harness />);
    await flush();

    expect(
      view.container.querySelectorAll('[data-slot="setting-row"]')
    ).toHaveLength(19);
    expect(
      view.container
        .querySelector('[aria-label="Light theme Interface font"]')
        ?.closest('[data-slot="setting-row"]')
    ).not.toBeNull();
    expect(
      view.container
        .querySelector('[aria-label="Interface font size"]')
        ?.closest('[data-slot="setting-row"]')
    ).not.toBeNull();
    expect(view.container.querySelectorAll(".appearance-section")).toHaveLength(
      6
    );
    expect(
      view.container.querySelectorAll(".appearance-setting-group")
    ).toHaveLength(2);
    expect(
      view.container.querySelectorAll(".appearance-profile-grid")
    ).toHaveLength(2);
    expect(
      view.container.querySelector(".appearance-editor-surface")
    ).not.toBeNull();
    expect(
      view.container.querySelector(
        ".appearance-setting-group [data-surface='card']"
      )
    ).toBeNull();

    view.unmount();
  });

  test("normalizes the standalone pet settings and preserves explicit choices", () => {
    activateDom();
    expect(normalizeAppearanceSettings({})).toMatchObject({
      petEnabled: true,
      petActivityEnabled: true,
      petSize: "medium",
      petSource: "builtin",
      petId: "naiwa",
      petName: "Naiwa",
    });
    setAppearanceSettings({
      petEnabled: false,
      petActivityEnabled: false,
      petSize: "large",
      petSource: "petshare",
      petId: "columbina",
      petName: "Columbina",
    });
    expect(getAppearanceSettings()).toMatchObject({
      petEnabled: false,
      petActivityEnabled: false,
      petSize: "large",
      petSource: "petshare",
      petId: "columbina",
      petName: "Columbina",
    });
    expect(
      normalizeAppearanceSettings({ petSource: "petshare", petId: "../escape" })
    ).toMatchObject({
      petSource: "builtin",
      petId: "naiwa",
    });
  });

  test("migrates the former compact default without overriding a current explicit 13px choice", () => {
    expect(
      normalizeAppearanceSettings({ version: 1, uiFontSize: 13 })
    ).toMatchObject({
      version: 3,
      uiFontSize: 14,
    });
    expect(
      normalizeAppearanceSettings({ version: 2, uiFontSize: 13 })
    ).toMatchObject({
      version: 3,
      uiFontSize: 13,
    });
    expect(
      normalizeAppearanceSettings({ version: 3, uiFontSize: 13 })
    ).toMatchObject({
      version: 3,
      uiFontSize: 13,
    });
  });

  test("migrates global version-two controls into independent light and dark profiles", () => {
    activateDom();
    installThemeTokens();
    const migrated = normalizeAppearanceSettings({
      version: 2,
      uiFont: "avenir",
      codeFont: "menlo",
      uiFontSize: 15,
      codeFontSize: 14,
      sidebarOpacity: 67,
      contrast: 58,
    });

    expect(migrated).toMatchObject({
      version: 3,
      light: {
        uiFont: "avenir",
        codeFont: "menlo",
        sidebarOpacity: 67,
        contrast: 58,
      },
      dark: {
        uiFont: "avenir",
        codeFont: "menlo",
        sidebarOpacity: 67,
        contrast: 58,
      },
      uiFontSize: 15,
      codeFontSize: 14,
      pointerCursors: true,
      reduceMotion: "system",
      diffMarkers: "color",
    });

    const root = dom.document.documentElement;
    applyAppearanceSettings(
      root,
      {
        ...migrated,
        dark: {
          ...migrated.dark,
          uiFontWeight: "medium",
          codeFontWeight: "semibold",
          sidebarOpacity: 74,
          contrast: 63,
        },
        pointerCursors: false,
        reduceMotion: "on",
        diffMarkers: "symbols",
      },
      "dark"
    );
    expect(root.style.getPropertyValue("--appearance-font-ui")).toContain(
      "Avenir Next"
    );
    expect(root.style.getPropertyValue("--appearance-font-ui-weight")).toBe(
      "500"
    );
    expect(root.style.getPropertyValue("--appearance-font-code-weight")).toBe(
      "600"
    );
    expect(root.style.getPropertyValue("--appearance-sidebar-opacity")).toBe(
      "74%"
    );
    expect(root.dataset.appearancePointerCursors).toBe("false");
    expect(root.dataset.reduceMotion).toBe("on");
    expect(root.dataset.diffMarkers).toBe("symbols");
  });

  test("persists independent profiles and the Codex preference controls", () => {
    setAppearanceSettings((current) => {
      return {
        ...current,
        light: { ...current.light, uiFont: "inter", contrast: 32 },
        dark: { ...current.dark, codeFont: "monaco", contrast: 71 },
        pointerCursors: false,
        reduceMotion: "off",
        diffMarkers: "symbols",
      };
    });

    expect(getAppearanceSettings()).toMatchObject({
      light: { uiFont: "inter", contrast: 32 },
      dark: { codeFont: "monaco", contrast: 71 },
      pointerCursors: false,
      reduceMotion: "off",
      diffMarkers: "symbols",
    });
    expect(
      JSON.parse(
        dom.window.localStorage.getItem("codetwo.appearance.v1") ?? "{}"
      )
    ).toMatchObject({
      version: 3,
      light: { uiFont: "inter", contrast: 32 },
      dark: { codeFont: "monaco", contrast: 71 },
      reduceMotion: "off",
      diffMarkers: "symbols",
    });
  });

  test("renders the theme library and creates an editable theme copy", async () => {
    activateDom();
    installThemeTokens();
    const view = mount(<Harness />);
    await flush();

    expect(
      view.container.querySelectorAll(".appearance-theme-card")
    ).toHaveLength(6);
    const createButton = view.container.querySelector<HTMLButtonElement>(
      '[data-appearance-action="create-theme"]'
    );
    expect(createButton).not.toBeNull();
    createButton!.click();
    await flush();

    expect(getAppearanceSettings().customThemes).toHaveLength(1);
    expect(getAppearanceSettings().activeThemeId.startsWith("custom-")).toBe(
      true
    );
    expect(
      view.container.querySelectorAll(".appearance-theme-card")
    ).toHaveLength(7);

    view.unmount();
  });

  test("imports and serializes a versioned theme document", () => {
    activateDom();
    const imported = importAppearanceTheme(
      JSON.stringify({
        format: "codetwo-theme",
        version: 1,
        theme: {
          name: "Test Theme",
          light: {
            accent: "#3366ff",
            background: "#ffffff",
            foreground: "#101828",
          },
          dark: {
            accent: "#77a7ff",
            background: "#18191d",
            foreground: "#f2f4f8",
          },
        },
      })
    );

    expect(imported.name).toBe("Test Theme");
    expect(getAppearanceSettings().activeThemeId).toBe(imported.id);
    const exported = JSON.parse(serializeAppearanceTheme(imported.id));
    expect(exported.format).toBe("codetwo-theme");
    expect(exported.theme.dark.background).toBe("#18191d");
    expect(() =>
      importAppearanceTheme('{"format":"codetwo-theme","version":1,"theme":{}}')
    ).toThrow();
  });
});
