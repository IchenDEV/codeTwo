import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const normalizeSource = (source: string) => source.replaceAll(/\r\n?/gu, "\n");
const readSource = (relativePath: string) =>
  normalizeSource(
    readFileSync(new URL(relativePath, import.meta.url), "utf-8")
  );

const button = readSource("../src/components/ui/button.tsx");

const settingsPage = readSource("../src/settings/SettingsPage.tsx");
const settingsPageCss = readSource("../src/settings/settings-page.css");
const settingsSection = readSource(
  "../src/components/business/settings-section.tsx"
);
const settingsPrimitives = readSource("../src/settings/SettingsPrimitives.tsx");
const appearance = readSource("../src/settings/AppearanceSettings.tsx");
const appearanceCss = readSource("../src/settings/appearance-settings.css");
const memory = readSource("../src/settings/MemorySettings.tsx");
const memoryCss = readSource("../src/settings/memory-settings.css");
const usage = readSource("../src/usage/Usage.tsx");

describe("settings rhythm contract", () => {
  test("normalizes source contracts across platform line endings", () => {
    expect(normalizeSource("first\r\nsecond\rthird")).toBe(
      "first\nsecond\nthird"
    );
  });

  test("keeps one 48rem measure for every settings tab", () => {
    expect(settingsPage).toContain('className="settings-page mx-auto w-full"');
    expect(settingsPage).not.toContain("settings-profile-page");
    expect(settingsPage).not.toContain("settings-worktrees-page");
    expect(settingsPageCss).not.toContain(".settings-profile-page");
    expect(settingsPageCss).not.toContain(".settings-worktrees-page");
  });

  test("renders appearance sections through the shared section anatomy", () => {
    expect(appearance).toContain(
      'import { SettingsSection } from "@/components/business/settings-section";'
    );
    expect(appearance.match(/<SettingsSection/gu)).toHaveLength(6);
    for (const headingId of [
      "appearance-color-scheme",
      "appearance-typography",
      "appearance-themes",
      "appearance-theme-editor",
      "appearance-surfaces",
      "appearance-preferences",
    ]) {
      expect(appearance).toContain(`headingId="${headingId}"`);
    }
    expect(appearance).not.toContain("appearance-settings-heading");
    expect(appearance).not.toContain("appearance-section");
    expect(appearanceCss).not.toContain(".appearance-settings-heading");
    expect(appearanceCss).not.toContain(".appearance-section");
  });

  test("renders memory section headings through the shared group heading", () => {
    expect(memory).toContain(
      'import { GroupHeading } from "./SettingsPrimitives";'
    );
    expect(memory.match(/<GroupHeading className="pt-0">/gu)).toHaveLength(4);
    expect(memory).not.toMatch(/<h[23]>\{t\("memory\./u);
    expect(memoryCss).not.toContain(".memory-policy-column h2");
    expect(memoryCss).not.toContain(".memory-detail-section h3");
  });

  test("renders the usage tab title through the shared page header", () => {
    expect(usage).toContain(
      'import { PageHeader } from "@/components/business/page-header";'
    );
    expect(usage).toContain("<PageHeader");
    expect(usage).not.toContain("text-page font-semibold tracking-tight");
  });

  test("keeps settings module cards on the surface plane", () => {
    const ruleBlock = (css: string, selector: string) => {
      const start = css.indexOf(`${selector} {`);
      return start < 0 ? "" : css.slice(start, css.indexOf("}", start));
    };
    for (const [css, selector] of [
      [settingsPageCss, ".worktree-policy-card"],
      [settingsPageCss, ".worktree-project-card"],
      [settingsPageCss, ".profile-editor,\n.profile-activity-surface"],
      [memoryCss, ".memory-disclosure"],
    ] as const) {
      const block = ruleBlock(css, selector);
      expect(block).toContain("background: var(--ds-color-surface);");
      expect(block).not.toContain("fill-quiet");
    }
    expect(memoryCss).toContain(
      ".memory-policy-column + .memory-policy-column {\n  box-shadow: inset var(--hairline-width) 0 0 var(--ds-color-fill-rest);\n}"
    );
    expect(ruleBlock(memoryCss, ".memory-disclosure-body")).not.toContain(
      "background:"
    );
  });

  test("keeps one weight for the shared settings heading role", () => {
    expect(settingsSection).toContain(
      'className="text-body text-content font-semibold"'
    );
    expect(settingsPrimitives).toContain(
      '"pt-section text-body text-content font-semibold",'
    );
    expect(settingsSection).not.toContain("font-medium");
    expect(settingsPrimitives).not.toContain("font-medium");
  });

  test("keeps the 28px button sizes to one treatment", () => {
    const collapsed = button.replaceAll(/\s+/gu, " ");
    const sizeEntry = (name: string) =>
      new RegExp(`${name}: "([^"]+)"`, "u").exec(collapsed)?.[1];
    expect(sizeEntry("sm")).toBe(sizeEntry("compact"));
  });
});
