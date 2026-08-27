import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const source = readFileSync(new URL("../src/settings/SettingsPage.tsx", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/settings/settings-page.css", import.meta.url), "utf8");
const petStyles = readFileSync(new URL("../src/settings/pet-settings.css", import.meta.url), "utf8");

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
    const integrationsIndex = source.indexOf('labelKey: "settings.navIntegrations"');

    expect(personalIndex).toBeGreaterThan(-1);
    expect(workspaceIndex).toBeGreaterThan(personalIndex);
    expect(integrationsIndex).toBeGreaterThan(workspaceIndex);
    expect(source).toMatch(
      /<nav[\s\S]*?className="[^"]*\bmin-h-0\b[^"]*\boverflow-y-auto\b[^"]*"/,
    );
  });

  test("matches the settings sidebar to the persisted main rail width", () => {
    expect(appSource).toMatch(/<SettingsPage[\s\S]*?sidebarWidth=\{railWidth\}/);
    expect(source).toContain('"--settings-sidebar-width": `${Math.min(420, Math.max(220, sidebarWidth))}px`');
    expect(styles).toMatch(/\.settings-sidebar \{[\s\S]*?width: var\(--settings-sidebar-width\);/);
    expect(source).not.toContain('className="glass-rail flex w-56');
  });

  test("collapses navigation labels and stacks regular rows when space is constrained", () => {
    expect(source).toContain("settings-nav-label");
    expect(source).toContain("settings-row-control");
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
      /<Button[\s\S]*?data-settings-back[\s\S]*?variant="ghost"[\s\S]*?size="row"/,
    );
  });

  test("keeps every settings tab on the shared 48px titlebar", () => {
    expect(source).toMatch(
      /<header[\s\S]*?data-settings-titlebar[\s\S]*?className="[^"]*\bsettings-titlebar\b[^"]*\bshrink-0\b[^"]*"/,
    );
    expect(styles).toContain("height: var(--ds-layout-titlebar-height);");
  });

  test("starts each settings tab at the top of its content", () => {
    expect(source).toContain('<ScrollArea key={tab} className="min-h-0 flex-1">');
  });

  test("dismisses the narrow sidebar before opening settings from it", () => {
    expect(appSource).toMatch(
      /onOpenSettings=\{\(\) => \{[\s\S]*?setSettingsInitialTab\("general"\);\s*if \(railOverlay\) setNarrowRailOpen\(false\);\s*setShowSettings\(true\);/,
    );
    expect(appSource).toMatch(
      /onOpenUsage=\{\(\) => \{[\s\S]*?setSettingsInitialTab\("usage"\);\s*if \(railOverlay\) setNarrowRailOpen\(false\);\s*setShowSettings\(true\);/,
    );
  });

  test("includes Usage as a first-class settings panel", () => {
    expect(source).toMatch(/\{ id: "usage", icon: ChartNoAxesColumn, labelKey: "usage\.title" \}/);
    expect(source).toContain('{tab === "usage" && (');
    expect(source).toMatch(
      /<UsagePanel[\s\S]*?provider=\{provider\}[\s\S]*?providerNames=\{providerNames\}[\s\S]*?\/>/,
    );
  });

  test("includes Profile as a first-class personal panel", () => {
    expect(source).toMatch(/\{ id: "profile", icon: UserRound, labelKey: "profile\.title" \}/);
    expect(source).toContain('{tab === "profile" && <ProfileSettings providerNames={providerNames} />}');
    expect(styles).toContain(".settings-profile-page");
    expect(styles).toContain(".profile-activity-grid");
    expect(styles).toContain("@container settings-page (max-width: 40rem)");
    expect(styles).toMatch(
      /@container settings-page \(max-width: 40rem\) \{[\s\S]*?\.profile-header \{[\s\S]*?flex-direction: column;[\s\S]*?\.profile-activity-body \{[\s\S]*?grid-template-columns: 1fr;/,
    );
    expect(styles).toContain("@container settings-page (max-width: 38rem)");
  });

  test("includes session import as a first-class personal panel", () => {
    expect(source).toMatch(/\{ id: "import", icon: Download, labelKey: "settings\.import" \}/);
    expect(source).toContain('{tab === "import" && (');
    expect(source).toContain("data-session-import-result");
  });

  test("includes Pets as a first-class settings panel", () => {
    expect(source).toMatch(/\{ id: "pets", icon: PawPrint, labelKey: "settings\.pets" \}/);
    expect(source).toContain('{tab === "pets" && (');
    expect(source).toMatch(/<SettingsPanel title=\{t\("settings\.pets"\)\}[\s\S]*?<PetSettings \/>/);
  });

  test("clips pet catalog previews to a compact square", () => {
    expect(petStyles).toContain("width: 3.5rem;");
    expect(petStyles).toContain("height: 3.5rem;");
    expect(petStyles).toContain("overflow: hidden;");
    expect(petStyles).toContain("contain: paint;");
  });

  test("removes and closes the Memory tab when its component policy is disabled", () => {
    expect(source).toContain('group.items.filter(({ id }) => memoryEnabled || id !== "memory")');
    expect(source).toContain('current === "memory" ? "general" : current');
    expect(source).toMatch(
      /\{tab === "memory" && memoryEnabled && \([\s\S]*?<MemorySettingsPage[\s\S]*?projectPath=\{projectPath\}[\s\S]*?projects=\{projects\}[\s\S]*?onOpenSession=\{onOpenSession\}[\s\S]*?\/>(?:[\s\S]*?)\)\}/,
    );
  });
});
