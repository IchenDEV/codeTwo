import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const source = readFileSync(
  new URL("../src/settings/SettingsPage.tsx", import.meta.url),
  "utf8"
);
const personalSource = readFileSync(
  new URL("../src/settings/PersonalSettings.tsx", import.meta.url),
  "utf8"
);
const primitivesSource = readFileSync(
  new URL("../src/settings/SettingsPrimitives.tsx", import.meta.url),
  "utf8"
);
const appSource = readFileSync(
  new URL("../src/App.tsx", import.meta.url),
  "utf8"
);
const styles = readFileSync(
  new URL("../src/settings/settings-page.css", import.meta.url),
  "utf8"
);
const appearanceStyles = readFileSync(
  new URL("../src/settings/appearance-settings.css", import.meta.url),
  "utf8"
);
const memorySource = readFileSync(
  new URL("../src/settings/MemorySettings.tsx", import.meta.url),
  "utf8"
);
const memoryStyles = readFileSync(
  new URL("../src/settings/memory-settings.css", import.meta.url),
  "utf8"
);
const petSource = readFileSync(
  new URL("../src/settings/PetSettings.tsx", import.meta.url),
  "utf8"
);
const petStyles = readFileSync(
  new URL("../src/settings/pet-settings.css", import.meta.url),
  "utf8"
);
const layoutSpec = JSON.parse(
  readFileSync(new URL("../layout-spec.json", import.meta.url), "utf8")
);

const CONTENT_MODULES = [
  "GeneralSettingsPage",
  "ImportSettingsPage",
  "KeybindingsSettingsPage",
  "ProjectSettingsPage",
  "WorktreeSettingsPage",
  "ProviderSettingsPage",
  "ComputerUseSettingsPage",
  "BrowserUseSettingsPage",
  "AppshotsSettingsPage",
  "DeviceSyncSettingsPage",
  "DeveloperSettingsPage",
] as const;

describe("Settings page layout contract", () => {
  test("places the Back action above the settings menu", () => {
    const backIndex = source.indexOf("data-settings-back");
    const menuIndex = source.indexOf("<nav", backIndex);

    expect(backIndex).toBeGreaterThan(-1);
    expect(menuIndex).toBeGreaterThan(backIndex);
  });

  test("groups the settings menu and keeps it scrollable in short windows", () => {
    const personalIndex = source.indexOf('labelKey: "settings.navPersonal"');
    const workspaceIndex = source.indexOf('labelKey: "settings.navWorkspace"');
    const integrationsIndex = source.indexOf(
      'labelKey: "settings.navIntegrations"'
    );

    expect(personalIndex).toBeGreaterThan(-1);
    expect(workspaceIndex).toBeGreaterThan(personalIndex);
    expect(integrationsIndex).toBeGreaterThan(workspaceIndex);
    expect(source).toMatch(
      /<nav[\s\S]*?className="[^"]*\bmin-h-0\b[^"]*\boverflow-y-auto\b[^"]*"/
    );
  });

  test("matches the settings sidebar to the persisted main rail width", () => {
    expect(appSource).toMatch(
      /<SettingsPage[\s\S]*?sidebarWidth=\{railWidth\}/
    );
    expect(source).toContain(
      '"--settings-sidebar-width": `${Math.min(420, Math.max(220, sidebarWidth))}px`'
    );
    expect(styles).toMatch(
      /\.settings-sidebar \{[\s\S]*?width: var\(--settings-sidebar-width\);/
    );
    expect(source).not.toContain('className="glass-rail flex w-56');
  });

  test("collapses navigation labels and stacks regular rows when space is constrained", () => {
    expect(source).toContain("settings-nav-label");
    expect(primitivesSource).toContain("settings-row-control");
    expect(styles).toContain("@media (max-width: 44rem)");
    expect(styles).toMatch(/\.settings-sidebar \{[\s\S]*?width: 4rem;/);
    expect(styles).toContain("@container settings-page (max-width: 36rem)");
    expect(styles).toContain(".settings-row:not([data-compact])");
  });

  test("uses a compact item rhythm inside visibly separated groups", () => {
    expect(source).toContain('className="space-y-1"');
    expect(source).toContain('className="min-h-0 flex-1 space-y-6');
    expect(source).toContain("<NavigationRow");
    expect(source).toContain("label={t(labelKey)}");
    expect(source).toContain("leading={<Icon />}");
    expect(source).toContain("current={id === tab}");
    expect(source).toContain("onSelect={() => setTab(id)}");
  });

  test("uses the standard Button for the Back action", () => {
    expect(source).toMatch(
      /<Button[\s\S]*?data-settings-back[\s\S]*?variant="ghost"[\s\S]*?size="row"/
    );
  });

  test("keeps every settings tab on the shared titlebar", () => {
    expect(source).toMatch(
      /<header[\s\S]*?data-settings-titlebar[\s\S]*?className="[^"]*\bsettings-titlebar\b[^"]*\bshrink-0\b[^"]*"/
    );
    expect(styles).toContain("height: var(--ds-layout-titlebar-height);");
  });

  test("starts each settings tab at the top of its content", () => {
    expect(source).toContain(
      '<ScrollArea key={tab} className="min-h-0 flex-1">'
    );
  });

  test("dismisses the narrow sidebar before opening settings from it", () => {
    expect(appSource).toMatch(
      /onOpenSettings=\{\(\) => \{[\s\S]*?setSettingsInitialTab\("general"\);\s*if \(railOverlay\) setNarrowRailOpen\(false\);\s*setShowSettings\(true\);/
    );
    expect(appSource).toMatch(
      /onOpenUsage=\{\(\) => \{[\s\S]*?setSettingsInitialTab\("usage"\);\s*if \(railOverlay\) setNarrowRailOpen\(false\);\s*setShowSettings\(true\);/
    );
  });

  test("includes Usage as a first-class settings panel", () => {
    expect(source).toMatch(
      /\{ id: "usage", icon: ChartNoAxesColumn, labelKey: "usage\.title" \}/
    );
    expect(source).toContain('{tab === "usage" && (');
    expect(source).toMatch(
      /<UsagePanel[\s\S]*?provider=\{provider\}[\s\S]*?providerNames=\{providerNames\}[\s\S]*?\/>/
    );
  });

  test("includes Profile as a first-class personal panel", () => {
    expect(source).toMatch(
      /\{ id: "profile", icon: UserRound, labelKey: "profile\.title" \}/
    );
    expect(source).toContain(
      '{tab === "profile" && <ProfileSettings providerNames={providerNames} />}'
    );
    expect(styles).toContain(".settings-profile-page");
    expect(styles).toContain(".profile-activity-grid");
    expect(styles).toContain("@container settings-page (max-width: 40rem)");
    expect(styles).toMatch(
      /@container settings-page \(max-width: 40rem\) \{[\s\S]*?\.profile-header \{[\s\S]*?flex-direction: column;[\s\S]*?\.profile-activity-body \{[\s\S]*?grid-template-columns: 1fr;/
    );
    expect(styles).toContain("@container settings-page (max-width: 38rem)");
  });

  test("gives Appearance a spaced flat hierarchy instead of stacked elevation cards", () => {
    expect(layoutSpec.content.settings.appearance).toMatchObject({
      sectionGap: 32,
      contentGap: 12,
      schemeColumns: 3,
      themeColumns: 3,
      paletteColumns: 2,
      compactAt: 608,
      compactThemeColumns: 2,
      compactPaletteColumns: 1,
      auxiliaryAt: 480,
      auxiliarySchemeColumns: 1,
      auxiliaryThemeColumns: 1,
    });
    expect(appearanceStyles).toMatch(
      /\.appearance-settings\s*{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[^}]*gap:\s*var\(--ds-space-page-section\);/s
    );
    expect(appearanceStyles).toMatch(
      /\.appearance-section\s*{[^}]*gap:\s*var\(--ds-space-surface-inset\);/s
    );
    expect(appearanceStyles).toContain(".appearance-setting-group");
    expect(appearanceStyles).toContain(".appearance-editor-surface");
    expect(appearanceStyles).not.toMatch(
      /\.appearance-(?:scheme-option|theme-card)\s*{[^}]*box-shadow:\s*var\(--ds-elevation-surface\)/s
    );
    const compactAppearanceStyles = appearanceStyles.slice(
      appearanceStyles.indexOf("@container (max-width: 38rem)"),
      appearanceStyles.indexOf("@container (max-width: 30rem)")
    );
    expect(compactAppearanceStyles).toMatch(
      /\.appearance-theme-grid\s*{[^}]*repeat\(2, minmax\(0, 1fr\)\)/s
    );
    expect(compactAppearanceStyles).toMatch(
      /\.appearance-palette-grid,\s*\.appearance-profile-grid\s*{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s
    );
    expect(appearanceStyles).toMatch(
      /@container \(max-width:\s*30rem\)[\s\S]*?\.appearance-scheme-grid,[\s\S]*?\.appearance-theme-grid\s*{[^}]*minmax\(0, 1fr\)/
    );
    expect(appearanceStyles).toMatch(
      /@container \(max-width:\s*30rem\)[\s\S]*?\.appearance-scheme-option\s*{[^}]*grid-template-columns:\s*minmax\(0, 9rem\) minmax\(0, 1fr\)/
    );
  });

  test("includes session import as a first-class personal panel", () => {
    expect(source).toMatch(
      /\{ id: "import", icon: Download, labelKey: "settings\.import" \}/
    );
    expect(source).toContain('{tab === "import" && (');
    expect(personalSource).toContain("data-session-import-result");
  });

  test("includes Pets as a first-class settings panel", () => {
    expect(source).toMatch(
      /\{ id: "pets", icon: PawPrint, labelKey: "settings\.pets" \}/
    );
    expect(source).toContain('{tab === "pets" && (');
    expect(source).toMatch(
      /<Page title=\{t\("settings\.pets"\)\}>[\s\S]*?<PetSettings \/>/
    );
    expect(primitivesSource).toContain("<SettingsPanel");
  });

  test("keeps Settings content clear of the bottom scroll boundary", () => {
    expect(layoutSpec.content.settings.bottomPadding).toBe(80);
    expect(source).not.toContain('"settings-page mx-auto w-full pb-20"');
    expect(styles).toMatch(
      /\.settings-page\s*{[^}]*padding:\s*2rem 2rem var\(--ds-space-page-end\);/s
    );
    expect(styles).toMatch(
      /@media \(max-width:\s*44rem\)[\s\S]*?\.settings-page\s*{[^}]*padding:\s*1rem 1rem var\(--ds-space-page-end\);/
    );
  });

  test("reuses flat setting rows for the Pets catalog and behavior group", () => {
    expect(petSource).toContain('<ul className="pet-catalog"');
    expect(petSource).toContain('className="pet-catalog-row"');
    expect(petSource).toContain("<SettingRow");
    expect(petSource).not.toContain('surface="card"');
    expect(petStyles).toContain(".pet-setting-group");
    expect(petStyles).not.toMatch(/\.pet-catalog\s*{[^}]*box-shadow:/s);
    expect(petStyles).toContain("width: 3.5rem;");
    expect(petStyles).toContain("height: 3.5rem;");
    expect(petStyles).toContain("overflow: hidden;");
    expect(petStyles).toContain("contain: paint;");
  });

  test("removes and closes the Memory tab when its component policy is disabled", () => {
    expect(source).toContain(
      'group.items.filter(({ id }) => memoryEnabled || id !== "memory")'
    );
    expect(source).toContain('current === "memory" ? "general" : current');
    expect(source).toMatch(
      /\{tab === "memory" && memoryEnabled && \([\s\S]*?<MemorySettingsPage[\s\S]*?projectPath=\{projectPath\}[\s\S]*?projects=\{projects\}[\s\S]*?onOpenSession=\{onOpenSession\}[\s\S]*?\/>(?:[\s\S]*?)\)\}/
    );
  });

  test("groups the Memory library into one neutral workbench", () => {
    expect(layoutSpec.content.settings.memory).toMatchObject({
      sectionGap: 16,
      workbenchMinHeight: 544,
      listFraction: 1.08,
      detailFraction: 0.92,
      detailMinWidth: 320,
      detailCollapseAt: 1024,
      toolbarColumns: 4,
      compactToolbarColumns: 2,
      compactViewBehavior: "wrap",
    });
    expect(memorySource).toContain("<PageHeader");
    expect(memorySource).toContain('className="memory-workbench"');
    expect(memorySource).toContain('className="memory-view-switcher"');
    expect(memorySource).toContain(
      '{ value: "conflicts", key: "memory.view.conflicts" }'
    );
    expect(memoryStyles).toMatch(
      /\.memory-workbench\s*{[^}]*overflow:\s*clip;[^}]*background:\s*var\(--background\);/s
    );
    expect(memoryStyles).toMatch(
      /\.memory-detail-panel\s*{[^}]*background:\s*var\(--background\);[^}]*box-shadow:\s*inset/s
    );
    expect(memoryStyles).toMatch(
      /\.memory-management-grid\s*{[^}]*grid-template-columns:\s*minmax\(0, 1\.08fr\) minmax\(20rem, 0\.92fr\);/s
    );
    expect(memoryStyles).toMatch(
      /@media \(max-width:\s*64rem\)[\s\S]*?\.memory-detail-panel\s*{[^}]*display:\s*none;/
    );
    expect(memoryStyles).toMatch(
      /@media \(max-width:\s*50rem\)[\s\S]*?\.memory-view-switcher > \[data-slot="view-switcher"\]\s*{[^}]*flex-wrap:\s*wrap;/
    );
    expect(memoryStyles).toMatch(
      /\.memory-view-switcher \[data-slot="button"\]\[data-selected="true"\]::after\s*{[^}]*height:\s*var\(--ds-space-optical\);[^}]*background:\s*var\(--primary\);[^}]*content:\s*"";/s
    );
    expect(memoryStyles).not.toMatch(
      /\.memory-view-switcher \[data-slot="button"\]\[data-selected="true"\]\s*{[^}]*box-shadow:\s*inset/s
    );
  });

  test("keeps the settings shell separate from stateful content modules", () => {
    for (const module of CONTENT_MODULES) {
      expect(source).toContain(`<${module}`);
    }
    expect(source).not.toContain("setAppUpdate");
    expect(source).not.toContain("setAppshotSettings");
    expect(source).not.toContain("setProviderOperation");
    expect(source).not.toContain("setComputerUseSettings");
    expect(source).not.toContain("setWorktreesByProject");
    expect(source).not.toContain("setProjectNameDraft");
  });
});
