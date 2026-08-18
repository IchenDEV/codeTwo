import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const source = readFileSync(new URL("../src/settings/SettingsPage.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/settings/settings-page.css", import.meta.url), "utf8");

describe("Settings page layout contract", () => {
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
    expect(source).toContain('{tab === "usage" && <UsagePanel />}');
  });
});
