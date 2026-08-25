import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  BrainCircuit,
  Bug,
  ChartNoAxesColumn,
  ChevronDown,
  Copy,
  Download,
  Folder,
  FolderOpen,
  Globe,
  ImagePlus,
  Keyboard,
  LoaderCircle,
  MousePointer2,
  Package,
  Palette,
  Plus,
  PawPrint,
  RefreshCw,
  RotateCcw,
  ScanText,
  SlidersHorizontal,
  Trash2,
  Wrench,
} from "lucide-react";

import {
  browserPermissions,
  browserRevokePermission,
  checkForAppUpdates,
  getBrowserUseSettings,
  getComputerUseSettings,
  getAppshotSettings,
  confirmNative,
  discardOrphanWorktree,
  discardSessionWorktree,
  getAppUpdateStatus,
  getDeviceSyncStatus,
  getPluginDeveloperStatus,
  listProjectWorktrees,
  selectComputerUseBackend,
  selectBrowserUseBackend,
  openAppshotPrivacySettings,
  requestAppshotPermissions,
  takeAppshot,
  updateAppshotSettings,
  type AppshotSettings,
  type BrowserUseSettings,
  type ComputerUseSettings,
  type AppUpdateStatus,
  type KeymapEntry,
  type Project,
  type ProjectWorktreeMode,
  type ProviderInfo,
  type WorktreeEntryKind,
  type WorktreeStatusEntry,
  getProjectScheduling,
  installProvider,
  openNativePath,
  openDevtools,
  onPluginsChanged,
  pickProjectIcon,
  setProviderEnabled,
  setProjectScheduling,
  upgradeProvider,
  setDeviceSyncEnabled,
  setPluginDeveloperMode,
  syncDeviceDataNow,
  reloadDevelopmentPlugins,
  type DeviceSyncStatus,
  type PluginDeveloperStatus,
} from "../bridge";
import { formatCombo, MOD_LABEL } from "../keys";
import { useLanguage, useT, type LanguagePreference } from "../i18n";
import { en as EN_STRINGS, LOCALES, type StringKey } from "../i18n/strings";
import { resetVisualAppearanceSettings } from "../appearance";
import { useTheme } from "../theme";
import { setTerminalSettings, useTerminalSettings } from "../terminal/settings";
import { ProviderIcon } from "../providers/ProviderIcon";
import { UsagePanel } from "../usage/Usage";
import { MemorySettingsPage } from "./MemorySettings";
import { AppearanceSettings } from "./AppearanceSettings";
import { ProjectIcon } from "../projects/ProjectIcon";
import { ModelPicker } from "../session/Composer";
import { PetSettings } from "./PetSettings";
import {
  worktreeBranchDisplay,
  worktreeDiscardRoute,
  worktreeStatusBadges,
  type WorktreeStatusBadge,
} from "./worktrees";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

import "./settings-page.css";

export type SettingsTab =
  | "general"
  | "appearance"
  | "pets"
  | "project"
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

const NAV_GROUPS: {
  id: "personal" | "workspace" | "integrations";
  labelKey: StringKey;
  items: SettingsNavItem[];
}[] = [
  {
    id: "personal",
    labelKey: "settings.navPersonal",
    items: [
      { id: "general", icon: SlidersHorizontal, labelKey: "settings.general" },
      { id: "appearance", icon: Palette, labelKey: "settings.appearance" },
      { id: "pets", icon: PawPrint, labelKey: "settings.pets" },
      { id: "keybindings", icon: Keyboard, labelKey: "settings.keybindings" },
      { id: "usage", icon: ChartNoAxesColumn, labelKey: "usage.title" },
    ],
  },
  {
    id: "workspace",
    labelKey: "settings.navWorkspace",
    items: [
      { id: "project", icon: Folder, labelKey: "settings.project" },
      { id: "memory", icon: BrainCircuit, labelKey: "memory.title" },
      { id: "sync", icon: RefreshCw, labelKey: "settings.sync" },
    ],
  },
  {
    id: "integrations",
    labelKey: "settings.navIntegrations",
    items: [
      { id: "providers", icon: Package, labelKey: "settings.providers" },
      { id: "computer-use", icon: MousePointer2, labelKey: "settings.computerUse" },
      { id: "appshots", icon: ScanText, labelKey: "settings.appshots" },
      { id: "browser-use", icon: Globe, labelKey: "settings.browserUse" },
      { id: "browser", icon: Globe, labelKey: "settings.browser" },
      { id: "developer", icon: Wrench, labelKey: "settings.developer" },
    ],
  },
];

const WORKTREE_KIND_LABELS: Record<WorktreeEntryKind, StringKey> = {
  session: "worktree.kindSession",
  orphan: "worktree.kindOrphan",
  stale: "worktree.kindStale",
};

const WORKTREE_BADGE_LABELS: Record<WorktreeStatusBadge, StringKey> = {
  archived: "worktree.badgeArchived",
  discarded: "worktree.badgeDiscarded",
  checkoutMissing: "worktree.badgeCheckoutMissing",
};

const CAPABILITY_LABELS = {
  image_generation: "Image generation",
  computer_use: "Computer Use",
  chrome_browser: "Browser Use",
  codetwo_browser: "C2 Browser",
  sites: "Sites",
} as const;

const PROJECT_REASONING_EFFORTS = ["minimal", "low", "medium", "high", "xhigh", "max", "ultra"] as const;
// Actions grouped by what they touch — a flat list of twenty-two is hard to scan. Anything not
// listed still shows under "Other", so a new binding is never hidden.
const GROUPS: { title: string; labelKey: StringKey; actions: string[] }[] = [
  {
    title: "Prompt",
    labelKey: "settings.groupPrompt",
    actions: ["run", "cancel", "open_skill_picker", "focus_editor", "toggle_doc_mode"],
  },
  { title: "Sessions", labelKey: "settings.groupSessions", actions: ["new_session", "prev_session", "next_session"] },
  {
    title: "Panels",
    labelKey: "settings.groupPanels",
    actions: ["toggle_terminal", "toggle_browser", "toggle_git", "close_panel"],
  },
  { title: "Git", labelKey: "settings.groupGit", actions: ["refresh_git", "open_source_control"] },
  {
    title: "Open",
    labelKey: "settings.groupOpen",
    actions: ["open_command_palette", "open_market", "open_files", "search_workspace", "open_issues", "open_usage", "open_settings"],
  },
  { title: "Modes", labelKey: "settings.groupModes", actions: ["cycle_permission_mode"] },
];

/**
 * One setting, on any tab: optional leading icon, name + explanation on the left, the control (or
 * status) on the right. Every settings page is built out of these — a page that hand-rolls its own
 * rows drifts a few pixels from the others, which is exactly the bug this shape retired.
 */
function Row({
  icon,
  label,
  hint,
  compact,
  className,
  controlClassName,
  children,
}: {
  icon?: ReactNode;
  label: string;
  hint?: ReactNode;
  /** Dense lists (keybindings) — same anatomy, tighter rhythm. */
  compact?: boolean;
  className?: string;
  controlClassName?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-8", compact ? "py-2" : "py-3.5", className)}>
      <div className="flex min-w-0 items-center gap-3">
        {icon}
        <div className="min-w-0 max-w-[420px]">
          <div className="truncate text-ui font-medium">{label}</div>
          {hint && <div className="mt-0.5 text-hint leading-relaxed text-muted-foreground">{hint}</div>}
        </div>
      </div>
      <div className={cn("flex shrink-0 items-center gap-1", controlClassName)}>{children}</div>
    </div>
  );
}

/** Project settings share one trailing control lane so fields and actions stay on the same grid. */
function ProjectRow(props: Parameters<typeof Row>[0]) {
  return (
    <Row
      {...props}
      className={cn("project-settings-row", props.className)}
      controlClassName={cn("project-settings-control", props.controlClassName)}
    />
  );
}

/** Muted uppercase divider between row groups on one page. */
function GroupHeading({ children }: { children: ReactNode }) {
  return (
    <h3 className="pt-5 text-cap font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </h3>
  );
}

/**
 * The frame every tab renders through: same title block, same description slot, same measure. The
 * description is a slot rather than an afterthought so the first row starts at the same height on
 * every page — General used to skip it and sat one line higher than the rest.
 */
function Page({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <div>
      <h1 className="text-display font-semibold tracking-tight">{title}</h1>
      {description && (
        <p className="pb-3 pt-1.5 text-hint leading-relaxed text-muted-foreground">{description}</p>
      )}
      {children}
    </div>
  );
}

/**
 * Settings as a full-window page: its own nav rail on the left (General, Memory, Keybindings,
 * Providers, Usage)
 * with a Back row above the category menu, and one scrolling column of rows per category. The
 * window-wide takeover is deliberate — a settings surface with its own sidebar reads as a *place*
 * you went to, which is what earns the explicit way back.
 */
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
  projects = [],
  onProjectWorktreeMode,
  onProjectRename = async () => {},
  onProjectIcon = async () => {},
  onProjectAgentDefaults = async () => {},
  onProjectRemove = async () => {},
  projectIconPicker = pickProjectIcon,
  projectActionsCount = 0,
  onAddProjectAction = () => {},
  onOpenSession = () => {},
  onReloadProviders,
  memoryEnabled,
  deviceSyncEnabled = true,
  initialTab = "general",
  onClose,
  updateStatusLoader = getAppUpdateStatus,
  updateCheckStarter = checkForAppUpdates,
  computerUseSettingsLoader = getComputerUseSettings,
  computerUseSelectionSaver = selectComputerUseBackend,
  browserUseSettingsLoader = getBrowserUseSettings,
  browserUseSelectionSaver = selectBrowserUseBackend,
  appshotSettingsLoader = getAppshotSettings,
  appshotSettingsSaver = updateAppshotSettings,
  appshotPermissionRequester = requestAppshotPermissions,
  appshotPrivacyOpener = openAppshotPrivacySettings,
  appshotCapturer = takeAppshot,
  providerInstaller = installProvider,
  providerUpgrader = upgradeProvider,
  providerEnabledSaver = setProviderEnabled,
  deviceSyncStatusLoader = getDeviceSyncStatus,
  deviceSyncEnabledSaver = setDeviceSyncEnabled,
  deviceSyncStarter = syncDeviceDataNow,
  pluginDeveloperStatusLoader = getPluginDeveloperStatus,
  pluginDeveloperModeSaver = setPluginDeveloperMode,
  pluginDeveloperReloader = reloadDevelopmentPlugins,
  devtoolsOpener = openDevtools,
}: {
  /** Matches the persisted width of the main session rail. */
  sidebarWidth?: number;
  bindings: KeymapEntry[];
  capturing: string | null;
  onCapture: (action: string) => void;
  onReset?: (action: string) => void;
  /** Restore every shortcut to the shipped default — the header's "Restore defaults" on that tab. */
  onResetAll?: () => void;
  providers: ProviderInfo[];
  provider: string;
  projectPath: string;
  project: Project | null;
  projects?: Project[];
  onProjectWorktreeMode: (path: string, mode: ProjectWorktreeMode | null) => Promise<void>;
  onProjectRename?: (path: string, name: string) => Promise<void>;
  onProjectIcon?: (path: string, source: string | null) => Promise<void>;
  onProjectAgentDefaults?: (
    path: string,
    provider: string | null,
    model: string | null,
    reasoningEffort: string | null,
  ) => Promise<void>;
  onProjectRemove?: (path: string) => Promise<void>;
  projectIconPicker?: () => Promise<string | null>;
  projectActionsCount?: number;
  onAddProjectAction?: () => void;
  onOpenSession?: (sessionId: string) => void;
  onReloadProviders?: () => void | Promise<ProviderInfo[]>;
  memoryEnabled: boolean;
  deviceSyncEnabled?: boolean;
  initialTab?: SettingsTab;
  onClose: () => void;
  updateStatusLoader?: () => Promise<AppUpdateStatus>;
  updateCheckStarter?: () => Promise<AppUpdateStatus>;
  computerUseSettingsLoader?: () => Promise<ComputerUseSettings>;
  computerUseSelectionSaver?: (backend: string) => Promise<ComputerUseSettings>;
  browserUseSettingsLoader?: () => Promise<BrowserUseSettings>;
  browserUseSelectionSaver?: (backend: string) => Promise<BrowserUseSettings>;
  appshotSettingsLoader?: () => Promise<AppshotSettings>;
  appshotSettingsSaver?: (
    patch: Partial<Pick<AppshotSettings, "hotkey" | "destination" | "play_sound">>,
  ) => Promise<AppshotSettings>;
  appshotPermissionRequester?: (
    kind: "screen-recording" | "accessibility",
  ) => Promise<AppshotSettings>;
  appshotPrivacyOpener?: (kind: "screen-recording" | "accessibility") => Promise<boolean>;
  appshotCapturer?: () => Promise<unknown>;
  providerInstaller?: (provider: string) => Promise<ProviderInfo[]>;
  providerUpgrader?: (provider: string) => Promise<ProviderInfo[]>;
  providerEnabledSaver?: (provider: string, enabled: boolean) => Promise<ProviderInfo[]>;
  deviceSyncStatusLoader?: () => Promise<DeviceSyncStatus>;
  deviceSyncEnabledSaver?: (enabled: boolean) => Promise<DeviceSyncStatus>;
  deviceSyncStarter?: () => Promise<DeviceSyncStatus>;
  pluginDeveloperStatusLoader?: () => Promise<PluginDeveloperStatus>;
  pluginDeveloperModeSaver?: (enabled: boolean) => Promise<PluginDeveloperStatus>;
  pluginDeveloperReloader?: () => Promise<PluginDeveloperStatus>;
  devtoolsOpener?: () => Promise<void>;
}) {
  const t = useT();
  const { preference: theme, setPreference: setTheme } = useTheme();
  const { preference: language, setPreference: setLanguage } = useLanguage();
  const term = useTerminalSettings();
  const providerNames = useMemo(
    () => Object.fromEntries(providers.map((candidate) => [candidate.id, candidate.display_name])),
    [providers],
  );
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const [appUpdate, setAppUpdate] = useState<AppUpdateStatus | null>(null);
  const [computerUseSettings, setComputerUseSettings] = useState<ComputerUseSettings | null>(null);
  const [computerUseSaving, setComputerUseSaving] = useState<string | null>(null);
  const [computerUseError, setComputerUseError] = useState<string | null>(null);
  const [browserUseSettings, setBrowserUseSettings] = useState<BrowserUseSettings | null>(null);
  const [browserUseSaving, setBrowserUseSaving] = useState<string | null>(null);
  const [browserUseError, setBrowserUseError] = useState<string | null>(null);
  const [appshotSettings, setAppshotSettings] = useState<AppshotSettings | null>(null);
  const [appshotSaving, setAppshotSaving] = useState(false);
  const [appshotCapturing, setAppshotCapturing] = useState(false);
  const [appshotError, setAppshotError] = useState<string | null>(null);
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(() => new Set());
  const [providerOperation, setProviderOperation] = useState<{
    id: string;
    action: "install" | "upgrade" | "enable" | "refresh";
  } | null>(null);
  const [providerMessage, setProviderMessage] = useState<{ id: string; text: string } | null>(null);
  const [providerError, setProviderError] = useState<{ id: string; text: string } | null>(null);
  const [deviceSync, setDeviceSync] = useState<DeviceSyncStatus | null>(null);
  const [deviceSyncSaving, setDeviceSyncSaving] = useState(false);
  const [pluginDevelopment, setPluginDevelopment] = useState<PluginDeveloperStatus | null>(null);
  const [pluginDevelopmentSaving, setPluginDevelopmentSaving] = useState(false);
  const [pluginDevelopmentReloading, setPluginDevelopmentReloading] = useState(false);
  const [pluginDevelopmentError, setPluginDevelopmentError] = useState<string | null>(null);
  useEffect(() => setTab(initialTab), [initialTab]);
  useEffect(() => {
    if (!memoryEnabled) {
      setTab((current) => current === "memory" ? "general" : current);
    }
  }, [memoryEnabled]);
  useEffect(() => {
    if (!deviceSyncEnabled) {
      setTab((current) => current === "sync" ? "general" : current);
    }
  }, [deviceSyncEnabled]);
  useEffect(() => {
    if (tab !== "providers" || !onReloadProviders) return;
    let active = true;
    setProviderOperation({ id: "*", action: "refresh" });
    setProviderError(null);
    void (async () => {
      try {
        await onReloadProviders();
        if (active) setProviderMessage({ id: "*", text: t("settings.providerChecked") });
      } catch (error: unknown) {
        if (active) {
          setProviderError({
            id: "*",
            text: t("settings.providerRefreshFailed", { error: String(error) }),
          });
        }
      } finally {
        if (active) setProviderOperation(null);
      }
    })();
    return () => {
      active = false;
    };
  }, [tab, onReloadProviders, t]);
  useEffect(() => {
    if (tab !== "general") return;
    let active = true;
    void updateStatusLoader()
      .then((status) => {
        if (active) setAppUpdate(status);
      })
      .catch((error) => {
        if (active) setAppUpdate({ state: "unavailable", message: String(error) });
      });
    return () => {
      active = false;
    };
  }, [tab, updateStatusLoader]);
  useEffect(() => {
    if (tab !== "general" || appUpdate?.state !== "checking") return;
    let active = true;
    const timer = window.setInterval(() => {
      void updateStatusLoader()
        .then((status) => {
          if (active) setAppUpdate(status);
        })
        .catch((error) => {
          if (active) setAppUpdate({ state: "unavailable", message: String(error) });
        });
    }, 1000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [tab, appUpdate?.state, updateStatusLoader]);
  useEffect(() => {
    if (tab !== "computer-use") return;
    let active = true;
    setComputerUseError(null);
    void computerUseSettingsLoader()
      .then((settings) => {
        if (active) setComputerUseSettings(settings);
      })
      .catch((error) => {
        if (active) setComputerUseError(t("settings.computerUseLoadFailed", { error: String(error) }));
      });
    return () => {
      active = false;
    };
  }, [tab, computerUseSettingsLoader, t]);
  useEffect(() => {
    if (tab !== "browser-use") return;
    let active = true;
    setBrowserUseError(null);
    void browserUseSettingsLoader()
      .then((settings) => {
        if (active) setBrowserUseSettings(settings);
      })
      .catch((error) => {
        if (active) setBrowserUseError(t("settings.browserUseLoadFailed", { error: String(error) }));
      });
    return () => {
      active = false;
    };
  }, [tab, browserUseSettingsLoader, t]);
  useEffect(() => {
    if (tab !== "appshots") return;
    let active = true;
    setAppshotError(null);
    void appshotSettingsLoader()
      .then((settings) => {
        if (active) setAppshotSettings(settings);
      })
      .catch((error) => {
        if (active) setAppshotError(t("settings.appshotsLoadFailed", { error: String(error) }));
      });
    return () => {
      active = false;
    };
  }, [tab, appshotSettingsLoader, t]);
  useEffect(() => {
    if (
      tab !== "appshots"
      || !appshotSettings?.available
      || (appshotSettings.screen_recording && appshotSettings.accessibility)
    ) return;
    let active = true;
    const timer = window.setInterval(() => {
      void appshotSettingsLoader().then((settings) => {
        if (active) setAppshotSettings(settings);
      }).catch(() => {});
    }, 1000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [
    tab,
    appshotSettings?.available,
    appshotSettings?.screen_recording,
    appshotSettings?.accessibility,
    appshotSettingsLoader,
  ]);
  useEffect(() => {
    if (tab !== "sync") return;
    let active = true;
    void deviceSyncStatusLoader()
      .then((status) => {
        if (active) setDeviceSync(status);
      })
      .catch((error) => {
        if (active) {
          setDeviceSync({
            transport: "paired-devices",
            state: "error",
            enabled: false,
            available: false,
            last_success_at: null,
            message: String(error),
            imported: null,
          });
        }
      });
    return () => {
      active = false;
    };
  }, [tab, deviceSyncStatusLoader]);
  useEffect(() => {
    if (tab !== "developer") return;
    let active = true;
    let unsubscribe = () => {};
    const refresh = () => {
      void pluginDeveloperStatusLoader()
        .then((status) => {
          if (active) {
            setPluginDevelopment(status);
            setPluginDevelopmentError(null);
          }
        })
        .catch((error) => {
          if (active) {
            setPluginDevelopmentError(t("settings.developerLoadFailed", { error: String(error) }));
          }
        });
    };
    refresh();
    void onPluginsChanged(refresh).then((stop) => {
      if (active) unsubscribe = stop;
      else stop();
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [tab, pluginDeveloperStatusLoader, t]);
  const [projectModeSaving, setProjectModeSaving] = useState(false);
  const [projectNameDraft, setProjectNameDraft] = useState(project?.name ?? "");
  const [projectProfileSaving, setProjectProfileSaving] = useState(false);
  const [projectIconSaving, setProjectIconSaving] = useState(false);
  const [projectAgentSaving, setProjectAgentSaving] = useState(false);
  const [projectError, setProjectError] = useState<string | null>(null);
  useEffect(() => {
    setProjectNameDraft(project?.name ?? "");
    setProjectError(null);
  }, [project?.path, project?.name]);
  // Scene `schedule` hooks are off by default per project (docs/scenes.md §Security).
  const [schedulingEnabled, setSchedulingEnabled] = useState(false);
  useEffect(() => {
    if (!project) return;
    void getProjectScheduling(project.path).then(setSchedulingEnabled);
  }, [project?.path]);
  const [browserOrigins, setBrowserOrigins] = useState<string[]>([]);
  const [worktrees, setWorktrees] = useState<WorktreeStatusEntry[]>([]);
  const [worktreesLoading, setWorktreesLoading] = useState(false);
  // Already translated at the failure site — listing and discarding fail with different framing.
  const [worktreesError, setWorktreesError] = useState<string | null>(null);
  /** Path mid-discard; every Discard button is held while one runs. */
  const [discardingWorktree, setDiscardingWorktree] = useState<string | null>(null);

  useEffect(() => {
    if (tab === "browser") void browserPermissions().then(setBrowserOrigins);
  }, [tab]);

  const loadWorktrees = async (path: string) => {
    setWorktreesLoading(true);
    setWorktreesError(null);
    try {
      setWorktrees(await listProjectWorktrees(path));
    } catch (error) {
      setWorktrees([]);
      setWorktreesError(t("worktree.manageFailed", { error: String(error) }));
    } finally {
      setWorktreesLoading(false);
    }
  };

  const projectWorktreePath = project?.path ?? null;
  useEffect(() => {
    if (tab !== "project" || !projectWorktreePath) {
      setWorktrees([]);
      setWorktreesError(null);
      return;
    }
    void loadWorktrees(projectWorktreePath);
  }, [tab, projectWorktreePath]);

  const discardWorktree = async (entry: WorktreeStatusEntry) => {
    if (!projectWorktreePath) return;
    if (!(await confirmNative(t("worktree.discardConfirm", { path: entry.path })))) return;
    setDiscardingWorktree(entry.path);
    setWorktreesError(null);
    try {
      const route = worktreeDiscardRoute(entry);
      if (route.kind === "session") await discardSessionWorktree(route.session);
      else await discardOrphanWorktree(projectWorktreePath, route.worktreePath);
      await loadWorktrees(projectWorktreePath);
    } catch (error) {
      setWorktreesError(t("worktree.discardFailed", { error: String(error) }));
    } finally {
      setDiscardingWorktree(null);
    }
  };

  const saveProjectWorktreeMode = async (
    path: string,
    mode: ProjectWorktreeMode | null,
  ) => {
    setProjectModeSaving(true);
    try {
      await onProjectWorktreeMode(path, mode);
    } finally {
      setProjectModeSaving(false);
    }
  };

  const saveProjectName = async () => {
    if (!project) return;
    const name = projectNameDraft.trim();
    if (!name) {
      setProjectError(t("settings.projectNameRequired"));
      setProjectNameDraft(project.name);
      return;
    }
    if (name === project.name) return;
    setProjectProfileSaving(true);
    setProjectError(null);
    try {
      await onProjectRename(project.path, name);
    } catch (error) {
      setProjectNameDraft(project.name);
      setProjectError(t("settings.projectSaveFailed", { error: String(error) }));
    } finally {
      setProjectProfileSaving(false);
    }
  };

  const chooseProjectIcon = async () => {
    if (!project) return;
    const source = await projectIconPicker();
    if (!source) return;
    setProjectIconSaving(true);
    setProjectError(null);
    try {
      await onProjectIcon(project.path, source);
    } catch (error) {
      setProjectError(t("settings.projectIconFailed", { error: String(error) }));
    } finally {
      setProjectIconSaving(false);
    }
  };

  const clearProjectIcon = async () => {
    if (!project) return;
    setProjectIconSaving(true);
    setProjectError(null);
    try {
      await onProjectIcon(project.path, null);
    } catch (error) {
      setProjectError(t("settings.projectIconFailed", { error: String(error) }));
    } finally {
      setProjectIconSaving(false);
    }
  };

  const saveProjectAgentDefaults = async (
    providerId: string | null,
    modelId: string | null,
    reasoningEffort: string | null,
  ) => {
    if (!project) return;
    setProjectAgentSaving(true);
    setProjectError(null);
    try {
      await onProjectAgentDefaults(project.path, providerId, modelId, reasoningEffort);
    } catch (error) {
      setProjectError(t("settings.projectSaveFailed", { error: String(error) }));
    } finally {
      setProjectAgentSaving(false);
    }
  };

  const removeCurrentProject = async () => {
    if (!project) return;
    if (!(await confirmNative(t("settings.removeProjectConfirm", { name: project.name })))) return;
    setProjectProfileSaving(true);
    setProjectError(null);
    try {
      await onProjectRemove(project.path);
    } catch (error) {
      setProjectError(t("settings.projectSaveFailed", { error: String(error) }));
    } finally {
      setProjectProfileSaving(false);
    }
  };

  const byAction = useMemo(() => new Map(bindings.map((b) => [b[0], b])), [bindings]);

  // Which combos are bound more than once — a rebind can silently shadow another action.
  const conflicts = useMemo(() => {
    const seen = new Map<string, number>();
    for (const [, key] of bindings) seen.set(key, (seen.get(key) ?? 0) + 1);
    return new Set([...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k));
  }, [bindings]);

  const known = new Set(GROUPS.flatMap((g) => g.actions));
  const groups = [
    ...GROUPS.map((g) => ({ title: t(g.labelKey), actions: g.actions })),
    { title: t("settings.groupOther"), actions: bindings.map((b) => b[0]).filter((a) => !known.has(a)) },
  ].filter((g) => g.actions.length > 0);

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

  const appUpdateHint = (() => {
    switch (appUpdate?.state) {
      case "ready":
        return t("settings.updateReady", { version: appUpdate.currentVersion ?? t("settings.updateUnknownVersion") });
      case "checking":
        return t("settings.updateChecking");
      case "not-configured":
        return t("settings.updateNotConfigured");
      case "unsupported":
        return t("settings.updateUnsupported");
      case "unavailable":
        return t("settings.updateUnavailable");
      default:
        return t("settings.updateLoading");
    }
  })();

  const startUpdateCheck = async () => {
    setAppUpdate({ state: "checking", currentVersion: appUpdate?.currentVersion });
    try {
      setAppUpdate(await updateCheckStarter());
    } catch (error) {
      setAppUpdate({ state: "unavailable", message: String(error) });
    }
  };

  const saveDeviceSyncEnabled = async (enabled: boolean) => {
    setDeviceSyncSaving(true);
    try {
      setDeviceSync(await deviceSyncEnabledSaver(enabled));
    } catch (error) {
      setDeviceSync((current) => ({
        transport: current?.transport ?? "paired-devices",
        state: "error",
        enabled: current?.enabled ?? false,
        available: current?.available ?? false,
        last_success_at: current?.last_success_at ?? null,
        message: String(error),
        imported: current?.imported ?? null,
      }));
    } finally {
      setDeviceSyncSaving(false);
    }
  };

  const startDeviceSync = async () => {
    setDeviceSync((current) => current ? { ...current, state: "syncing" } : current);
    try {
      setDeviceSync(await deviceSyncStarter());
    } catch (error) {
      setDeviceSync((current) => current ? { ...current, state: "error", message: String(error) } : current);
    }
  };

  const savePluginDeveloperMode = async (enabled: boolean) => {
    setPluginDevelopmentSaving(true);
    setPluginDevelopmentError(null);
    try {
      setPluginDevelopment(await pluginDeveloperModeSaver(enabled));
    } catch (error) {
      setPluginDevelopmentError(t("settings.developerSaveFailed", { error: String(error) }));
    } finally {
      setPluginDevelopmentSaving(false);
    }
  };

  const reloadPlugins = async () => {
    setPluginDevelopmentReloading(true);
    setPluginDevelopmentError(null);
    try {
      setPluginDevelopment(await pluginDeveloperReloader());
    } catch (error) {
      setPluginDevelopmentError(t("settings.developerReloadFailed", { error: String(error) }));
    } finally {
      setPluginDevelopmentReloading(false);
    }
  };

  const showWebviewDevtools = async () => {
    setPluginDevelopmentError(null);
    try {
      await devtoolsOpener();
    } catch (error) {
      setPluginDevelopmentError(t("settings.developerDevtoolsFailed", { error: String(error) }));
    }
  };

  const pluginDevelopmentStatus = (() => {
    if (!pluginDevelopment) return t("settings.pluginHotReloadLoading");
    if (!pluginDevelopment.enabled) return t("settings.pluginHotReloadOff");
    if (!pluginDevelopment.watching) return t("settings.pluginHotReloadUnavailable");
    return t("settings.pluginHotReloadWatching", { path: pluginDevelopment.plugins_dir });
  })();

  const pluginReloadRecord = pluginDevelopment?.last_reload;
  const pluginReloadDetail = pluginReloadRecord?.success
    ? t("settings.pluginHotReloadLastSuccess", {
        plugins: pluginReloadRecord.plugins.length
          ? pluginReloadRecord.plugins.join(", ")
          : t("settings.allInstalledPlugins"),
        time: new Intl.DateTimeFormat(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(pluginReloadRecord.at),
      })
    : pluginReloadRecord?.error
      ? t("settings.pluginHotReloadLastError", { error: pluginReloadRecord.error })
      : null;

  const deviceSyncHint = (() => {
    switch (deviceSync?.state) {
      case "disabled":
        return deviceSync.available ? t("settings.syncReady") : t("settings.syncUnavailable");
      case "ready":
        return deviceSync.last_success_at
          ? t("settings.syncLastSuccess", { time: new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(deviceSync.last_success_at) })
          : t("settings.syncReady");
      case "syncing":
        return t("settings.syncing");
      case "signed-out":
        return t("settings.syncSignedOut");
      case "restricted":
        return t("settings.syncRestricted");
      case "unsupported":
        return t("settings.syncUnsupported");
      case "unavailable":
        return t("settings.syncUnavailable");
      case "error":
        return deviceSync.message || t("settings.syncUnavailable");
      default:
        return deviceSync?.available ? t("settings.syncReady") : t("settings.syncLoading");
    }
  })();

  const saveComputerUseSelection = async (backendId: string) => {
    setComputerUseSaving(backendId);
    setComputerUseError(null);
    try {
      setComputerUseSettings(await computerUseSelectionSaver(backendId));
    } catch (error) {
      setComputerUseError(t("settings.computerUseLoadFailed", { error: String(error) }));
    } finally {
      setComputerUseSaving(null);
    }
  };

  const saveBrowserUseSelection = async (backendId: string) => {
    setBrowserUseSaving(backendId);
    setBrowserUseError(null);
    try {
      setBrowserUseSettings(await browserUseSelectionSaver(backendId));
    } catch (error) {
      setBrowserUseError(t("settings.browserUseLoadFailed", { error: String(error) }));
    } finally {
      setBrowserUseSaving(null);
    }
  };

  const saveAppshotSettings = async (
    patch: Partial<Pick<AppshotSettings, "hotkey" | "destination" | "play_sound">>,
  ) => {
    setAppshotSaving(true);
    setAppshotError(null);
    try {
      setAppshotSettings(await appshotSettingsSaver(patch));
    } catch (error) {
      setAppshotError(t("settings.appshotsSaveFailed", { error: String(error) }));
    } finally {
      setAppshotSaving(false);
    }
  };

  const grantAppshotAccess = async (kind: "screen-recording" | "accessibility") => {
    setAppshotSaving(true);
    setAppshotError(null);
    try {
      setAppshotSettings(await appshotPermissionRequester(kind));
    } catch (error) {
      setAppshotError(t("settings.appshotsPermissionFailed", { error: String(error) }));
    } finally {
      setAppshotSaving(false);
    }
  };

  const captureAppshot = async () => {
    setAppshotCapturing(true);
    setAppshotError(null);
    try {
      await appshotCapturer();
    } catch (error) {
      setAppshotError(t("settings.appshotsCaptureFailed", { error: String(error) }));
    } finally {
      setAppshotCapturing(false);
    }
  };

  const refreshProviderStatus = async () => {
    if (!onReloadProviders || providerOperation) return;
    setProviderOperation({ id: "*", action: "refresh" });
    setProviderError(null);
    try {
      await onReloadProviders();
      setProviderMessage({ id: "*", text: t("settings.providerChecked") });
    } catch (error) {
      setProviderError({
        id: "*",
        text: t("settings.providerRefreshFailed", { error: String(error) }),
      });
    } finally {
      setProviderOperation(null);
    }
  };

  const runProviderAction = async (providerId: string, action: "install" | "upgrade") => {
    if (providerOperation) return;
    const candidate = providers.find((item) => item.id === providerId);
    if (!candidate) return;
    setProviderOperation({ id: providerId, action });
    setProviderError(null);
    setProviderMessage(null);
    try {
      if (action === "install") await providerInstaller(providerId);
      else await providerUpgrader(providerId);
      setProviderMessage({
        id: providerId,
        text: action === "install"
          ? t("settings.providerInstalled", { provider: candidate.display_name })
          : t("settings.providerUpgraded", { provider: candidate.display_name }),
      });
      await onReloadProviders?.();
    } catch (error) {
      setProviderError({
        id: providerId,
        text: t("settings.providerActionFailed", { error: String(error) }),
      });
    } finally {
      setProviderOperation(null);
    }
  };

  const saveProviderEnabled = async (providerId: string, enabled: boolean) => {
    if (providerOperation) return;
    const candidate = providers.find((item) => item.id === providerId);
    if (!candidate) return;
    setProviderOperation({ id: providerId, action: "enable" });
    setProviderError(null);
    setProviderMessage(null);
    try {
      await providerEnabledSaver(providerId, enabled);
      setProviderMessage({
        id: providerId,
        text: enabled
          ? t("settings.providerEnabledMessage", { provider: candidate.display_name })
          : t("settings.providerDisabledMessage", { provider: candidate.display_name }),
      });
      await onReloadProviders?.();
    } catch (error) {
      setProviderError({
        id: providerId,
        text: t("settings.providerActionFailed", { error: String(error) }),
      });
    } finally {
      setProviderOperation(null);
    }
  };

  const toggleProviderDetails = (providerId: string) => {
    setExpandedProviders((current) => {
      const next = new Set(current);
      if (next.has(providerId)) next.delete(providerId);
      else next.add(providerId);
      return next;
    });
  };

  const computerUseSelection = computerUseSettings?.selections["*"] ?? "automatic";
  const computerUseSelectionLabel = computerUseSelection === "automatic"
    ? t("settings.computerUseAutomatic")
    : computerUseSelection === "disabled"
      ? t("settings.computerUseDisabled")
      : computerUseSettings?.backends.find((backend) => backend.id === computerUseSelection)?.display_name
        ?? computerUseSelection;
  const browserUseSelection = browserUseSettings?.selections["*"] ?? "automatic";
  const browserUseSelectionLabel = browserUseSelection === "automatic"
    ? t("settings.browserUseAutomatic")
    : browserUseSelection === "disabled"
      ? t("settings.browserUseDisabled")
      : browserUseSettings?.backends.find((backend) => backend.id === browserUseSelection)?.display_name
        ?? browserUseSelection;
  const appshotHotkeyLabel = appshotSettings?.hotkey === "both-command"
    ? t("settings.appshotsHotkeyBothCommand")
    : appshotSettings?.hotkey === "command-shift-2"
      ? t("settings.appshotsHotkeyCommandShift2")
      : t("settings.appshotsHotkeyCommandOption2");
  const appshotDestinationLabel = appshotSettings?.destination === "automatic"
    ? t("settings.appshotsDestinationAutomatic")
    : appshotSettings?.destination === "current"
      ? t("settings.appshotsDestinationCurrent")
      : t("settings.appshotsDestinationNew");
  const projectDefaultProvider = project?.default_provider ?? null;
  const projectDefaultModels = projectDefaultProvider
    ? providers.find((candidate) => candidate.id === projectDefaultProvider)?.models ?? []
    : [];

  const keyRow = (action: string) => {
    const entry = byAction.get(action);
    if (!entry) return null;
    const [, key, coreLabel] = entry;
    // The core ships English labels. Prefer a translation keyed by action id; fall back to what the
    // core said so an action this build doesn't know about still reads as something.
    const labelKey = `action.${action}` as StringKey;
    const label = labelKey in EN_STRINGS ? t(labelKey) : coreLabel;
    return (
      <Row key={action} compact label={label}>
        {conflicts.has(key) && capturing !== action && (
          <span className="text-cap text-warning" title={t("settings.conflictHint")}>
            {t("settings.conflict")}
          </span>
        )}
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "min-w-24 justify-center font-mono text-fine",
            capturing === action && "ring-1 ring-primary/60 text-primary",
            conflicts.has(key) && capturing !== action && "ring-1 ring-warning/60",
          )}
          onClick={() => onCapture(action)}
        >
          {capturing === action ? t("settings.capturing") : formatCombo(key)}
        </Button>
        {onReset && (
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground"
            title={t("settings.reset")}
            onClick={() => onReset(action)}
          >
            <RotateCcw className="size-3.5" />
          </Button>
        )}
      </Row>
    );
  };

  return (
    <div className="animate-page-in flex min-h-0 min-w-0 flex-1">
      {/* ---- nav rail — same material as the app's rail, so settings still feels like this app */}
      <aside
        data-settings-sidebar
        className="glass-rail flex shrink-0 flex-col"
        style={{ width: Math.min(420, Math.max(220, sidebarWidth)) }}
      >
        {/* Same 40px title bar as the main shell — clears the traffic lights and drags the window. */}
        <div className="electrobun-webkit-app-region-drag settings-titlebar shrink-0" />
        <button
          data-settings-back
          disabled={projectModeSaving}
          onClick={onClose}
          className="mx-3 mb-2 flex items-center gap-2 rounded-lg px-2 py-2 text-left text-ui text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ArrowLeft className="size-3.5 shrink-0" />
          {t("settings.back")}
        </button>
        <nav
          aria-label={t("settings.title")}
          className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-3 pb-6 pt-2"
        >
          {NAV_GROUPS.map((group) => {
            const items = group.items.filter(({ id }) => memoryEnabled || id !== "memory")
              .filter(({ id }) => deviceSyncEnabled || id !== "sync");
            const headingId = `settings-nav-${group.id}`;
            return (
              <section key={group.id} aria-labelledby={headingId}>
                <h2
                  id={headingId}
                  className="px-2 pb-2 text-hint font-medium text-muted-foreground"
                >
                  {t(group.labelKey)}
                </h2>
                <div className="space-y-1">
                  {items.map(({ id, icon: Icon, labelKey }) => (
                    <button
                      key={id}
                      aria-current={id === tab ? "page" : undefined}
                      onClick={() => setTab(id)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-ui transition-colors",
                        id === tab
                          ? "bg-accent font-medium text-foreground"
                          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                      )}
                    >
                      <Icon className="size-3.5 shrink-0" />
                      <span className="truncate">{t(labelKey)}</span>
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
        </nav>
      </aside>

      {/* ---- the page ---- */}
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
        {/* The same 40px bar as the main shell's header, border and all. */}
        <header
          data-settings-titlebar
          className="electrobun-webkit-app-region-drag settings-titlebar flex shrink-0 items-center gap-1.5 border-b pb-1.5 pl-6 pr-3 pt-1.5"
        >
          <span className="electrobun-webkit-app-region-drag text-ui font-medium text-muted-foreground">
            {t("settings.title")}
          </span>
          <div className="electrobun-webkit-app-region-drag flex-1" />
          {(tab === "general" || tab === "appearance" || tab === "keybindings") && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-hint text-muted-foreground hover:text-foreground"
              onClick={restore}
            >
              <RotateCcw className="size-3.5" />
              {t("settings.restoreDefaults")}
            </Button>
          )}
        </header>

        <ScrollArea className="min-h-0 flex-1">
          <div
            className="settings-page mx-auto w-full pb-20"
          >
            {tab === "general" && (
              <Page title={t("settings.general")} description={t("settings.generalHint")}>
                <Row label={t("settings.language")} hint={t("settings.languageHint")}>
                  <Select value={language} onValueChange={(v) => setLanguage(v as LanguagePreference)}>
                    <SelectTrigger size="sm" className="w-44 justify-between">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent position="popper" align="end">
                      <SelectItem value="system">{t("settings.languageSystem")}</SelectItem>
                      {(Object.keys(LOCALES) as (keyof typeof LOCALES)[]).map((l) => (
                        <SelectItem key={l} value={l}>
                          {LOCALES[l].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Row>

                <GroupHeading>{t("settings.softwareUpdate")}</GroupHeading>

                <Row label={t("settings.checkForUpdates")} hint={appUpdateHint}>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={appUpdate?.state !== "ready"}
                    onClick={() => void startUpdateCheck()}
                  >
                    {appUpdate?.state === "checking"
                      ? t("settings.updateCheckingButton")
                      : t("settings.checkNow")}
                  </Button>
                </Row>

                <GroupHeading>{t("settings.terminal")}</GroupHeading>

                <Row label={t("settings.termFont")} hint={t("settings.termFontHint")}>
                  <Input
                    value={term.fontFamily}
                    placeholder={t("settings.termFontDefault")}
                    onChange={(e) => setTerminalSettings({ fontFamily: e.target.value })}
                    className="h-8 w-44 text-hint"
                  />
                </Row>

                <Row label={t("settings.termFontSize")}>
                  <Input
                    type="number"
                    min={8}
                    max={32}
                    value={term.fontSize}
                    onChange={(e) => setTerminalSettings({ fontSize: Number(e.target.value) })}
                    className="h-8 w-44 text-hint"
                  />
                </Row>

                <Row label={t("settings.termScrollback")} hint={t("settings.termScrollbackHint")}>
                  <Input
                    type="number"
                    min={100}
                    max={200000}
                    step={1000}
                    value={term.scrollback}
                    onChange={(e) => setTerminalSettings({ scrollback: Number(e.target.value) })}
                    className="h-8 w-44 text-hint"
                  />
                </Row>
              </Page>
            )}

            {tab === "appearance" && (
              <Page title={t("settings.appearance")} description={t("settings.appearanceHint")}>
                <AppearanceSettings value={theme} onChange={setTheme} />
              </Page>
            )}

            {tab === "pets" && (
              <Page title={t("settings.pets")}>
                <PetSettings />
              </Page>
            )}

            {tab === "sync" && deviceSyncEnabled && (
              <Page title={t("settings.sync")} description={t("settings.syncHint")}>
                <Row label={t("settings.pairedDeviceSync")} hint={deviceSyncHint}>
                  <Switch
                    checked={deviceSync?.enabled ?? false}
                    disabled={
                      deviceSyncSaving ||
                      deviceSync?.state === "syncing" ||
                      (!(deviceSync?.enabled ?? false) && !(deviceSync?.available ?? false))
                    }
                    onCheckedChange={(checked) => void saveDeviceSyncEnabled(checked)}
                    aria-label={t("settings.pairedDeviceSync")}
                  />
                </Row>

                <Row label={t("settings.syncNow")} hint={t("settings.syncNowHint")}>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    disabled={!deviceSync?.enabled || deviceSync.state === "syncing" || deviceSyncSaving}
                    onClick={() => void startDeviceSync()}
                  >
                    <RefreshCw className={cn("size-3.5", deviceSync?.state === "syncing" && "animate-spin")} />
                    {deviceSync?.state === "syncing" ? t("settings.syncingButton") : t("settings.syncNowButton")}
                  </Button>
                </Row>

                <GroupHeading>{t("settings.syncScope")}</GroupHeading>
                <p className="pt-1.5 text-hint leading-relaxed text-muted-foreground">
                  {t("settings.syncScopeHint")}
                </p>
              </Page>
            )}

            {tab === "keybindings" && (
              <Page title={t("settings.keybindings")} description={t("settings.keysHint", { mod: MOD_LABEL })}>
                {groups.map((g) => (
                  <div key={g.title}>
                    <GroupHeading>{g.title}</GroupHeading>
                    <div className="space-y-0.5">{g.actions.map(keyRow)}</div>
                  </div>
                ))}
              </Page>
            )}

            {tab === "project" && (
              <Page title={t("settings.project")} description={t("settings.projectHint")}>
                {project ? (
                  <>
                    <GroupHeading>{t("settings.projectProfile")}</GroupHeading>
                    <ProjectRow
                      label={t("settings.projectName")}
                      hint={t("settings.projectNameHint")}
                    >
                      <Input
                        aria-label={t("settings.projectName")}
                        value={projectNameDraft}
                        disabled={projectProfileSaving}
                        maxLength={80}
                        size="compact"
                        className="w-full text-ui"
                        onInput={(event) => setProjectNameDraft(event.currentTarget.value)}
                        onBlur={() => void saveProjectName()}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") event.currentTarget.blur();
                          if (event.key === "Escape") {
                            setProjectNameDraft(project.name);
                            event.currentTarget.blur();
                          }
                        }}
                      />
                    </ProjectRow>
                    <ProjectRow
                      label={t("settings.projectIcon")}
                      hint={project.has_icon
                        ? t("settings.projectIconCustom")
                        : t("settings.projectIconAutomatic")}
                    >
                      <div
                        data-project-icon-picker
                        className="flex h-(--ds-control-field) w-full items-stretch overflow-hidden rounded-(--ds-radius-control) bg-fill-rest"
                      >
                        <button
                          type="button"
                          className="group flex min-w-0 flex-1 items-center gap-2.5 px-2 text-left outline-none transition-colors hover:bg-fill-hover focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
                          disabled={projectIconSaving}
                          onClick={() => void chooseProjectIcon()}
                        >
                          <ProjectIcon project={project} size={24} className="bg-background/70" />
                          <span className="min-w-0 flex-1 truncate text-ui font-medium">
                            {project.has_icon
                              ? t("settings.projectIconChange")
                              : t("settings.projectIconChoose")}
                          </span>
                          <ImagePlus className="size-4 text-muted-foreground transition-colors group-hover:text-foreground" />
                        </button>
                        {project.has_icon ? (
                          <>
                            <span className="my-2 w-px shrink-0 bg-foreground/10" aria-hidden="true" />
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="my-auto mx-1 text-muted-foreground"
                              aria-label={t("settings.projectIconRemove")}
                              title={t("settings.projectIconRemove")}
                              disabled={projectIconSaving}
                              onClick={() => void clearProjectIcon()}
                            >
                              <Trash2 />
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </ProjectRow>
                    {projectError ? (
                      <p className="project-settings-error pt-1 text-hint leading-relaxed text-destructive">{projectError}</p>
                    ) : null}

                    <GroupHeading>{t("settings.projectNewSessions")}</GroupHeading>
                    <ProjectRow
                      label={t("settings.projectProvider")}
                      hint={t("settings.projectProviderHint")}
                    >
                      <Select
                        disabled={projectAgentSaving}
                        value={projectDefaultProvider ?? "automatic"}
                        onValueChange={(value) => {
                          void saveProjectAgentDefaults(
                            value === "automatic" ? null : value,
                            null,
                            null,
                          );
                        }}
                      >
                        <SelectTrigger
                          data-project-provider
                          aria-label={t("settings.projectProvider")}
                          size="sm"
                          className="w-full justify-between"
                        >
                          <SelectValue>
                            {projectDefaultProvider ? (
                              <>
                                <ProviderIcon provider={projectDefaultProvider} className="size-4" />
                                {providerNames[projectDefaultProvider] ?? projectDefaultProvider}
                              </>
                            ) : t("settings.projectProviderAutomatic")}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent position="popper" align="end">
                          <SelectItem value="automatic">{t("settings.projectProviderAutomatic")}</SelectItem>
                          {providers.map((candidate) => (
                            <SelectItem
                              key={candidate.id}
                              value={candidate.id}
                              disabled={!candidate.available}
                            >
                              <ProviderIcon provider={candidate.id} className="size-4" />
                              {candidate.display_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </ProjectRow>
                    <ProjectRow
                      label={t("settings.projectModel")}
                      hint={t("settings.projectModelHint")}
                    >
                      <div className="grid w-full grid-cols-[minmax(0,1fr)_7.5rem] gap-2">
                        {projectDefaultProvider && projectDefaultModels.length > 0 ? (
                          <div className="flex min-w-0 items-center rounded-(--ds-radius-control) bg-fill-rest px-1">
                            <ModelPicker
                              models={projectDefaultModels}
                              current={project.default_model ?? null}
                              defaultModel={null}
                              provider={projectDefaultProvider}
                              onModel={(model) => {
                                void saveProjectAgentDefaults(
                                  projectDefaultProvider,
                                  model,
                                  project.default_reasoning_effort ?? null,
                                );
                              }}
                              configOptions={[]}
                              onConfigOption={() => {}}
                              hasSession={false}
                            />
                            {project.default_model ? (
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                className="ms-auto"
                                aria-label={t("settings.projectModelReset")}
                                title={t("settings.projectModelReset")}
                                disabled={projectAgentSaving}
                                onClick={() => void saveProjectAgentDefaults(
                                  projectDefaultProvider,
                                  null,
                                  project.default_reasoning_effort ?? null,
                                )}
                              >
                                <RotateCcw />
                              </Button>
                            ) : null}
                          </div>
                        ) : (
                          <span className="col-span-2 flex h-(--ds-control-field) min-w-0 items-center rounded-(--ds-radius-control) bg-fill-rest px-3 text-hint text-muted-foreground">
                            {t("settings.projectModelDefault")}
                          </span>
                        )}
                        {projectDefaultProvider ? (
                          <Select
                            disabled={projectAgentSaving}
                            value={project.default_reasoning_effort ?? "automatic"}
                            onValueChange={(value) => {
                              void saveProjectAgentDefaults(
                                projectDefaultProvider,
                                project.default_model ?? null,
                                value === "automatic" ? null : value,
                              );
                            }}
                          >
                            <SelectTrigger
                              aria-label={t("settings.projectReasoning")}
                              size="sm"
                              className="w-full justify-between"
                            >
                              <SelectValue>
                                {project.default_reasoning_effort
                                  ? t(`effort.${project.default_reasoning_effort}` as StringKey)
                                  : t("settings.projectModelDefault")}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent position="popper" align="end">
                              <SelectItem value="automatic">{t("settings.projectModelDefault")}</SelectItem>
                              {PROJECT_REASONING_EFFORTS.map((effort) => (
                                <SelectItem key={effort} value={effort}>
                                  {t(`effort.${effort}` as StringKey)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : null}
                      </div>
                    </ProjectRow>
                    <ProjectRow
                      label={t("settings.projectWorkspace")}
                      hint={t("settings.projectWorkspaceHint")}
                    >
                      <Select
                        disabled={projectModeSaving}
                        value={project.default_worktree_mode ?? "inherit"}
                        onValueChange={(value) => {
                          void saveProjectWorktreeMode(
                            project.path,
                            value === "inherit" ? null : (value as ProjectWorktreeMode),
                          );
                        }}
                      >
                        <SelectTrigger size="sm" className="w-full justify-between">
                          <SelectValue>
                            {project.default_worktree_mode === "local"
                              ? t("settings.projectWorkspaceLocal")
                              : project.default_worktree_mode === "current"
                                ? t("settings.projectWorkspaceCurrent")
                                : project.default_worktree_mode === "origin_default"
                                  ? t("settings.projectWorkspaceOrigin")
                                  : t("settings.projectWorkspaceInherit")}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent position="popper" align="end">
                          <SelectItem value="inherit">{t("settings.projectWorkspaceInherit")}</SelectItem>
                          <SelectItem value="local">{t("settings.projectWorkspaceLocal")}</SelectItem>
                          <SelectItem value="current">{t("settings.projectWorkspaceCurrent")}</SelectItem>
                          <SelectItem value="origin_default">
                            {t("settings.projectWorkspaceOrigin")}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </ProjectRow>
                    <ProjectRow
                      label={t("settings.scheduling")}
                      hint={t("settings.schedulingHint")}
                    >
                      <Switch
                        aria-label={t("settings.scheduling")}
                        checked={schedulingEnabled}
                        onCheckedChange={(checked) => {
                          const enabled = checked;
                          setSchedulingEnabled(enabled);
                          setProjectError(null);
                          void setProjectScheduling(project.path, enabled).catch((error) => {
                            setSchedulingEnabled(!enabled);
                            setProjectError(t("settings.projectSaveFailed", { error: String(error) }));
                          });
                        }}
                      />
                    </ProjectRow>

                    <GroupHeading>{t("settings.projectCheckout")}</GroupHeading>
                    <ProjectRow label={t("settings.projectPath")} hint={t("settings.projectPathHint")}>
                      <div className="flex h-(--ds-control-field) w-full min-w-0 items-center overflow-hidden rounded-(--ds-radius-control) bg-fill-rest">
                        <span className="min-w-0 flex-1 truncate px-3 font-mono text-fine text-muted-foreground" title={project.path}>
                          {project.path}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-muted-foreground"
                          aria-label={t("settings.projectPathCopy")}
                          title={t("settings.projectPathCopy")}
                          onClick={() => {
                            void navigator.clipboard.writeText(project.path).catch((error) => {
                              setProjectError(t("settings.projectSaveFailed", { error: String(error) }));
                            });
                          }}
                        >
                          <Copy />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-muted-foreground"
                          aria-label={t("settings.projectPathReveal")}
                          title={t("settings.projectPathReveal")}
                          onClick={() => {
                            void openNativePath(project.path).then((opened) => {
                              if (!opened) throw new Error(t("settings.projectPathRevealUnavailable"));
                            }).catch((error) => {
                              setProjectError(t("settings.projectSaveFailed", { error: String(error) }));
                            });
                          }}
                        >
                          <FolderOpen />
                        </Button>
                      </div>
                    </ProjectRow>

                    <GroupHeading>{t("settings.projectActions")}</GroupHeading>
                    <ProjectRow
                      label={t("settings.projectActions")}
                      hint={projectActionsCount === 0
                        ? t("settings.projectActionsEmpty")
                        : t("settings.projectActionsCount", { count: projectActionsCount })}
                    >
                      <Button variant="outline" size="sm" onClick={onAddProjectAction}>
                        <Plus />
                        {t("settings.projectActionAdd")}
                      </Button>
                    </ProjectRow>

                    <GroupHeading>{t("worktree.manage")}</GroupHeading>
                    <p className="pt-1.5 text-hint leading-relaxed text-muted-foreground">
                      {t("worktree.manageHint")}
                    </p>
                    {worktreesError && (
                      <p className="pt-2 text-hint leading-relaxed text-destructive">{worktreesError}</p>
                    )}
                    {worktreesLoading ? (
                      <p className="py-5 text-ui text-muted-foreground">{t("worktree.manageLoading")}</p>
                    ) : worktrees.length === 0 ? (
                      !worktreesError && (
                        <p className="py-5 text-ui text-muted-foreground">{t("worktree.manageEmpty")}</p>
                      )
                    ) : (
                      worktrees.map((entry) => {
                        const branch = worktreeBranchDisplay(entry.branch);
                        return (
                          <ProjectRow
                            key={entry.path}
                            compact
                            label={entry.session_title ?? branch ?? entry.path}
                            hint={
                              <span className="flex flex-wrap items-center gap-1.5">
                                <Badge variant="outline">{t(WORKTREE_KIND_LABELS[entry.kind])}</Badge>
                                {worktreeStatusBadges(entry).map((badge) => (
                                  <Badge key={badge} variant="outline">
                                    {t(WORKTREE_BADGE_LABELS[badge])}
                                  </Badge>
                                ))}
                                <span className="max-w-72 truncate font-mono" title={entry.path}>
                                  {entry.path}
                                </span>
                                {branch && <span className="shrink-0 font-mono">{branch}</span>}
                              </span>
                            }
                          >
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-muted-foreground hover:text-destructive"
                              disabled={discardingWorktree !== null}
                              onClick={() => void discardWorktree(entry)}
                            >
                              {t("worktree.discard")}
                            </Button>
                          </ProjectRow>
                        );
                      })
                    )}

                    <GroupHeading>{t("settings.projectDanger")}</GroupHeading>
                    <ProjectRow
                      label={t("settings.removeProject")}
                      hint={t("settings.removeProjectHint")}
                    >
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        disabled={projectProfileSaving}
                        onClick={() => void removeCurrentProject()}
                      >
                        <Trash2 />
                        {t("settings.removeProject")}
                      </Button>
                    </ProjectRow>
                  </>
                ) : (
                  <p className="py-6 text-ui text-muted-foreground">{t("settings.projectNone")}</p>
                )}
              </Page>
            )}

            {tab === "memory" && memoryEnabled && (
              <MemorySettingsPage
                projectPath={projectPath}
                projects={projects}
                onOpenSession={onOpenSession}
              />
            )}

            {tab === "usage" && (
              <UsagePanel
                provider={provider}
                providerName={providers.find((candidate) => candidate.id === provider)?.display_name ?? provider}
                providerNames={providerNames}
              />
            )}

            {tab === "computer-use" && (
              <Page title={t("settings.computerUse")} description={t("settings.computerUseHint")}>
                <p className="pb-2 text-hint leading-relaxed text-muted-foreground">
                  {t("settings.computerUseNewSession")}
                </p>
                {computerUseError && (
                  <p data-computer-use-error className="pb-2 text-hint leading-relaxed text-destructive">
                    {computerUseError}
                  </p>
                )}
                {computerUseSettings?.errors.map((error) => (
                  <p key={error} className="pb-2 text-hint leading-relaxed text-destructive">
                    {error}
                  </p>
                ))}
                {!computerUseSettings ? (
                  <p className="py-5 text-ui text-muted-foreground">{t("settings.computerUseLoading")}</p>
                ) : (
                  <>
                    <Row label={t("settings.computerUseBackend")}>
                      <Select
                        value={computerUseSelection}
                        disabled={computerUseSaving !== null}
                        onValueChange={(backend) => {
                          if (backend) void saveComputerUseSelection(backend);
                        }}
                      >
                        <SelectTrigger
                          data-computer-use-selection
                          aria-label={t("settings.computerUseBackend")}
                          size="sm"
                          className="w-52 justify-between"
                        >
                          <SelectValue>{computerUseSelectionLabel}</SelectValue>
                        </SelectTrigger>
                        <SelectContent position="popper" align="end">
                          <SelectItem value="automatic">{t("settings.computerUseAutomatic")}</SelectItem>
                          <SelectItem value="disabled">{t("settings.computerUseDisabled")}</SelectItem>
                          {computerUseSettings.backends.map((backend) => (
                            <SelectItem key={backend.id} value={backend.id} disabled={!backend.available}>
                              {backend.display_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Row>

                    <GroupHeading>{t("settings.computerUseBackends")}</GroupHeading>
                    {computerUseSettings.backends.map((backend) => (
                      <Row
                        key={backend.id}
                        compact
                        label={backend.display_name}
                        hint={backend.reason ?? <span className="font-mono">{backend.id}</span>}
                      >
                        <span className="flex items-center gap-1.5 text-fine text-muted-foreground">
                          <span className={cn("size-1.5 rounded-full", backend.available ? "bg-success" : "bg-border")} />
                          {backend.available
                            ? t("settings.computerUseAvailable")
                            : t("settings.computerUseUnavailable")}
                        </span>
                      </Row>
                    ))}
                  </>
                )}
              </Page>
            )}

            {tab === "appshots" && (
              <Page title={t("settings.appshots")} description={t("settings.appshotsHint")}>
                <div className="mb-3 flex items-center justify-between gap-4 rounded-(--ds-radius-module) bg-fill-quiet/60 px-3 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <ScanText className="size-5 shrink-0 text-primary" aria-hidden />
                    <div className="min-w-0">
                      <p className="text-ui font-medium">{t("settings.appshotsFrontmost")}</p>
                      <p className="mt-0.5 text-hint leading-relaxed text-muted-foreground">
                        {t("settings.appshotsFrontmostHint")}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    disabled={!appshotSettings?.available || appshotCapturing}
                    onClick={() => void captureAppshot()}
                  >
                    {appshotCapturing ? t("settings.appshotsCapturing") : t("settings.appshotsTakeNow")}
                  </Button>
                </div>

                {appshotError && (
                  <p data-appshots-error className="pb-2 text-hint leading-relaxed text-destructive">
                    {appshotError}
                  </p>
                )}
                {!appshotSettings ? (
                  <p className="py-5 text-ui text-muted-foreground">{t("settings.appshotsLoading")}</p>
                ) : !appshotSettings.available ? (
                  <p className="py-5 text-ui text-muted-foreground">
                    {appshotSettings.unavailable_reason ?? t("settings.appshotsUnavailable")}
                  </p>
                ) : (
                  <>
                    <Row label={t("settings.appshotsHotkey")} hint={t("settings.appshotsHotkeyHint")}>
                      <Select
                        value={appshotSettings.hotkey}
                        disabled={appshotSaving}
                        onValueChange={(hotkey) => {
                          if (hotkey) void saveAppshotSettings({ hotkey: hotkey as AppshotSettings["hotkey"] });
                        }}
                      >
                        <SelectTrigger size="sm" className="w-48 justify-between" aria-label={t("settings.appshotsHotkey")}>
                          <SelectValue>{appshotHotkeyLabel}</SelectValue>
                        </SelectTrigger>
                        <SelectContent position="popper" align="end">
                          <SelectItem value="both-command">{t("settings.appshotsHotkeyBothCommand")}</SelectItem>
                          <SelectItem value="command-shift-2">{t("settings.appshotsHotkeyCommandShift2")}</SelectItem>
                          <SelectItem value="command-option-2">{t("settings.appshotsHotkeyCommandOption2")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </Row>

                    <Row label={t("settings.appshotsDestination")} hint={t("settings.appshotsDestinationHint")}>
                      <Select
                        value={appshotSettings.destination}
                        disabled={appshotSaving}
                        onValueChange={(destination) => {
                          if (destination) {
                            void saveAppshotSettings({ destination: destination as AppshotSettings["destination"] });
                          }
                        }}
                      >
                        <SelectTrigger size="sm" className="w-48 justify-between" aria-label={t("settings.appshotsDestination")}>
                          <SelectValue>{appshotDestinationLabel}</SelectValue>
                        </SelectTrigger>
                        <SelectContent position="popper" align="end">
                          <SelectItem value="automatic">{t("settings.appshotsDestinationAutomatic")}</SelectItem>
                          <SelectItem value="current">{t("settings.appshotsDestinationCurrent")}</SelectItem>
                          <SelectItem value="new">{t("settings.appshotsDestinationNew")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </Row>

                    <Row label={t("settings.appshotsSound")}>
                      <Switch
                        aria-label={t("settings.appshotsSound")}
                        checked={appshotSettings.play_sound}
                        disabled={appshotSaving}
                        onCheckedChange={(play_sound) => void saveAppshotSettings({ play_sound })}
                      />
                    </Row>

                    <GroupHeading>{t("settings.appshotsPermissions")}</GroupHeading>
                    <Row
                      compact
                      label={t("settings.appshotsScreenRecording")}
                      hint={t("settings.appshotsScreenRecordingHint")}
                    >
                      {appshotSettings.screen_recording ? (
                        <span className="text-fine text-success">{t("settings.appshotsAllowed")}</span>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void grantAppshotAccess("screen-recording")}
                        >
                          {t("settings.appshotsAllow")}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground"
                        onClick={() => void appshotPrivacyOpener("screen-recording")}
                      >
                        {t("settings.appshotsOpenSettings")}
                      </Button>
                    </Row>
                    <Row
                      compact
                      label={t("settings.appshotsAccessibility")}
                      hint={t("settings.appshotsAccessibilityHint")}
                    >
                      {appshotSettings.accessibility ? (
                        <span className="text-fine text-success">{t("settings.appshotsAllowed")}</span>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void grantAppshotAccess("accessibility")}
                        >
                          {t("settings.appshotsAllow")}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground"
                        onClick={() => void appshotPrivacyOpener("accessibility")}
                      >
                        {t("settings.appshotsOpenSettings")}
                      </Button>
                    </Row>
                  </>
                )}
              </Page>
            )}

            {tab === "browser-use" && (
              <Page title={t("settings.browserUse")} description={t("settings.browserUseHint")}>
                <p className="pb-2 text-hint leading-relaxed text-muted-foreground">
                  {t("settings.browserUseNewSession")}
                </p>
                {browserUseError && (
                  <p data-browser-use-error className="pb-2 text-hint leading-relaxed text-destructive">
                    {browserUseError}
                  </p>
                )}
                {browserUseSettings?.errors.map((error) => (
                  <p key={error} className="pb-2 text-hint leading-relaxed text-destructive">
                    {error}
                  </p>
                ))}
                {!browserUseSettings ? (
                  <p className="py-5 text-ui text-muted-foreground">{t("settings.browserUseLoading")}</p>
                ) : (
                  <>
                    <Row label={t("settings.browserUseBackend")}>
                      <Select
                        value={browserUseSelection}
                        disabled={browserUseSaving !== null}
                        onValueChange={(backend) => {
                          if (backend) void saveBrowserUseSelection(backend);
                        }}
                      >
                        <SelectTrigger
                          data-browser-use-selection
                          aria-label={t("settings.browserUseBackend")}
                          size="sm"
                          className="w-52 justify-between"
                        >
                          <SelectValue>{browserUseSelectionLabel}</SelectValue>
                        </SelectTrigger>
                        <SelectContent position="popper" align="end">
                          <SelectItem value="automatic">{t("settings.browserUseAutomatic")}</SelectItem>
                          <SelectItem value="disabled">{t("settings.browserUseDisabled")}</SelectItem>
                          {browserUseSettings.backends.map((backend) => (
                            <SelectItem key={backend.id} value={backend.id} disabled={!backend.available}>
                              {backend.display_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Row>

                    <GroupHeading>{t("settings.browserUseBackends")}</GroupHeading>
                    {browserUseSettings.backends.map((backend) => (
                      <Row
                        key={backend.id}
                        compact
                        label={backend.display_name}
                        hint={backend.reason ?? <span className="font-mono">{backend.id}</span>}
                      >
                        <span className="flex items-center gap-1.5 text-fine text-muted-foreground">
                          <span className={cn("size-1.5 rounded-full", backend.available ? "bg-success" : "bg-border")} />
                          {backend.available
                            ? t("settings.browserUseAvailable")
                            : t("settings.browserUseUnavailable")}
                        </span>
                      </Row>
                    ))}
                  </>
                )}
              </Page>
            )}

            {tab === "providers" && (
              <Page title={t("settings.providers")} description={t("settings.providersHint")}>
                <div className="mb-2 flex items-center justify-end gap-2">
                  {(providerOperation?.action === "refresh" || providerMessage?.id === "*") && (
                    <span className="text-fine text-muted-foreground">
                      {providerOperation?.action === "refresh"
                        ? t("settings.providerChecking")
                        : providerMessage?.text}
                    </span>
                  )}
                  <Button
                    data-provider-refresh
                    variant="ghost"
                    size="xs"
                    disabled={!onReloadProviders || providerOperation !== null}
                    aria-label={t("settings.providerRefresh")}
                    onClick={() => void refreshProviderStatus()}
                  >
                    <RefreshCw className={cn(providerOperation?.action === "refresh" && "animate-spin")} />
                    {t("settings.providerRefresh")}
                  </Button>
                </div>
                {providerError?.id === "*" && (
                  <p className="mb-2 text-fine text-destructive">{providerError.text}</p>
                )}
                <div className="space-y-1">
                  {providers.map((p) => {
                    const enabled = p.enabled !== false;
                    const management = p.management ?? {
                      installed: p.available,
                      version: null,
                      latest_version: null,
                      update_available: null,
                      check_error: null,
                      install_supported: false,
                      upgrade_supported: false,
                      launch_mode: p.available ? "installed" as const : "unavailable" as const,
                    };
                    const expanded = expandedProviders.has(p.id);
                    const operation = providerOperation?.id === p.id ? providerOperation.action : null;
                    const status = !enabled
                      ? t("settings.providerDisabled")
                      : management.installed
                        ? management.version
                          ? t("settings.providerInstalledVersion", { version: management.version })
                          : t("settings.installed")
                        : management.launch_mode === "on_demand"
                          ? t("settings.providerReadyOnDemand")
                          : t("settings.notInstalled");
                    return (
                      <div
                        key={p.id}
                        data-provider-row={p.id}
                        className="rounded-(--ds-radius-module) bg-fill-quiet/40 px-3 transition-colors hover:bg-fill-quiet/70"
                      >
                        <div className="flex min-h-14 items-center gap-2">
                          <button
                            type="button"
                            data-provider-disclosure={p.id}
                            className="flex min-w-0 flex-1 items-center gap-3 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                            aria-expanded={expanded}
                            aria-controls={`provider-details-${p.id}`}
                            onClick={() => toggleProviderDetails(p.id)}
                          >
                            <span className="relative shrink-0">
                              <ProviderIcon
                                provider={p.id}
                                className={cn("size-5", !enabled && "opacity-40")}
                              />
                              <span
                                className={cn(
                                  "absolute -right-0.5 -top-0.5 size-1.5 rounded-full",
                                  enabled && p.available && "bg-success",
                                  enabled && !p.available && management.launch_mode === "on_demand" && "bg-warning",
                                  (!enabled || management.launch_mode === "unavailable") && "bg-border",
                                )}
                              />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex min-w-0 items-center gap-2">
                                <span className="truncate text-ui font-medium">{p.display_name}</span>
                                {management.version && (
                                  <span className="shrink-0 font-mono text-cap text-muted-foreground">
                                    v{management.version}
                                  </span>
                                )}
                              </span>
                              <span className="mt-0.5 block truncate text-fine text-muted-foreground">
                                {status}
                              </span>
                            </span>
                            <ChevronDown
                              className={cn(
                                "size-4 shrink-0 text-muted-foreground transition-transform",
                                expanded && "rotate-180",
                              )}
                            />
                          </button>
                          {!management.installed && management.install_supported && (
                            <Button
                              data-provider-action={`${p.id}:install`}
                              variant="secondary"
                              size="xs"
                              disabled={providerOperation !== null}
                              onClick={() => void runProviderAction(p.id, "install")}
                            >
                              {operation === "install" ? <LoaderCircle className="animate-spin" /> : <Download />}
                              {operation === "install"
                                ? t("settings.providerInstalling")
                                : t("settings.providerInstall")}
                            </Button>
                          )}
                          {management.installed
                            && management.upgrade_supported
                            && management.update_available === true && (
                            <Button
                              data-provider-action={`${p.id}:upgrade`}
                              variant="ghost"
                              size="xs"
                              disabled={providerOperation !== null}
                              onClick={() => void runProviderAction(p.id, "upgrade")}
                            >
                              {operation === "upgrade" ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
                              {operation === "upgrade"
                                ? t("settings.providerUpgrading")
                                : management.latest_version
                                  ? t("settings.providerUpgradeVersion", {
                                    version: management.latest_version,
                                  })
                                  : t("settings.providerUpgrade")}
                            </Button>
                          )}
                          <Switch
                            data-provider-toggle={p.id}
                            checked={enabled}
                            disabled={providerOperation !== null}
                            aria-label={enabled
                              ? t("settings.providerDisableAria", { provider: p.display_name })
                              : t("settings.providerEnableAria", { provider: p.display_name })}
                            onCheckedChange={(checked) => void saveProviderEnabled(p.id, checked)}
                          />
                        </div>
                        {(providerMessage?.id === p.id || providerError?.id === p.id) && (
                          <p
                            className={cn(
                              "ml-8 pb-2 text-fine",
                              providerError?.id === p.id ? "text-destructive" : "text-muted-foreground",
                            )}
                          >
                            {providerError?.id === p.id ? providerError.text : providerMessage?.text}
                          </p>
                        )}
                        {expanded && (
                          <div id={`provider-details-${p.id}`} className="ml-8 pb-3">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-fine text-muted-foreground">
                              <span className="font-mono">{p.id}</span>
                              <span>
                                {management.launch_mode === "installed"
                                  ? t("settings.providerLocalRuntime")
                                  : management.launch_mode === "on_demand"
                                    ? t("settings.providerOnDemandRuntime")
                                    : t("settings.providerUnavailableRuntime")}
                              </span>
                              {p.needs_node && <span>{t("settings.needsNode")}</span>}
                            </div>
                            {p.capabilities
                              .filter((capability) => capability.state !== "unavailable")
                              .map((capability) => (
                                <div
                                  key={capability.id}
                                  data-provider-capability={`${p.id}:${capability.id}`}
                                  className="flex items-start justify-between gap-6 py-2.5"
                                >
                                  <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-1.5 text-hint font-medium">
                                      {CAPABILITY_LABELS[capability.id]}
                                      {capability.experimental && <Badge variant="outline">Experimental</Badge>}
                                      {capability.version && (
                                        <span className="font-mono text-cap text-muted-foreground">
                                          {capability.version}
                                        </span>
                                      )}
                                    </div>
                                    {capability.reason && (
                                      <p className="mt-0.5 text-fine leading-relaxed text-muted-foreground">
                                        {capability.reason}
                                      </p>
                                    )}
                                    {capability.fix && (
                                      <p className="mt-0.5 text-fine leading-relaxed text-foreground/75">
                                        {capability.fix}
                                      </p>
                                    )}
                                  </div>
                                  <span className="flex shrink-0 items-center gap-1.5 pt-0.5 text-fine capitalize text-muted-foreground">
                                    <span
                                      className={cn(
                                        "size-1.5 rounded-full",
                                        capability.state === "ready" && "bg-success",
                                        capability.state === "unverified" && "bg-warning",
                                      )}
                                    />
                                    {capability.state}
                                  </span>
                                </div>
                              ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Page>
            )}

            {tab === "developer" && (
              <Page title={t("settings.developer")} description={t("settings.developerHint")}>
                <Row label={t("settings.developerMode")} hint={t("settings.developerModeHint")}>
                  <Switch
                    checked={pluginDevelopment?.enabled ?? false}
                    disabled={pluginDevelopmentSaving}
                    onCheckedChange={(checked) => void savePluginDeveloperMode(checked)}
                    aria-label={t("settings.developerMode")}
                  />
                </Row>

                <GroupHeading>{t("settings.pluginDevelopment")}</GroupHeading>

                <Row
                  label={t("settings.pluginHotReload")}
                  hint={(
                    <span aria-live="polite">
                      <span className="block">{pluginDevelopmentStatus}</span>
                      {pluginReloadDetail && (
                        <span
                          className="mt-0.5 block"
                          role={pluginReloadRecord?.success ? undefined : "alert"}
                        >
                          {pluginReloadDetail}
                        </span>
                      )}
                    </span>
                  )}
                >
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pluginDevelopmentReloading || pluginDevelopmentSaving}
                    onClick={() => void reloadPlugins()}
                  >
                    <RefreshCw
                      data-icon="inline-start"
                      className={cn(pluginDevelopmentReloading && "animate-spin")}
                    />
                    {pluginDevelopmentReloading
                      ? t("settings.reloadingPlugins")
                      : t("settings.reloadPlugins")}
                  </Button>
                </Row>

                <Row label={t("settings.webviewDevtools")} hint={t("settings.webviewDevtoolsHint")}>
                  <Button variant="outline" size="sm" onClick={() => void showWebviewDevtools()}>
                    <Bug data-icon="inline-start" />
                    {t("settings.openWebviewDevtools")}
                  </Button>
                </Row>

                {pluginDevelopmentError && (
                  <p className="pt-2 text-hint text-destructive" role="alert">
                    {pluginDevelopmentError}
                  </p>
                )}
              </Page>
            )}

            {tab === "browser" && (
              <Page
                title="Browser"
                description="Experimental website permissions granted permanently to C2 Browser. Sensitive actions and downloads always require one-time approval."
              >
                <Row
                  icon={<Globe className="size-5 text-muted-foreground" />}
                  label="Default browser adapter"
                  hint="Ordinary requests use C2 Browser. Explicit Chrome, existing-tab, or existing-login requests use Chrome."
                >
                  <Badge variant="outline">Experimental</Badge>
                </Row>
                <GroupHeading>Permanent website access</GroupHeading>
                {browserOrigins.length === 0 ? (
                  <p className="py-5 text-ui text-muted-foreground">No origins have permanent access.</p>
                ) : (
                  browserOrigins.map((origin) => (
                    <Row key={origin} compact label={origin} hint="Website content remains untrusted.">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-muted-foreground hover:text-destructive"
                        title="Revoke"
                        onClick={() => {
                          void browserRevokePermission(origin).then(() =>
                            setBrowserOrigins((current) => current.filter((item) => item !== origin)),
                          );
                        }}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </Row>
                  ))
                )}
              </Page>
            )}
          </div>
        </ScrollArea>
      </main>
    </div>
  );
}
