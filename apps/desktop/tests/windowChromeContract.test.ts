import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const source = (relativePath: string) => readFileSync(
  new URL(relativePath, import.meta.url),
  "utf8",
).replaceAll("\r\n", "\n");

const electrobunHost = source("../src/electrobun/index.ts");
const styles = source("../src/styles.css");
const appSource = source("../src/App.tsx");
const mainSource = source("../src/main.tsx");
const railSource = source("../src/sidebar/SessionRail.tsx");
const sceneStudioSource = source("../src/session/SceneStudio.tsx");
const dockSource = source("../src/dock/Dock.tsx");
const tabsSource = source("../src/components/ui/tabs.tsx");
const electrobunConfig = source("../electrobun.config.ts");
const prepareElectrobun = source("../scripts/prepare-electrobun.ts");
const patchMacOSInfo = source("../scripts/patch-macos-info.ts");
const nativeWindowEffects = source("../native/window-effects/CodeTwoWindowEffects.m");
const themeSource = source("../src/theme.tsx");

describe("macOS window chrome contract", () => {
  test("aligns the native macOS traffic lights to the 48px titlebar", () => {
    expect(electrobunHost).toContain('titleBarStyle: "hiddenInset"');
    expect(electrobunHost).not.toContain("trafficLightOffset");
    expect(electrobunHost).toMatch(
      /mainWindow\.webview\.on\("dom-ready", \(\) => \{[\s\S]*?if \(process\.platform === "darwin"\) \{[\s\S]*?mainWindow\.setWindowButtonPosition\(28, 19\);[\s\S]*?\}\s*rendererReady = true;/,
    );
  });

  test("reserves traffic-light space only on macOS", () => {
    expect(mainSource).toContain("document.documentElement.dataset.platform");
    expect(appSource).toContain('displayedRailCollapsed ? "window-controls-safe-main" : "pl-4"');
    expect(railSource).toContain("window-controls-safe-rail");
    expect(sceneStudioSource).toContain("window-controls-safe-scene");
    expect(styles).toMatch(
      /html\[data-platform="macos"\] \.window-controls-safe-main\s*{[^}]*padding-left:\s*5rem/s,
    );
    expect(styles).toMatch(/\.window-controls-safe-main\s*{[^}]*padding-left:\s*1rem/s);
  });

  test("composes macOS sidebars as transparent blurred glass over an opaque workspace", () => {
    expect(electrobunHost).toContain('transparent: process.platform === "darwin"');
    expect(electrobunHost).toContain(
      'document.documentElement.classList.add("macos-window-glass")',
    );
    expect(styles).toMatch(/\.macos-window-glass \.app-shell\s*{[^}]*background:\s*transparent;/s);
    expect(styles).toMatch(
      /\.macos-window-glass \.glass-rail\s*{[^}]*--appearance-macos-panel-tint-opacity/s,
    );
    expect(appSource).toContain(
      'className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background"',
    );
  });

  test("solidifies the glass panes while the app scheme disagrees with the system scheme", () => {
    expect(styles).toMatch(
      /\.macos-window-glass\.scheme-mismatch \.glass-rail[^}]*--appearance-macos-panel-tint-opacity:\s*100%/s,
    );
    expect(themeSource).toContain('root.classList.toggle("scheme-mismatch", scheme !== system)');
  });

  test("uses an AppKit material to blur content behind the transparent window", () => {
    expect(electrobunHost).toContain("configureMacOSWindowEffects(mainWindow.ptr)");
    expect(nativeWindowEffects).toContain("NSVisualEffectView");
    expect(nativeWindowEffects).toContain("NSVisualEffectBlendingModeBehindWindow");
    expect(nativeWindowEffects).toContain("NSVisualEffectMaterialSidebar");
    expect(nativeWindowEffects).toContain("NSVisualEffectStateFollowsWindowActiveState");
    expect(nativeWindowEffects).toContain("addSubview:backdrop positioned:NSWindowBelow");
  });

  test("restores the native macOS window shadow disabled by transparent Electrobun windows", () => {
    expect(electrobunHost).toContain("windowEffectsStatus.shadow");
    expect(electrobunHost).toContain("The macOS system window shadow could not be restored");
    expect(electrobunConfig).not.toContain("libCodeTwoWindowEffects.dylib");
    expect(prepareElectrobun).toContain('resolve(desktopRoot, "native", "window-effects")');
    expect(patchMacOSInfo).toContain(
      'join(bundle, "Contents", "MacOS", "libCodeTwoWindowEffects.dylib")',
    );
    expect(nativeWindowEffects).toContain("window.hasShadow = YES");
    expect(nativeWindowEffects).toContain("[window invalidateShadow]");
    expect(nativeWindowEffects).toContain("dispatch_sync(dispatch_get_main_queue()");
  });

  test("mounts independent bottom-terminal and right-side panel regions", () => {
    expect(appSource).toContain('const [terminalOpen, setTerminalOpen]');
    expect(appSource).toContain('placement="bottom"');
    expect(appSource).toContain('placement="right"');
    expect(styles).toMatch(/\.glass-panel\s*{[^}]*--appearance-sidebar-opacity/s);
  });

  test("keeps the empty-session hero below the titlebar when the bottom panel opens", () => {
    expect(appSource).toContain(
      '"order-2 min-h-0 flex-1 flex-col justify-center-safe overflow-y-auto pb-16 pt-6"',
    );
    expect(appSource).not.toContain(
      '"order-2 min-h-0 flex-1 flex-col justify-center pb-16"',
    );
  });

  test("stacks composer contributions above the full-page document", () => {
    expect(appSource).toContain(
      'docMode\n                  ? "order-1 min-h-0 min-w-0 flex-1 flex-col"',
    );
    expect(appSource).not.toContain(
      'docMode\n                  ? "order-1 min-h-0 min-w-0 flex-1"',
    );
  });

  test("keeps both dock header states aligned to the 48px titlebar", () => {
    const titlebarClasses = Array.from(
      dockSource.matchAll(/data-dock-titlebar[\s\S]*?className="([^"]+)"/g),
      (match) => match[1].split(/\s+/),
    );

    expect(titlebarClasses).toHaveLength(2);
    expect(titlebarClasses.every((classes) => classes.includes("py-2.5"))).toBe(true);
    expect(dockSource).toContain(
      'size="compact" className="w-(--ds-control-normal) px-0" onClick={onClose}',
    );
  });

  test("uses the shared compact toolbar treatment for dock tabs", () => {
    expect(dockSource).toContain('<TabsList variant="toolbar">');
    expect(dockSource).not.toContain('data-[state=active]');
    expect(tabsSource).toContain(
      'toolbar: "gap-1 bg-transparent p-0 group-data-[orientation=horizontal]/tabs:data-[variant=toolbar]:h-(--ds-control-normal)"',
    );
    expect(tabsSource).toContain(
      "group-data-[variant=toolbar]/tabs-list:data-active:bg-secondary",
    );
    expect(tabsSource).toContain(
      "group-data-[variant=toolbar]/tabs-list:data-active:text-primary",
    );
  });
});
