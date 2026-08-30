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
const containerSource = source("../src/container.ts");
const railSource = source("../src/sidebar/SessionRail.tsx");
const sceneStudioSource = source("../src/session/SceneStudio.tsx");
const dockSource = source("../src/dock/Dock.tsx");
const tabsSource = source("../src/components/ui/tabs.tsx");
const sessionHeaderActionsSource = source("../src/session/SessionHeaderActions.tsx");
const electrobunConfig = source("../electrobun.config.ts");
const prepareElectrobun = source("../scripts/prepare-electrobun.ts");
const patchMacOSInfo = source("../scripts/patch-macos-info.ts");
const nativeWindowEffects = source("../native/window-effects/CodeTwoWindowEffects.m");
const themeSource = source("../src/theme.tsx");
const titlebarSource = source("../src/electrobun/titlebar.ts");
const rpcSource = source("../src/electrobun/rpc.ts");

describe("macOS window chrome contract", () => {
  test("centers the native macOS traffic lights with one fixed position", () => {
    expect(electrobunHost).toContain('titleBarStyle: "hiddenInset"');
    expect(electrobunHost).not.toContain("trafficLightOffset");
    expect(electrobunHost).toMatch(
      /mainWindow\.webview\.on\("dom-ready", \(\) => \{[\s\S]*?if \(process\.platform === "darwin"\) \{[\s\S]*?mainWindow\.setWindowButtonPosition\(28, 21\);[\s\S]*?\}\s*rendererReady = true;/,
    );
    expect(electrobunHost).toContain(
      'mainWindow.on("resize", () => mainWindow.setWindowButtonPosition(28, 21))',
    );
    expect(electrobunHost).not.toContain("ResizeObserver");
    expect(electrobunHost).not.toContain("getBoundingClientRect");
    expect(
      Array.from(electrobunHost.matchAll(/setWindowButtonPosition\(([^)]*)\)/g), (match) => match[1]),
    ).toEqual(["28, 21", "28, 21"]);
  });

  test("routes custom titlebar double-clicks through the user's macOS window action", () => {
    expect(mainSource).toContain("installDesktopTitlebarDoubleClick(document");
    expect(mainSource).toContain(
      '!showDesktopPet && currentDesktopPlatform() === "macos"',
    );
    expect(containerSource).toContain("if (!desktopContainerAvailable) return () => {}");
    expect(containerSource).toContain("installTitlebarDoubleClick(document");
    expect(containerSource).toContain("performTitlebarDoubleClick().catch(onError)");
    expect(titlebarSource).toContain("electrobun-webkit-app-region-drag");
    expect(titlebarSource).toContain("electrobun-webkit-app-region-no-drag");
    expect(rpcSource).toContain("titlebarDoubleClick: { params: undefined; response: boolean }");
    expect(electrobunHost).toContain(
      "titlebarDoubleClick: () => performMacOSTitlebarDoubleClick(mainWindow.ptr)",
    );
    expect(nativeWindowEffects).toContain("AppleActionOnDoubleClick");
    expect(nativeWindowEffects).toContain("AppleMiniaturizeOnDoubleClick");
    expect(nativeWindowEffects).toContain("performMiniaturize:nil");
    expect(nativeWindowEffects).toContain("performZoom:nil");
    expect(nativeWindowEffects).toContain("screen.visibleFrame");
    expect(nativeWindowEffects).toContain("setFrame:targetFrame display:YES animate:YES");
  });

  test("reserves traffic-light space only on macOS", () => {
    expect(mainSource).toContain("document.documentElement.dataset.platform");
    expect(appSource).toContain('displayedRailCollapsed ? "window-controls-safe-main" : "pl-4"');
    expect(railSource).toContain("window-controls-safe-rail");
    expect(sceneStudioSource).toContain("window-controls-safe-scene");
    expect(styles).toMatch(
      /html\[data-platform="macos"\] \.window-controls-safe-main\s*{[^}]*padding-left:\s*6rem/s,
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

  test("mounts the terminal in the shared right-side work dock", () => {
    expect(appSource).not.toContain('const [terminalOpen, setTerminalOpen]');
    expect(appSource).not.toContain('placement="bottom"');
    expect(appSource).toContain('availableSurfaces={availableDockSurfaces}');
    expect(appSource).toContain('case "toggle_terminal":');
    expect(dockSource).not.toContain('DockPlacement');
    expect(dockSource).toContain('data-dock-placement="right"');
    expect(dockSource).toContain('className="dock-tab-label"');
    expect(styles).toMatch(/@container dock \(max-width: 359px\)/);
    expect(styles).toMatch(/\.glass-panel\s*{[^}]*--appearance-sidebar-opacity/s);
  });

  test("keeps the empty-session hero safely centered in constrained window heights", () => {
    expect(appSource).toContain(
      '"hero-scroll-shell order-2 min-h-0 flex-1 flex-col justify-center-safe overflow-y-auto pb-page-end pt-6"',
    );
    expect(appSource).not.toContain(
      '"order-2 min-h-0 flex-1 flex-col justify-center pb-page-end"',
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

  test("keeps the rail, workspace, and both dock states on one shared titlebar baseline", () => {
    const titlebarClasses = Array.from(
      dockSource.matchAll(/data-dock-titlebar[\s\S]*?className="([^"]+)"/g),
      (match) => match[1].split(/\s+/),
    );

    expect(styles).toMatch(
      /\.window-titlebar\s*{[^}]*height:\s*var\(--ds-titlebar-height\);/s,
    );
    expect(styles).toMatch(
      /\.window-titlebar\s*{[^}]*box-shadow:\s*inset 0 calc\(-1 \* var\(--hairline-width\)\) 0 var\(--border\);/s,
    );
    expect(appSource).toContain(
      '"session-header window-titlebar electrobun-webkit-app-region-drag flex min-w-0 shrink-0 items-center gap-2 pr-4"',
    );
    expect(appSource).toContain(
      'className="session-header-toolbar flex min-w-0 shrink-0 items-center gap-4 [&_svg]:text-muted-foreground"',
    );
    expect(sessionHeaderActionsSource).toContain(
      'className="session-header-actions flex shrink-0 items-center gap-2"',
    );
    expect(sessionHeaderActionsSource).toContain(
      'session-header-action-main bg-fill-rest text-foreground hover:bg-fill-hover hover:text-foreground',
    );
    expect(styles).not.toMatch(
      /\.session-header-actions\s*{[^}]*box-shadow:\s*inset 0 0 0 var\(--hairline-width\) var\(--border\);/s,
    );
    expect(styles).toMatch(
      /\.session-header-context-label,[\s\S]*?\.session-header-layout-label,[\s\S]*?\[data-plugin-ui-slot="session\.header"\] \.session-header-action-label\s*{\s*display:\s*none;/s,
    );
    expect(styles).toMatch(
      /\.session-header-action-icon,[\s\S]*?\.session-header-context-icon,[\s\S]*?\.session-header-layout-icon,[\s\S]*?\[data-plugin-ui-slot="session\.header"\] \[data-icon="inline-start"\]\s*{\s*display:\s*block;/s,
    );
    expect(styles).toMatch(
      /\.session-header-context-main,[\s\S]*?\.session-header-plugin-action,[\s\S]*?\.session-header-layout-main\s*{[^}]*width:\s*var\(--ds-control-normal\);[^}]*justify-content:\s*center;/s,
    );
    expect(styles).toMatch(
      /@container session-header \(max-width: 36rem\)[\s\S]*?\.session-header-action-label\s*{\s*display:\s*none;/s,
    );
    expect(appSource).toMatch(
      /<EnvironmentPopover[\s\S]*?<SessionHeaderActions[\s\S]*?<PaneLayoutToolbar/,
    );
    expect(appSource).toContain('viewLabel={t("pane.viewMenu")}');
    expect(railSource).toContain(
      'className="window-titlebar window-controls-safe-rail electrobun-webkit-app-region-drag flex shrink-0 items-center gap-1 pr-2"',
    );
    expect(styles).toMatch(
      /\.session-rail \[data-rail-header\]\s*{[^}]*box-shadow:\s*none;/s,
    );
    expect(styles).toMatch(
      /\.glass-rail\s*{[^}]*box-shadow:\s*inset calc\(-1 \* var\(--hairline-width\)\) 0 0 var\(--sidebar-border\);/s,
    );
    expect(titlebarClasses).toHaveLength(2);
    expect(titlebarClasses.every((classes) => classes.includes("window-titlebar"))).toBe(true);
    expect(titlebarClasses.every((classes) => !classes.includes("py-2.5"))).toBe(true);
    expect(titlebarClasses.every((classes) => !classes.includes("border-b"))).toBe(true);
    expect(dockSource).toContain(
      'size="compact" className="w-(--ds-control-normal) px-0" onClick={onClose}',
    );
  });

  test("shows the session titlebar divider only when conversation content exists", () => {
    expect(appSource).toContain(
      "const hasConversationContent = turns.length > 0 || running || sessionLoading;",
    );
    expect(appSource).toContain(
      'data-has-conversation={hasConversationContent ? "true" : undefined}',
    );
    expect(appSource).toContain("{hasConversationContent && (");
    expect(styles).toMatch(/\.session-header\s*{[^}]*box-shadow:\s*none;/s);
    expect(styles).toMatch(
      /\.session-header\[data-has-conversation="true"\]\s*{[^}]*box-shadow:\s*inset 0 calc\(-1 \* var\(--hairline-width\)\) 0 var\(--border\);/s,
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

  test("keeps the sidebar resize target invisible on hover", () => {
    expect(styles).toMatch(
      /\.rail-grip\s*{[^}]*width:\s*6px;[^}]*cursor:\s*col-resize;/s,
    );
    expect(styles).not.toMatch(/\.rail-grip(?:::after|:hover)/);
  });

  test("aligns the visible dock resize affordance with the panel edge", () => {
    expect(styles).toMatch(
      /\.dock-grip::after\s*{[^}]*left:\s*0;[^}]*width:\s*2px;/s,
    );
  });
});
