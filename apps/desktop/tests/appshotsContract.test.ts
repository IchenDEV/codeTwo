import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("Appshots desktop contract", () => {
  test("offers the requested settings and routes a capture into the Composer", () => {
    const settings = source("src/settings/SettingsPage.tsx");
    const app = source("src/App.tsx");
    const composer = source("src/session/Composer.tsx");

    expect(settings).toContain('{ id: "appshots", icon: ScanText, labelKey: "settings.appshots" }');
    expect(settings).toContain('<SelectItem value="both-command">');
    expect(settings).toContain('<SelectItem value="automatic">');
    expect(settings).toContain('checked={appshotSettings.play_sound}');
    expect(app).toContain("onAppshotCaptured");
    expect(app).toContain('type: "appshot"');
    expect(composer).toContain("data-appshot-attachments");
  });

  test("keeps captures in private app data and resolves only opaque UUIDs at prompt time", () => {
    const manager = source("src/electrobun/appshots.ts");
    const compiler = source("../../crates/core/src/skill.rs");

    expect(manager).toContain('this.capturesDir = join(dataDir, "appshots")');
    expect(manager).not.toContain('join(cwd, "appshots")');
    expect(manager).toContain("chmodSync(imagePath, 0o600)");
    expect(manager).toContain("chmodSync(this.capturesDir, 0o700)");
    expect(compiler).toContain('data_dir.join("appshots")');
    expect(compiler).toContain('"appshot id is invalid"');
    expect(compiler).toContain('Accessible window text (may include content outside the visible scroll area)');
  });

  test("uses native screen capture, Accessibility text, and a real global hotkey", () => {
    const native = source("native/window-effects/CodeTwoWindowEffects.m");
    const manager = source("src/electrobun/appshots.ts");
    const prepare = source("scripts/prepare-electrobun.ts");

    expect(native).toContain("CGPreflightScreenCaptureAccess");
    expect(native).toContain("CGWindowListCreateImage");
    expect(native).toContain("AXUIElementCopyAttributeValue");
    expect(native).toContain("kAXChildrenAttribute");
    expect(native).toContain("CGEventSourceKeyState(source, 55)");
    expect(native).toContain("CGEventSourceKeyState(source, 54)");
    expect(manager).toContain("GlobalShortcut.register");
    expect(prepare).toContain('"ApplicationServices"');
  });
});
