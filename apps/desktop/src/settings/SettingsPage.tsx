import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  BrainCircuit,
  ChartNoAxesColumn,
  Folder,
  Globe,
  Keyboard,
  MousePointer2,
  Package,
  Palette,
  RotateCcw,
  ScanText,
  SlidersHorizontal,
  Trash2,
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
  setProjectScheduling,
} from "../bridge";
import { formatCombo, MOD_LABEL } from "../keys";
import { useLanguage, useT, type LanguagePreference } from "../i18n";
import { en as EN_STRINGS, LOCALES, type StringKey } from "../i18n/strings";
import { resetAppearanceSettings } from "../appearance";
import { useTheme } from "../theme";
import { setTerminalSettings, useTerminalSettings } from "../terminal/settings";
import { ProviderIcon } from "../providers/ProviderIcon";
import { UsagePanel } from "../usage/Usage";
import { MemorySettingsPage } from "./MemorySettings";
import { AppearanceSettings } from "./AppearanceSettings";
import {
  worktreeBranchDisplay,
  worktreeDiscardRoute,
  worktreeStatusBadges,
  type WorktreeStatusBadge,
} from "./worktrees";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

import "./settings-page.css";

export type SettingsTab =
  | "general"
  | "appearance"
  | "project"
  | "memory"
  | "keybindings"
  | "providers"
  | "computer-use"
  | "appshots"
  | "browser-use"
  | "usage"
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
  children,
}: {
  icon?: ReactNode;
  label: string;
  hint?: ReactNode;
  /** Dense lists (keybindings) — same anatomy, tighter rhythm. */
  compact?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-8", compact ? "py-2" : "py-3.5")}>
      <div className="flex min-w-0 items-center gap-3">
        {icon}
        <div className="min-w-0 max-w-[420px]">
          <div className="truncate text-ui font-medium">{label}</div>
          {hint && <div className="mt-0.5 text-hint leading-relaxed text-muted-foreground">{hint}</div>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">{children}</div>
    </div>
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
function Page({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <div>
      <h1 className="text-display font-semibold tracking-tight">{title}</h1>
      <p className="pb-3 pt-1.5 text-hint leading-relaxed text-muted-foreground">{description}</p>
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
  onOpenSession = () => {},
  memoryEnabled,
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
}: {
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
  onOpenSession?: (sessionId: string) => void;
  memoryEnabled: boolean;
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
  useEffect(() => setTab(initialTab), [initialTab]);
  useEffect(() => {
    if (!memoryEnabled) {
      setTab((current) => current === "memory" ? "general" : current);
    }
  }, [memoryEnabled]);
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
  const [projectModeSaving, setProjectModeSaving] = useState(false);
  // Scene `schedule` hooks are off by default per project (docs/scenes.md §Security).
  const [schedulingEnabled, setSchedulingEnabled] = useState(false);
  useEffect(() => {
    if (!project) return;
    void getProjectScheduling(project.path).then(setSchedulingEnabled);
  }, [project]);
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
      resetAppearanceSettings();
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
      <aside className="glass-rail flex w-56 shrink-0 flex-col">
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
            const items = group.items.filter(({ id }) => memoryEnabled || id !== "memory");
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
            className={cn(
              "mx-auto w-full pb-20",
              tab === "memory" ? "settings-memory-page" : "settings-standard-page",
            )}
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
                    <Row
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
                        <SelectTrigger size="sm" className="w-56 justify-between">
                          <SelectValue />
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
                    </Row>
                    <Row
                      label={t("settings.scheduling")}
                      hint={t("settings.schedulingHint")}
                    >
                      <Checkbox
                        checked={schedulingEnabled}
                        onCheckedChange={(checked) => {
                          const enabled = checked === true;
                          setSchedulingEnabled(enabled);
                          void setProjectScheduling(project.path, enabled);
                        }}
                      />
                    </Row>
                    <Row label={t("settings.projectPath")}>
                      <span className="max-w-72 truncate font-mono text-fine text-muted-foreground" title={project.path}>
                        {project.path}
                      </span>
                    </Row>

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
                          <Row
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
                          </Row>
                        );
                      })
                    )}
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
                {providers.map((p) => (
                  <div key={p.id} className="mb-2 rounded-(--ds-radius-module) bg-fill-quiet/40 px-3 last:mb-0">
                    <Row
                      icon={<ProviderIcon provider={p.id} className="size-5 shrink-0 opacity-80" />}
                      label={p.display_name}
                      hint={
                        <span className="font-mono">
                          {p.id}
                          {p.needs_node && ` · ${t("settings.needsNode")}`}
                        </span>
                      }
                    >
                      <span className="flex items-center gap-1.5 text-fine text-muted-foreground">
                        <span
                          className={cn("size-1.5 rounded-full", p.available ? "bg-success" : "bg-border")}
                        />
                        {p.available ? t("settings.installed") : t("settings.notInstalled")}
                      </span>
                    </Row>
                    {p.capabilities
                      .filter((capability) => capability.state !== "unavailable")
                      .map((capability) => (
                        <div
                          key={capability.id}
                          data-provider-capability={`${p.id}:${capability.id}`}
                          className="ml-8 flex items-start justify-between gap-6 py-2.5"
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
                ))}
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
