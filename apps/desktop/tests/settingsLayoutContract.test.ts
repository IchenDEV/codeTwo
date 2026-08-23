import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const source = readFileSync(new URL("../src/settings/SettingsPage.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/settings/settings-page.css", import.meta.url), "utf8");

describe("Settings page layout contract", () => {
  test("places the Back action above the settings menu", () => {
    const backIndex = source.indexOf("data-settings-back");
    const menuIndex = source.indexOf("<nav", backIndex);

    expect(backIndex).toBeGreaterThan(-1);
    expect(menuIndex).toBeGreaterThan(backIndex);
  });

  test("keeps every settings tab on the shared 40px titlebar", () => {
    expect(source).toMatch(
      /<header[\s\S]*?data-settings-titlebar[\s\S]*?className="[^"]*\bsettings-titlebar\b[^"]*\bshrink-0\b[^"]*"/,
    );
    expect(styles).toContain(
      "height: calc(var(--ds-control-normal) + var(--ds-space-surface-inset));",
    );
  });

  test("includes Usage as a first-class settings panel", () => {
    expect(source).toMatch(/\{ id: "usage", icon: ChartNoAxesColumn, labelKey: "usage\.title" \}/);
    expect(source).toContain('{tab === "usage" && (');
    expect(source).toMatch(
      /<UsagePanel[\s\S]*?provider=\{provider\}[\s\S]*?providerNames=\{providerNames\}[\s\S]*?\/>/,
    );
  });

  test("removes and closes the Memory tab when its component policy is disabled", () => {
    expect(source).toContain('NAV.filter(({ id }) => memoryEnabled || id !== "memory")');
    expect(source).toContain('current === "memory" ? "general" : current');
    expect(source).toMatch(
      /\{tab === "memory" && memoryEnabled && \([\s\S]*?<MemorySettingsPage[\s\S]*?projectPath=\{projectPath\}[\s\S]*?projects=\{projects\}[\s\S]*?onOpenSession=\{onOpenSession\}[\s\S]*?\/>(?:[\s\S]*?)\)\}/,
    );
  });
});
