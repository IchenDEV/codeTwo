import { useEffect, useState } from "react";
import type { CSSProperties } from "react";

import { NavigationRow } from "@/components/business/navigation-row";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  BrainCircuit,
  ChartNoAxesColumn,
  Download,
  Folder,
  GitBranch,
  Globe,
  Keyboard,
  MousePointer2,
  Package,
  Palette,
  PawPrint,
  RefreshCw,
  RotateCcw,
  ScanText,
  SlidersHorizontal,
  UserRound,
  Wrench,
} from "@/components/ui/icons";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

import { resetVisualAppearanceSettings } from "../appearance";
import {
  checkForAppUpdates,
  confirmNative,
  discardOrphanWorktree,
  discardSessionWorktree,
  getAppUpdateStatus,
  getWorktreeSettings,
  listProjectWorktrees,
  updateWorktreeSettings,
} from "../bridge";
import type {
  AppshotSettings,
  BrowserUseSettings,
  ComputerUseSettings,
  AppUpdateStatus,
  DeviceSyncStatus,
  DiagnosticsExportResult,
  KeymapEntry,
  Project,
  ProjectWorktreeMode,
  ProviderInfo,
  ProviderRuntimeOverride,
  SessionImportResult,
  WorktreeSettings,
  PluginDeveloperStatus,
} from "../bridge";
import { useLanguage, useT } from "../i18n";
import type { StringKey } from "../i18n/strings";
import { useTheme } from "../theme";
import { UsagePanel } from "../usage/Usage";
import { AppearanceSettings } from "./AppearanceSettings";
import { AppshotsSettingsPage } from "./AppshotsSettings";
import { MemorySettingsPage } from "./MemorySettings";
import {
  BrowserPermissionsSettingsPage,
  BrowserUseSettingsPage,
  ComputerUseSettingsPage,
  DeveloperSettingsPage,
  DeviceSyncSettingsPage,
} from "./OperationalSettings";
import {
  GeneralSettingsPage,
  ImportSettingsPage,
  KeybindingsSettingsPage,
} from "./PersonalSettings";
import { PetSettings } from "./PetSettings";
import { ProfileSettings } from "./ProfileSettings";
import { ProjectSettingsPage } from "./ProjectSettings";
import { ProviderSettingsPage } from "./ProviderSettings";
import { Page } from "./SettingsPrimitives";
import { WorktreeSettingsPage } from "./WorktreeSettings";

import "./settings-page.css";

export type SettingsTab =
  | "general"
  | "import"
  | "profile"
  | "appearance"
  | "pets"
  | "project"
  | "worktrees"
  | "memory"
  | "sync"
  | "keybindings"
  | "providers"
  | "computer-use"
  | "appshots"
  | "browser-use"
  | "usage"
  | "developer"
  | "browser";

type SettingsNavItem = {
  id: SettingsTab;
  icon: typeof Keyboard;
  labelKey: StringKey;
};

const navGroups: {
  id: "personal" | "workspace" | "integrations";
  labelKey: StringKey;
  items: SettingsNavItem[];
}[] = [
  {
    id: "personal",
    items: [
      { icon: SlidersHorizontal, id: "general", labelKey: "settings.general" },
      { icon: Download, id: "import", labelKey: "settings.import" },
      { icon: UserRound, id: "profile", labelKey: "profile.title" },
      { icon: Palette, id: "appearance", labelKey: "settings.appearance" },
      { icon: PawPrint, id: "pets", labelKey: "settings.pets" },
      { icon: Keyboard, id: "keybindings", labelKey: "settings.keybindings" },
      { icon: ChartNoAxesColumn, id: "usage", labelKey: "usage.title" },
    ],
    labelKey: "settings.navPersonal",
  },
  {
    id: "workspace",
    items: [
      { icon: Folder, id: "project", labelKey: "settings.project" },
      { icon: GitBranch, id: "worktrees", labelKey: "settings.worktrees" },
      { icon: BrainCircuit, id: "memory", labelKey: "memory.title" },
      { icon: RefreshCw, id: "sync", labelKey: "settings.sync" },
    ],
    labelKey: "settings.navWorkspace",
  },
  {
    id: "integrations",
    items: [
      { icon: Package, id: "providers", labelKey: "settings.providers" },
      {
        icon: MousePointer2,
        id: "computer-use",
        labelKey: "settings.computerUse",
      },
      { icon: ScanText, id: "appshots", labelKey: "settings.appshots" },
      { icon: Globe, id: "browser-use", labelKey: "settings.browserUse" },
      { icon: Globe, id: "browser", labelKey: "settings.browser" },
      { icon: Wrench, id: "developer", labelKey: "settings.developer" },
    ],
    labelKey: "settings.navIntegrations",
  },
];

const emptyProjects: Project[] = [];

export function SettingsPage({
  sidebarWidth = 288,
  bindings,
  capturing,
  onCapture,
  onReset,
  onResetAll,
  providers,
  provider,
  projectPath,
  project,
  projects = emptyProjects,
  onProjectWorktreeMode,
  onProjectRename = async () => {},
  onProjectIcon = async () => {},
  onProjectAgentDefaults = async () => {},
  onProjectRemove = async () => {},
  projectIconPicker,
  projectActionsCount = 0,
  onAddProjectAction = () => {},
  onOpenSession = () => {},
  sessionImporter,
  onSessionsImported = async () => {},
  worktreeLister = listProjectWorktrees,
  worktreeSettingsLoader = getWorktreeSettings,
  worktreeSettingsSaver = updateWorktreeSettings,
  sessionWorktreeDiscarder = discardSessionWorktree,
  orphanWorktreeDiscarder = discardOrphanWorktree,
  worktreeDiscardConfirmer = confirmNative,
  onReloadProviders,
  memoryEnabled,
  deviceSyncEnabled = true,
  initialTab = "general",
  onClose,
  updateStatusLoader = getAppUpdateStatus,
  updateCheckStarter = checkForAppUpdates,
  computerUseSettingsLoader,
  computerUseSelectionSaver,
  browserUseSettingsLoader,
  browserUseSelectionSaver,
  browserUseAccessSaver,
  appshotSettingsLoader,
  appshotSettingsSaver,
  appshotPermissionRequester,
  appshotPrivacyOpener,
  appshotCapturer,
  providerInstaller,
  providerUpgrader,
  providerEnabledSaver,
  providerConfigurationSaver,
  deviceSyncStatusLoader,
  deviceSyncEnabledSaver,
  deviceSyncStarter,
  pluginDeveloperStatusLoader,
  pluginDeveloperModeSaver,
  pluginDeveloperReloader,
  devtoolsOpener,
  diagnosticsExporter,
}: {
  /**
  Matches the persisted width of the main session rail.
  */
  readonly sidebarWidth?: number;
  readonly bindings: KeymapEntry[];
  readonly capturing: string | null;
  readonly onCapture: (action: string) => void;
  readonly onReset?: (action: string) => void;
  /**
  Restore every shortcut to the shipped default — the header's "Restore defaults" on that tab.
  */
  readonly onResetAll?: () => void;
  readonly providers: ProviderInfo[];
  readonly provider: string;
  readonly projectPath: string;
  readonly project: Project | null;
  readonly projects?: Project[];
  readonly onProjectWorktreeMode: (
    path: string,
    mode: ProjectWorktreeMode | null
  ) => Promise<void>;
  readonly onProjectRename?: (path: string, name: string) => Promise<void>;
  readonly onProjectIcon?: (
    path: string,
    source: string | null
  ) => Promise<void>;
  readonly onProjectAgentDefaults?: (
    path: string,
    provider: string | null,
    model: string | null,
    reasoningEffort: string | null
  ) => Promise<void>;
  readonly onProjectRemove?: (path: string) => Promise<void>;
  readonly projectIconPicker?: () => Promise<string | null>;
  readonly projectActionsCount?: number;
  readonly onAddProjectAction?: () => void;
  readonly onOpenSession?: (sessionId: string) => void;
  readonly sessionImporter?: (
    fallbackCwd: string
  ) => Promise<SessionImportResult | null>;
  readonly onSessionsImported?: () => void | Promise<unknown>;
  readonly worktreeLister?: typeof listProjectWorktrees;
  readonly worktreeSettingsLoader?: () => Promise<WorktreeSettings>;
  readonly worktreeSettingsSaver?: (
    settings: WorktreeSettings
  ) => Promise<WorktreeSettings>;
  readonly sessionWorktreeDiscarder?: typeof discardSessionWorktree;
  readonly orphanWorktreeDiscarder?: typeof discardOrphanWorktree;
  readonly worktreeDiscardConfirmer?: typeof confirmNative;
  readonly onReloadProviders?: () => void | Promise<ProviderInfo[]>;
  readonly memoryEnabled: boolean;
  readonly deviceSyncEnabled?: boolean;
  readonly initialTab?: SettingsTab;
  readonly onClose: () => void;
  readonly updateStatusLoader?: () => Promise<AppUpdateStatus>;
  readonly updateCheckStarter?: () => Promise<AppUpdateStatus>;
  readonly computerUseSettingsLoader?: () => Promise<ComputerUseSettings>;
  readonly computerUseSelectionSaver?: (
    backend: string
  ) => Promise<ComputerUseSettings>;
  readonly browserUseSettingsLoader?: () => Promise<BrowserUseSettings>;
  readonly browserUseSelectionSaver?: (
    backend: string
  ) => Promise<BrowserUseSettings>;
  readonly browserUseAccessSaver?: (
    isEnabled: boolean
  ) => Promise<BrowserUseSettings>;
  readonly appshotSettingsLoader?: () => Promise<AppshotSettings>;
  readonly appshotSettingsSaver?: (
    patch: Partial<
      Pick<AppshotSettings, "hotkey" | "destination" | "play_sound">
    >
  ) => Promise<AppshotSettings>;
  readonly appshotPermissionRequester?: (
    kind: "screen-recording" | "accessibility"
  ) => Promise<AppshotSettings>;
  readonly appshotPrivacyOpener?: (
    kind: "screen-recording" | "accessibility"
  ) => Promise<boolean>;
  readonly appshotCapturer?: () => Promise<unknown>;
  readonly providerInstaller?: (provider: string) => Promise<ProviderInfo[]>;
  readonly providerUpgrader?: (provider: string) => Promise<ProviderInfo[]>;
  readonly providerEnabledSaver?: (
    provider: string,
    isEnabled: boolean
  ) => Promise<ProviderInfo[]>;
  readonly providerConfigurationSaver?: (
    provider: string,
    configuration: ProviderRuntimeOverride
  ) => Promise<ProviderInfo[]>;
  readonly deviceSyncStatusLoader?: () => Promise<DeviceSyncStatus>;
  readonly deviceSyncEnabledSaver?: (
    isEnabled: boolean
  ) => Promise<DeviceSyncStatus>;
  readonly deviceSyncStarter?: () => Promise<DeviceSyncStatus>;
  readonly pluginDeveloperStatusLoader?: () => Promise<PluginDeveloperStatus>;
  readonly pluginDeveloperModeSaver?: (
    isEnabled: boolean
  ) => Promise<PluginDeveloperStatus>;
  readonly pluginDeveloperReloader?: () => Promise<PluginDeveloperStatus>;
  readonly devtoolsOpener?: () => Promise<void>;
  readonly diagnosticsExporter?: () => Promise<DiagnosticsExportResult>;
}) {
  const t = useT();
  const { preference: theme, setPreference: setTheme } = useTheme();
  const { setPreference: setLanguage } = useLanguage();
  const providerNames = Object.fromEntries(
    providers.map((candidate) => [candidate.id, candidate.display_name])
  );
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const [projectNavigationLocked, setProjectNavigationLocked] = useState(false);
  useEffect(() => setTab(initialTab), [initialTab]);
  useEffect(() => {
    if (!memoryEnabled) {
      setTab((current) => (current === "memory" ? "general" : current));
    }
  }, [memoryEnabled]);
  useEffect(() => {
    if (!deviceSyncEnabled) {
      setTab((current) => (current === "sync" ? "general" : current));
    }
  }, [deviceSyncEnabled]);

  // What "Restore defaults" means depends on where you're standing.
  const restore = () => {
    if (tab === "general") {
      setLanguage("system");
    } else if (tab === "appearance") {
      resetVisualAppearanceSettings();
    } else if (tab === "keybindings") {
      onResetAll?.();
    }
  };

  return (
    <div className="animate-page-in flex min-h-0 min-w-0 flex-1">
      {/* ---- nav rail — same material as the app's rail, so settings still feels like this app */}
      <aside
        data-settings-sidebar
        className="settings-sidebar glass-rail flex shrink-0 flex-col"
        style={
          {
            "--settings-sidebar-width": `${Math.min(420, Math.max(220, sidebarWidth))}px`,
          } as CSSProperties
        }
      >
        {/* Same 46px title bar as the main shell — clears the traffic lights and drags the window. */}
        <div className="electrobun-webkit-app-region-drag settings-titlebar shrink-0" />
        <Button
          data-settings-back
          type="button"
          variant="ghost"
          size="row"
          disabled={projectNavigationLocked}
          onClick={onClose}
          aria-label={t("settings.back")}
          title={t("settings.back")}
          className="text-muted-foreground mx-3 mb-2 w-auto"
        >
          <ArrowLeft className="size-3.5 shrink-0" />
          <span className="settings-back-label">{t("settings.back")}</span>
        </Button>
        <nav
          aria-label={t("settings.title")}
          className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-3 pt-2 pb-6"
        >
          <div className="space-y-6">
            {navGroups.map((group) => {
              const items = group.items
                .filter(({ id }) => memoryEnabled || id !== "memory")
                .filter(({ id }) => deviceSyncEnabled || id !== "sync");
              const headingId = `settings-nav-${group.id}`;
              return (
                <section
                  key={group.id}
                  aria-label={t(group.labelKey)}
                  aria-labelledby={headingId}
                >
                  <h2
                    id={headingId}
                    className="settings-nav-heading text-metadata text-muted-foreground px-2 pb-2 font-medium"
                  >
                    {t(group.labelKey)}
                  </h2>
                  <div className="space-y-1">
                    {items.map(({ id, icon: Icon, labelKey }) => (
                      <NavigationRow
                        key={id}
                        className="settings-nav-item"
                        labelClassName="settings-nav-label"
                        label={t(labelKey)}
                        leading={<Icon />}
                        current={id === tab}
                        accessibilityLabel={t(labelKey)}
                        tooltip={t(labelKey)}
                        onSelect={() => setTab(id)}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </nav>
      </aside>

      {/* ---- the page ---- */}
      <main className="bg-background flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* The same 46px bar as the main shell's header, border and all. */}
        <header
          data-settings-titlebar
          className="electrobun-webkit-app-region-drag settings-titlebar flex shrink-0 items-center gap-1.5 border-b pt-1.5 pr-3 pb-1.5 pl-6"
        >
          <span className="electrobun-webkit-app-region-drag text-body text-muted-foreground font-medium">
            {tab === "profile" ? t("profile.title") : t("settings.title")}
          </span>
          <div className="electrobun-webkit-app-region-drag flex-1" />
          {(tab === "general" ||
            tab === "appearance" ||
            tab === "keybindings") && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-control-group text-metadata text-muted-foreground hover:text-foreground"
              onClick={restore}
            >
              <RotateCcw className="size-3.5" />
              {t("settings.restoreDefaults")}
            </Button>
          )}
        </header>

        <ScrollArea key={tab} className="min-h-0 flex-1">
          <div
            className={cn(
              "settings-page mx-auto w-full",
              tab === "profile" && "settings-profile-page",
              tab === "worktrees" && "settings-worktrees-page"
            )}
          >
            {tab === "general" && (
              <GeneralSettingsPage
                statusLoader={updateStatusLoader}
                checkStarter={updateCheckStarter}
              />
            )}

            {tab === "import" && (
              <ImportSettingsPage
                projectPath={projectPath}
                importer={sessionImporter}
                onImported={onSessionsImported}
                onOpenSession={onOpenSession}
              />
            )}

            {tab === "appearance" && (
              <Page
                title={t("settings.appearance")}
                description={t("settings.appearanceHint")}
              >
                <AppearanceSettings value={theme} onChange={setTheme} />
              </Page>
            )}

            {tab === "profile" && (
              <ProfileSettings providerNames={providerNames} />
            )}

            {tab === "pets" && (
              <Page title={t("settings.pets")}>
                <PetSettings />
              </Page>
            )}

            {tab === "sync" && deviceSyncEnabled ? (
              <DeviceSyncSettingsPage
                loader={deviceSyncStatusLoader}
                enabledSaver={deviceSyncEnabledSaver}
                syncStarter={deviceSyncStarter}
              />
            ) : null}

            {tab === "keybindings" && (
              <KeybindingsSettingsPage
                bindings={bindings}
                capturing={capturing}
                onCapture={onCapture}
                onReset={onReset}
              />
            )}

            {tab === "project" && (
              <ProjectSettingsPage
                project={project}
                providers={providers}
                onWorktreeMode={onProjectWorktreeMode}
                onRename={onProjectRename}
                onIcon={onProjectIcon}
                onAgentDefaults={onProjectAgentDefaults}
                onRemove={onProjectRemove}
                iconPicker={projectIconPicker}
                actionsCount={projectActionsCount}
                onAddAction={onAddProjectAction}
                onModeSavingChange={setProjectNavigationLocked}
              />
            )}

            {tab === "worktrees" && (
              <WorktreeSettingsPage
                projects={projects}
                onOpenSession={onOpenSession}
                lister={worktreeLister}
                settingsLoader={worktreeSettingsLoader}
                settingsSaver={worktreeSettingsSaver}
                sessionDiscarder={sessionWorktreeDiscarder}
                orphanDiscarder={orphanWorktreeDiscarder}
                confirmer={worktreeDiscardConfirmer}
              />
            )}

            {tab === "memory" && memoryEnabled ? (
              <MemorySettingsPage
                projectPath={projectPath}
                projects={projects}
                onOpenSession={onOpenSession}
              />
            ) : null}

            {tab === "usage" && (
              <UsagePanel
                provider={provider}
                providerName={
                  providers.find((candidate) => candidate.id === provider)
                    ?.display_name ?? provider
                }
                providerNames={providerNames}
              />
            )}

            {tab === "computer-use" && (
              <ComputerUseSettingsPage
                loader={computerUseSettingsLoader}
                saver={computerUseSelectionSaver}
              />
            )}

            {tab === "appshots" && (
              <AppshotsSettingsPage
                loader={appshotSettingsLoader}
                saver={appshotSettingsSaver}
                permissionRequester={appshotPermissionRequester}
                privacyOpener={appshotPrivacyOpener}
                capturer={appshotCapturer}
              />
            )}

            {tab === "browser-use" && (
              <BrowserUseSettingsPage
                loader={browserUseSettingsLoader}
                saver={browserUseSelectionSaver}
                accessSaver={browserUseAccessSaver}
              />
            )}

            {tab === "providers" && (
              <ProviderSettingsPage
                providers={providers}
                reload={onReloadProviders}
                installer={providerInstaller}
                upgrader={providerUpgrader}
                enabledSaver={providerEnabledSaver}
                configurationSaver={providerConfigurationSaver}
              />
            )}
            {tab === "developer" && (
              <DeveloperSettingsPage
                loader={pluginDeveloperStatusLoader}
                modeSaver={pluginDeveloperModeSaver}
                reloader={pluginDeveloperReloader}
                devtoolsOpener={devtoolsOpener}
                diagnosticsExporter={diagnosticsExporter}
              />
            )}

            {tab === "browser" && <BrowserPermissionsSettingsPage />}
          </div>
        </ScrollArea>
      </main>
    </div>
  );
}
