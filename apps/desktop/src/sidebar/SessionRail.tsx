import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useLayoutEffect,
  useState,
} from "react";
import type { HTMLAttributes, ReactElement, ReactNode } from "react";
import {
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  Blocks,
  CalendarClock,
  ChartNoAxesColumn,
  Check,
  CircleAlert,
  Container,
  ChevronRight,
  Copy,
  Folder,
  FolderOpen,
  FolderX,
  GitBranch,
  GitMerge,
  GitPullRequest,
  GripVertical,
  Hash,
  MessageSquarePlus,
  MoreHorizontal,
  PanelLeft,
  Pencil,
  Pin,
  Plus,
  Search,
  Settings,
  SquareKanban,
  SquarePen,
  Smartphone,
  Trash2,
} from "@/components/ui/icons";

import { githubCurrentPullRequest, openNativePath } from "../bridge";
import type { GitHubPullRequest, Project, SessionInfo } from "../bridge";
import {
  isNativeContextMenusAvailable,
  showNativeContextMenu,
} from "../container";
import type { NativeContextMenuItem } from "../container";
import { NavigationRow } from "@/components/business/navigation-row";
import { Button } from "@/components/ui/button";
import { ActivityOrb } from "@/components/ui/activity-orb";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipButton,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useResizeHandle } from "@/components/ui/use-resize-handle";
import { useT } from "../i18n";
import { usePersistedBoolean } from "@/lib/persist";
import { cn } from "@/lib/utils";
import { sessionActivity } from "../session/sessionEvents";
import type { QuickQuotaSummary } from "../usage/quickQuota";
import { useToast } from "../ui/toast";
import {
  assignTaskSection,
  createSidebarTaskSection,
  deleteSidebarTaskSection,
  loadSidebarTaskSections,
  moveSidebarTask,
  moveSidebarTaskSection,
  projectTaskOrderKey,
  renameSidebarTaskSection,
  saveSidebarTaskSections,
  setSidebarTaskSectionCollapsed,
  sortSidebarTasks,
  unsectionedTaskOrderKey,
} from "./sidebarSections";
import type { SidebarTaskSection } from "./sidebarSections";
import {
  rootProjectOrderKey,
  loadSidebarProjects,
  moveSidebarProject,
  releaseSidebarSectionProjects,
  saveSidebarProjects,
  setSidebarProjectCollapsed,
  sortSidebarProjects,
} from "./sidebarProjects";
import { loadSidebarPullRequests } from "./sidebarGitStatus";
import type { SidebarPullRequestStatus } from "./sidebarGitStatus";

const sidebarDragType = "application/x-codetwo-sidebar-item";

type SidebarDragItem =
  | { kind: "task"; id: string }
  | { kind: "section"; id: string }
  | { kind: "project"; id: string };

function writeSidebarDrag(event: React.DragEvent, item: SidebarDragItem): void {
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData(sidebarDragType, JSON.stringify(item));
  event.dataTransfer.setData("text/plain", item.id);
}

function readSidebarDrag(event: React.DragEvent): SidebarDragItem | null {
  try {
    const value = JSON.parse(
      event.dataTransfer.getData(sidebarDragType)
    ) as SidebarDragItem;
    if (
      (value.kind === "task" ||
        value.kind === "section" ||
        value.kind === "project") &&
      value.id
    ) {
      return value;
    }
  } catch {
    // Ignore drags from other applications and older renderers.
  }
  return null;
}

type ContextMenuTriggerElement = ReactElement<{
  render: ReactElement<HTMLAttributes<HTMLDivElement>>;
}>;

const RailUtilityButton = ({
  label,
  selected = false,
  busy = false,
  onSelect,
  children,
}: {
  readonly label: string;
  readonly selected?: boolean;
  readonly busy?: boolean;
  readonly onSelect: () => void;
  readonly children: ReactNode;
}) => (
  <Tooltip>
    <TooltipTrigger
      render={
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          data-slot="rail-utility-button"
          data-selected={selected ? "true" : "false"}
          aria-current={selected ? "page" : undefined}
          aria-label={label}
          aria-busy={busy || undefined}
          onClick={onSelect}
          className={cn(
            "text-muted-foreground hover:text-foreground rounded-full",
            selected &&
              "bg-primary/15 text-primary hover:bg-primary/20 hover:text-primary"
          )}
        >
          {children}
        </Button>
      }
    />
    <TooltipContent side="top">{label}</TooltipContent>
  </Tooltip>
);

const SessionContextMenu = ({
  items,
  onAction,
  children,
}: {
  readonly items: NativeContextMenuItem[];
  readonly onAction: (action: string) => void;
  readonly children: ReactNode;
}) => {
  if (!isNativeContextMenusAvailable) {
    return <ContextMenu>{children}</ContextMenu>;
  }

  const trigger = Children.toArray(children)[0];
  if (!isValidElement(trigger)) {
    return null;
  }
  const row = (trigger as ContextMenuTriggerElement).props.render;
  const onContextMenu = row.props.onContextMenu;

  return cloneElement(row, {
    onContextMenu: (event) => {
      onContextMenu?.(event);
      event.preventDefault();
      event.stopPropagation();
      void showNativeContextMenu(items, onAction);
    },
  });
};

/**
 * The rail, four zones top to bottom:
 *
 * 1. Title — sidebar controls on the traffic-light line, with search directly below it.
 * 2. Features — the app's primary destinations as compact, labeled source-list rows.
 * 3. Tasks — user-created Sections contain ordered Projects, which contain ordered Tasks.
 * 4. Utilities — quota and settings stay reachable at the bottom while recent chats scroll.
 * The active model remains available in the composer, where it can also be changed.
 */
export const SessionRail = ({
  projects,
  sessions,
  archivedSessions,
  previews,
  activeSession,
  runningSessions,
  onSelect,
  onNew,
  quickChatOpen,
  onToggleQuickChat,
  onRename,
  onPin,
  onArchive,
  onDiscardWorktree,
  displayProvider,
  onOpenMarket,
  onOpenAutomations,
  deviceConnectionsAvailable,
  deviceConnectionsOpen,
  onOpenDeviceConnections,
  newHint,
  searchHint,
  onOpenSearch,
  onOpenSettings,
  collapsed,
  overlay,
  onToggleCollapse,
  width,
  onWidth,
  taskBoardOpen,
  onOpenTaskBoard,
  pullRequestsOpen,
  onOpenPullRequests,
  automationsOpen,
  pluginManagerOpen,
  dockerAvailable,
  dockerOpen,
  onOpenDocker,
  quickQuota,
  quickQuotaLoading,
  quickQuotaProviderName,
  onOpenUsage,
  pluginActions,
  resourceSections,
  loadPullRequest = githubCurrentPullRequest,
}: {
  readonly projects: Project[];
  /**
  Every live Task session; the rail nests it under its Project unless explicitly Sectioned.
  */
  readonly sessions: SessionInfo[];
  /**
  Every archived Task session, shown in one collapsible system Section.
  */
  readonly archivedSessions: SessionInfo[];
  /**
  Newest text per session id — shown as a bounded conversation summary below the title.
  */
  readonly previews: Record<string, string>;
  readonly activeSession: string | null;
  /**
  Every session with a turn in flight, including background sessions.
  */
  readonly runningSessions: ReadonlySet<string>;
  readonly onSelect: (id: string) => void;
  /**
  Opens the default Task-owned draft.
  */
  readonly onNew: () => void;
  /**
  App-lifetime quick chat that stays outside the tracked task list.
  */
  readonly quickChatOpen: boolean;
  readonly onToggleQuickChat: () => void;
  readonly onRename: (id: string, title: string) => void;
  /**
  Keeps an active session above the recency list until explicitly unpinned.
  */
  readonly onPin: (id: string, isPinned: boolean) => void;
  /**
  Flips a session's archived state — true to archive, false to restore.
  */
  readonly onArchive: (id: string, isArchived: boolean) => Promise<void> | void;
  /**
  Permanently removes a session's isolated checkout and branch, after confirmation.
  */
  readonly onDiscardWorktree: (session: SessionInfo) => void;
  /**
  The provider a session runs on, as its display name — the row's agent line.
  */
  readonly displayProvider: (p: SessionInfo["provider"]) => string;
  readonly onOpenMarket: () => void;
  readonly onOpenAutomations: () => void;
  /**
  The built-in remote component is live and can open its pairing surface.
  */
  readonly deviceConnectionsAvailable: boolean;
  readonly deviceConnectionsOpen: boolean;
  readonly onOpenDeviceConnections: () => void;
  readonly newHint: string;
  /**
  The palette's shortcut, shown in the search box.
  */
  readonly searchHint: string;
  readonly onOpenSearch: () => void;
  readonly onOpenSettings: () => void;
  /**
  Collapsed: the rail animates to zero width; the main header grows an expand button.
  */
  readonly collapsed: boolean;
  /**
  Narrow layouts take the rail out of the flex row and show it above the session column.
  */
  readonly overlay: boolean;
  readonly onToggleCollapse: () => void;
  /**
  Rail width in px — dragged by the right-edge grip, persisted by the caller.
  */
  readonly width: number;
  readonly onWidth: (n: number) => void;
  readonly taskBoardOpen: boolean;
  readonly onOpenTaskBoard: () => void;
  readonly pullRequestsOpen: boolean;
  readonly onOpenPullRequests: () => void;
  readonly automationsOpen: boolean;
  readonly pluginManagerOpen: boolean;
  readonly dockerAvailable: boolean;
  readonly dockerOpen: boolean;
  readonly onOpenDocker: () => void;
  /**
  Most constrained provider-owned quota window, for the glanceable rail meter.
  */
  readonly quickQuota: QuickQuotaSummary | null;
  readonly quickQuotaLoading: boolean;
  readonly quickQuotaProviderName: string;
  readonly onOpenUsage: () => void;
  /**
  Host-rendered declarative plugin actions in the primary feature list.
  */
  readonly pluginActions?: ReactNode;
  /**
  External resources render as peer Sections in the same scroll flow as Tasks.
  */
  readonly resourceSections?: ReactNode;
  /**
  Injectable for deterministic rendered tests; production resolves the current branch via GitHub.
  */
  readonly loadPullRequest?: (
    path: string
  ) => Promise<GitHubPullRequest | null>;
}) => {
  const t = useT();
  const toast = useToast();
  const [renaming, setRenaming] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [taskSections, setTaskSections] = useState(() =>
    loadSidebarTaskSections(
      typeof localStorage === "undefined" ? null : localStorage
    )
  );
  const [creatingSectionFor, setCreatingSectionFor] = useState<
    { kind: "task" | "project"; id: string } | undefined
  >();
  const [sectionDraft, setSectionDraft] = useState("");
  const [renamingSection, setRenamingSection] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [dragItem, setDragItem] = useState<SidebarDragItem | null>(null);
  const [projectOrganization, setProjectOrganization] = useState(() =>
    loadSidebarProjects(
      typeof localStorage === "undefined" ? null : localStorage
    )
  );

  useEffect(() => {
    saveSidebarTaskSections(
      typeof localStorage === "undefined" ? null : localStorage,
      taskSections
    );
  }, [taskSections]);

  useEffect(() => {
    saveSidebarProjects(
      typeof localStorage === "undefined" ? null : localStorage,
      projectOrganization
    );
  }, [projectOrganization]);

  // Clamped on every render, not just while dragging, so a width saved on one display comes back
  // usable on another.
  const applied = Math.min(420, Math.max(220, width));
  const quickQuotaWindow =
    quickQuota?.windowMinutes === 300
      ? t("quota.window5h")
      : quickQuota?.windowMinutes === 10_080
        ? t("quota.windowWeekly")
        : quickQuota?.windowMinutes !== null &&
            quickQuota?.windowMinutes !== undefined &&
            quickQuota.windowMinutes >= 43_000
          ? t("quota.windowMonthly")
          : t("quota.windowUnknown");
  const quickQuotaTitle = quickQuota
    ? `${quickQuotaProviderName} · ${quickQuotaWindow} · ${t("quota.remaining", { percent: quickQuota.remainingPercent })} · ${t("quota.quickOpen")}`
    : `${quickQuotaProviderName} · ${t(quickQuotaLoading ? "quota.checkingShort" : "quota.quickUnavailable")} · ${t("quota.quickOpen")}`;

  // A grip drag must track the pointer 1:1 — the collapse transition below would ease every
  // intermediate width instead, so it's dropped for the duration of the drag (the dock does the
  // same, for the same reason).
  const [dragging, setDragging] = useState(false);

  // `invisible` only after the collapse lands: a zero-width pane still paints its border as a
  // hairline, and hiding earlier would cut the animation off.
  const [gone, setGone] = useState(collapsed);
  useLayoutEffect(() => {
    if (!collapsed) {
      setGone(false);
      return;
    }
    const id = window.setTimeout(() => setGone(true), 300);
    return () => window.clearTimeout(id);
  }, [collapsed]);

  // Keep the row in place long enough for its exit to read before the bridge moves it between the
  // live and archived collections. Reduced Motion collapses the CSS duration, so the same event
  // path still commits immediately without maintaining a second timing constant in TypeScript.
  const [archiveMotion, setArchiveMotion] = useState<
    ReadonlyMap<string, boolean>
  >(() => new Map());
  const requestArchive = (id: string, isArchived: boolean) => {
    setArchiveMotion((current) => {
      if (current.has(id)) {
        return current;
      }
      const next = new Map(current);
      next.set(id, isArchived);
      return next;
    });
  };
  const finishArchiveMotion = (id: string) => {
    const archived = archiveMotion.get(id);
    if (archived === undefined) {
      return;
    }

    const clearMotion = () => {
      setArchiveMotion((current) => {
        if (!current.has(id)) {
          return current;
        }
        const next = new Map(current);
        next.delete(id);
        return next;
      });
    };

    Promise.resolve(onArchive(id, archived)).then(clearMotion, clearMotion);
  };

  const resizeHandle = useResizeHandle({
    axis: "x",
    max: 420,
    min: 220,
    onEnd: () => setDragging(false),
    onResize: onWidth,
    onStart: () => {
      setDragging(true);
    },
    value: applied,
  });

  const projectNames = new Map(
    projects.map((project) => [project.path, project.name])
  );

  // "Recent" follows deliberate re-entry into work, not background chunks or the original
  // creation date. Archived history keeps its stable creation order.
  const recent = [...sessions].sort(
    (a, b) =>
      Number(b.pinned) - Number(a.pinned) ||
      (b.last_active_at ?? b.created_at) - (a.last_active_at ?? a.created_at)
  );
  const archived = [...archivedSessions].sort(
    (a, b) => b.created_at - a.created_at
  );
  const gitTargetPaths = [
    ...new Set(
      recent.slice(0, 48).map((session) => session.worktree_path ?? session.cwd)
    ),
  ];
  const gitTargetKey = gitTargetPaths.join("\u0000");
  const [gitRefresh, setGitRefresh] = useState(0);
  const [pullRequestsByPath, setPullRequestsByPath] = useState<
    ReadonlyMap<string, SidebarPullRequestStatus | null>
  >(() => new Map());

  useEffect(() => {
    const timer = window.setInterval(
      () => setGitRefresh((current) => current + 1),
      60_000
    );
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let isActive = true;
    void loadSidebarPullRequests(
      gitTargetPaths.map((path) => ({ path })),
      loadPullRequest
    ).then((statuses) => {
      if (isActive) {
        setPullRequestsByPath(statuses);
      }
    });
    return () => {
      isActive = false;
    };
  }, [gitRefresh, gitTargetKey, loadPullRequest]);

  const manualSectionIds = new Set(
    taskSections.sections.map((section) => section.id)
  );
  const assignedSection = (session: SessionInfo) => {
    const id = taskSections.assignments[session.id];
    return id && manualSectionIds.has(id) ? id : null;
  };
  const projectPathForSession = (session: SessionInfo) =>
    session.project_path ??
    (projectNames.has(session.cwd) ? session.cwd : null);
  const projectEntries = (() => {
    const entries = new Map(projects.map((project) => [project.path, project]));
    for (const session of recent) {
      const path = projectPathForSession(session);
      if (!path || entries.has(path)) {
        continue;
      }
      entries.set(path, {
        default_worktree_mode: null,
        last_opened_at: session.last_active_at ?? session.created_at,
        name: path.split(/[\\/]/u).filter(Boolean).pop() ?? path,
        path,
      });
    }
    return [...entries.values()].sort(
      (left, right) => right.last_opened_at - left.last_opened_at
    );
  })();
  const assignedProjectSection = (path: string) => {
    const id = projectOrganization.assignments[path];
    return id && manualSectionIds.has(id) ? id : null;
  };
  const unsectioned = sortSidebarTasks(
    recent.filter(
      (session) => !assignedSection(session) && !projectPathForSession(session)
    ),
    taskSections.taskOrder[unsectionedTaskOrderKey]
  );
  const sectionRows = new Map(
    taskSections.sections.map((section) => [
      section.id,
      sortSidebarTasks(
        recent.filter((session) => assignedSection(session) === section.id),
        taskSections.taskOrder[section.id]
      ),
    ])
  );
  const projectRows = new Map(
    projectEntries.map((project) => [
      project.path,
      sortSidebarTasks(
        recent.filter(
          (session) =>
            !assignedSection(session) &&
            projectPathForSession(session) === project.path
        ),
        taskSections.taskOrder[projectTaskOrderKey(project.path)]
      ),
    ])
  );
  const rootProjects = sortSidebarProjects(
    projectEntries.filter((project) => !assignedProjectSection(project.path)),
    projectOrganization.order[rootProjectOrderKey]
  );
  const sectionProjects = new Map(
    taskSections.sections.map((section) => [
      section.id,
      sortSidebarProjects(
        projectEntries.filter(
          (project) => assignedProjectSection(project.path) === section.id
        ),
        projectOrganization.order[section.id]
      ),
    ])
  );

  // Folded by default: archived threads are reference material, not the working set, so they
  // shouldn't compete with the live rows for attention. The fold survives a restart.
  const [archivedOpen, setArchivedOpen] = usePersistedBoolean(
    "rail.archivedOpen",
    false
  );

  const copyToClipboard = async (value: string, confirmation: string) => {
    try {
      if (!navigator.clipboard) {
        throw new Error("Clipboard API unavailable");
      }
      await navigator.clipboard.writeText(value);
      toast(confirmation, "success");
    } catch {
      toast(t("rail.copyFailed"), "error");
    }
  };

  const revealWorkingDirectory = async (path: string) => {
    try {
      if (!(await openNativePath(path))) {
        throw new Error("Native path reveal unavailable");
      }
    } catch {
      toast(t("rail.revealFailed"), "error");
    }
  };

  const beginSectionCreation = (taskId: string) => {
    setSectionDraft("");
    setCreatingSectionFor({ id: taskId, kind: "task" });
  };

  const beginProjectSectionCreation = (path: string) => {
    setSectionDraft("");
    setCreatingSectionFor({ id: path, kind: "project" });
  };

  const commitSectionCreation = () => {
    const name = sectionDraft.trim();
    if (name) {
      const id = `section:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
      setTaskSections((current) =>
        createSidebarTaskSection(
          current,
          name,
          id,
          creatingSectionFor?.kind === "task"
            ? creatingSectionFor.id
            : undefined
        )
      );
      if (creatingSectionFor?.kind === "project") {
        setProjectOrganization((current) =>
          moveSidebarProject(current, creatingSectionFor.id, id, null, [])
        );
      }
    }
    setCreatingSectionFor(undefined);
    setSectionDraft("");
  };

  const commitSectionRename = () => {
    if (!renamingSection) {
      return;
    }
    setTaskSections((current) =>
      renameSidebarTaskSection(
        current,
        renamingSection.id,
        renamingSection.name
      )
    );
    setRenamingSection(null);
  };

  const taskIdsForSection = (sectionId: string | null) =>
    (sectionId === null ? unsectioned : (sectionRows.get(sectionId) ?? [])).map(
      (session) => session.id
    );
  const taskIdsForProject = (path: string) =>
    (projectRows.get(path) ?? []).map((session) => session.id);

  const dropTask = (
    taskId: string,
    sectionId: string | null,
    beforeTaskId: string | null,
    destinationTaskIds: readonly string[],
    destinationOrderKey: string,
    projectPath: string | null = null
  ) => {
    if (projectPath) {
      const source = recent.find((session) => session.id === taskId);
      if (!source || projectPathForSession(source) !== projectPath) {
        return;
      }
    }
    setTaskSections((current) =>
      moveSidebarTask(
        current,
        taskId,
        sectionId,
        beforeTaskId,
        destinationTaskIds,
        destinationOrderKey
      )
    );
    setDragItem(null);
  };

  const moveTaskBy = (session: SessionInfo, offset: -1 | 1) => {
    const sectionId = assignedSection(session);
    const projectPath =
      sectionId === null ? projectPathForSession(session) : null;
    const ids = projectPath
      ? taskIdsForProject(projectPath)
      : taskIdsForSection(sectionId);
    const currentIndex = ids.indexOf(session.id);
    const nextIndex = Math.min(
      ids.length - 1,
      Math.max(0, currentIndex + offset)
    );
    if (currentIndex < 0 || nextIndex === currentIndex) {
      return;
    }
    const remaining = ids.filter((id) => id !== session.id);
    const beforeTaskId = remaining[nextIndex] ?? null;
    dropTask(
      session.id,
      sectionId,
      beforeTaskId,
      ids,
      projectPath
        ? projectTaskOrderKey(projectPath)
        : (sectionId ?? unsectionedTaskOrderKey),
      projectPath
    );
  };

  const projectPathsForSection = (sectionId: string | null) =>
    (sectionId === null
      ? rootProjects
      : (sectionProjects.get(sectionId) ?? [])
    ).map((project) => project.path);

  const dropProject = (
    path: string,
    sectionId: string | null,
    beforePath: string | null
  ) => {
    setProjectOrganization((current) =>
      moveSidebarProject(
        current,
        path,
        sectionId,
        beforePath,
        projectPathsForSection(sectionId)
      )
    );
    setDragItem(null);
  };

  const moveProjectBy = (path: string, offset: -1 | 1) => {
    const sectionId = assignedProjectSection(path);
    const paths = projectPathsForSection(sectionId);
    const currentIndex = paths.indexOf(path);
    const nextIndex = Math.min(
      paths.length - 1,
      Math.max(0, currentIndex + offset)
    );
    if (currentIndex < 0 || nextIndex === currentIndex) {
      return;
    }
    const remaining = paths.filter((candidate) => candidate !== path);
    dropProject(path, sectionId, remaining[nextIndex] ?? null);
  };

  const moveSectionBy = (section: SidebarTaskSection, offset: -1 | 1) => {
    const ids = taskSections.sections.map((candidate) => candidate.id);
    const currentIndex = ids.indexOf(section.id);
    const nextIndex = Math.min(
      ids.length - 1,
      Math.max(0, currentIndex + offset)
    );
    if (currentIndex < 0 || nextIndex === currentIndex) {
      return;
    }
    const remaining = ids.filter((id) => id !== section.id);
    const beforeId = remaining[nextIndex] ?? null;
    setTaskSections((current) =>
      moveSidebarTaskSection(current, section.id, beforeId)
    );
  };

  /**
  One quiet source-list row: task title, workspace identity, and only actionable status.
  */
  const sessionRow = (
    s: SessionInfo,
    isArchived: boolean,
    isShowProjectIdentity = true
  ) => {
    const activity = sessionActivity(s).state;
    const isAwaitingInput = activity.kind === "awaiting_input";
    const isFailed = activity.kind === "failed";
    const isRunning =
      runningSessions.has(s.id) ||
      activity.kind === "running" ||
      isAwaitingInput;
    const statusLabel = isAwaitingInput
      ? t("session.awaitingInput")
      : isFailed
        ? t("session.failed")
        : isRunning
          ? t("session.running")
          : t("session.completed");
    const preview = previews[s.id]?.trim();
    // Structured empty documents can serialize to a bullet or another punctuation-only fragment.
    // It carries no glanceable meaning and should not consume a whole rail line. Neither does a
    // preview that merely restates the title, which is typical of single-prompt threads.
    const hasUsefulPreview = Boolean(
      preview && /[\p{L}\p{N}]/u.test(preview) && preview !== s.title.trim()
    );
    const workspacePath = s.project_path ?? s.worktree_path ?? s.cwd;
    const workspaceName =
      (s.project_path ? projectNames.get(s.project_path) : null) ??
      workspacePath.split(/[\\/]/u).filter(Boolean).pop() ??
      workspacePath;
    const checkoutPath = s.worktree_path ?? s.cwd;
    const isWorktree = s.worktree_path !== null && !s.worktree_discarded;
    const pullRequest = pullRequestsByPath.get(checkoutPath) ?? null;
    const pullRequestLabel = pullRequest
      ? t(`rail.pullRequest.${pullRequest.state}`)
      : null;
    const pullRequestTone =
      pullRequest?.state === "merged"
        ? "text-success"
        : pullRequest?.state === "conflicting" ||
            pullRequest?.state === "ci_failed"
          ? "text-destructive"
          : pullRequest?.state === "ci_running"
            ? "text-warning"
            : "text-muted-foreground";

    const commitRename = () => {
      if (renaming?.id !== s.id) {
        return;
      }
      const title = renaming.title.trim();
      if (title && title !== s.title) {
        onRename(s.id, title);
      }
      setRenaming(null);
    };

    const startRename = () => {
      // Let the closing menu restore focus before mounting the auto-focus field.
      setTimeout(() => setRenaming({ id: s.id, title: s.title }), 0);
    };

    const currentSectionId = assignedSection(s);
    const currentProjectPath =
      currentSectionId === null ? projectPathForSession(s) : null;
    const currentTaskIds = currentProjectPath
      ? taskIdsForProject(currentProjectPath)
      : taskIdsForSection(currentSectionId);
    const currentTaskOrderKey = currentProjectPath
      ? projectTaskOrderKey(currentProjectPath)
      : (currentSectionId ?? unsectionedTaskOrderKey);
    const currentTaskIndex = currentTaskIds.indexOf(s.id);
    const canMoveUp = !isArchived && currentTaskIndex > 0;
    const canMoveDown =
      !isArchived &&
      currentTaskIndex >= 0 &&
      currentTaskIndex < currentTaskIds.length - 1;
    const assignSection = (sectionId: string | null) => {
      setTaskSections((current) => assignTaskSection(current, s.id, sectionId));
    };
    const startSectionCreationForTask = () => {
      // Native and rendered menus both restore focus before the inline Section field mounts.
      setTimeout(() => beginSectionCreation(s.id), 0);
    };

    const runContextMenuAction = (action: string) => {
      if (action === "section:none") {
        assignSection(null);
        return;
      }
      if (action === "section:new") {
        startSectionCreationForTask();
        return;
      }
      if (action.startsWith("section:")) {
        assignSection(action.slice("section:".length));
        return;
      }
      switch (action) {
        case "pin": {
          onPin(s.id, !s.pinned);
          break;
        }
        case "rename": {
          startRename();
          break;
        }
        case "move-up": {
          moveTaskBy(s, -1);
          break;
        }
        case "move-down": {
          moveTaskBy(s, 1);
          break;
        }
        case "archive": {
          requestArchive(s.id, !isArchived);
          break;
        }
        case "reveal-working-directory": {
          void revealWorkingDirectory(s.worktree_path ?? s.cwd);
          break;
        }
        case "copy-working-directory": {
          void copyToClipboard(
            s.worktree_path ?? s.cwd,
            t("rail.workingDirectoryCopied")
          );
          break;
        }
        case "copy-session-id": {
          void copyToClipboard(s.id, t("rail.sessionIdCopied"));
          break;
        }
        case "discard-worktree": {
          onDiscardWorktree(s);
          break;
        }
      }
    };

    const nativeSectionMenu: NativeContextMenuItem = {
      action: "section-menu",
      label: t("rail.section"),
      submenu: [
        {
          action: "section:none",
          checked: currentSectionId === null,
          label: t("rail.noSection"),
          type: "item",
        },
        ...taskSections.sections.map((section) => ({
          action: `section:${section.id}`,
          checked: currentSectionId === section.id,
          label: section.name,
          type: "item" as const,
        })),
        { type: "separator" },
        {
          action: "section:new",
          label: t("rail.newSection"),
          type: "item",
        },
      ],
      type: "item",
    };

    const nativeMenuItems: NativeContextMenuItem[] = [
      ...(!isArchived
        ? [
            {
              action: "pin",
              label: s.pinned ? t("rail.unpin") : t("rail.pin"),
              type: "item",
            } as const,
          ]
        : []),
      { action: "rename", label: t("rail.rename"), type: "item" },
      ...(!isArchived
        ? [
            {
              action: "move-up",
              enabled: canMoveUp,
              label: t("rail.moveUp"),
              type: "item",
            } as const,
            {
              action: "move-down",
              enabled: canMoveDown,
              label: t("rail.moveDown"),
              type: "item",
            } as const,
          ]
        : []),
      ...(!isArchived ? [nativeSectionMenu] : []),
      {
        action: "archive",
        label: isArchived ? t("rail.unarchive") : t("rail.archive"),
        type: "item",
      },
      { type: "separator" },
      {
        action: "reveal-working-directory",
        label: t("rail.revealWorkingDirectory"),
        type: "item",
      },
      {
        action: "copy-working-directory",
        label: t("rail.copyWorkingDirectory"),
        type: "item",
      },
      {
        action: "copy-session-id",
        label: t("rail.copySessionId"),
        type: "item",
      },
      ...(s.worktree_path !== null && !s.worktree_discarded
        ? [
            { type: "separator" } as const,
            {
              action: "discard-worktree",
              label: t("worktree.discardAction"),
              type: "item",
            } as const,
          ]
        : []),
    ];

    const onRowKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.target !== event.currentTarget) {
        return;
      }

      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onSelect(s.id);
        return;
      }

      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        const rows = Array.from(
          event.currentTarget
            .closest("[data-session-list]")
            ?.querySelectorAll<HTMLButtonElement>("[data-session-select]") ?? []
        );
        const current = rows.indexOf(event.currentTarget);
        const delta = event.key === "ArrowDown" ? 1 : -1;
        const next =
          rows[Math.min(rows.length - 1, Math.max(0, current + delta))];
        if (next && next !== event.currentTarget) {
          event.preventDefault();
          next.focus();
        }
        return;
      }

      if (
        (event.key === "F10" && event.shiftKey) ||
        event.key === "ContextMenu"
      ) {
        event.preventDefault();
        const rect = event.currentTarget.getBoundingClientRect();
        event.currentTarget.dispatchEvent(
          new MouseEvent("contextmenu", {
            bubbles: true,
            button: 2,
            cancelable: true,
            clientX: rect.left + Math.min(24, rect.width / 2),
            clientY: rect.top + Math.min(24, rect.height / 2),
          })
        );
      }
    };

    return (
      <SessionContextMenu
        key={s.id}
        items={nativeMenuItems}
        onAction={runContextMenuAction}
      >
        <ContextMenuTrigger
          render={
            <div
              data-session-id={s.id}
              data-sidebar-dragging={
                dragItem?.kind === "task" && dragItem.id === s.id
                  ? "true"
                  : undefined
              }
              data-session-density="compact"
              draggable={!isArchived && renaming?.id !== s.id}
              onDragStart={(event) => {
                if (
                  event.target instanceof Element &&
                  event.target.closest("input, [data-session-actions] button")
                ) {
                  event.preventDefault();
                  return;
                }
                const item = { id: s.id, kind: "task" } as const;
                writeSidebarDrag(event, item);
                setDragItem(item);
              }}
              onDragEnd={() => setDragItem(null)}
              onDragOver={(event) => {
                if (readSidebarDrag(event)?.kind !== "task" || isArchived) {
                  return;
                }
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              }}
              onDrop={(event) => {
                const item = readSidebarDrag(event);
                if (item?.kind !== "task" || isArchived) {
                  return;
                }
                event.preventDefault();
                event.stopPropagation();
                dropTask(
                  item.id,
                  currentSectionId,
                  s.id,
                  currentTaskIds,
                  currentTaskOrderKey,
                  currentProjectPath
                );
              }}
              data-session-archive-motion={
                archiveMotion.has(s.id)
                  ? isArchived
                    ? "restore"
                    : "archive"
                  : undefined
              }
              aria-busy={archiveMotion.has(s.id) || undefined}
              title={hasUsefulPreview ? preview : undefined}
              onAnimationEnd={(event) => {
                if (event.target === event.currentTarget) {
                  finishArchiveMotion(s.id);
                }
              }}
              onContextMenu={(event) =>
                event.currentTarget
                  .querySelector<HTMLButtonElement>("[data-session-select]")
                  ?.focus({ preventScroll: true })
              }
              className={cn(
                "session-rail-row group rounded-control hover:bg-fill-quiet focus-within:bg-fill-quiet data-[popup-open]:bg-fill-hover relative cursor-default px-2 py-1.5 transition-[box-shadow,opacity] outline-none data-[sidebar-dragging=true]:opacity-45",
                s.id === activeSession && "bg-fill-hover"
              )}
            >
              <Button
                type="button"
                variant="ghost"
                data-session-select
                draggable={!isArchived && renaming?.id !== s.id}
                aria-current={s.id === activeSession ? "page" : undefined}
                aria-describedby={
                  hasUsefulPreview ? `session-preview-${s.id}` : undefined
                }
                aria-label={t("rail.sessionAccessibility", {
                  provider: displayProvider(s.provider),
                  status: statusLabel,
                  title: s.title,
                })}
                onClick={() => onSelect(s.id)}
                onKeyDown={onRowKeyDown}
                className="rounded-control absolute inset-0 z-0 h-auto p-0 hover:bg-transparent"
              />
              <div className="pointer-events-none relative z-10">
                {/* Title owns the row. Routine controls appear on demand. */}
                <div
                  data-session-line="title"
                  className="h-control-mini flex items-center gap-1.5"
                >
                  {renaming?.id === s.id ? (
                    <Input
                      autoFocus
                      size="compact"
                      className="text-body pointer-events-auto relative z-10 h-(--ds-control-mini) flex-1"
                      value={renaming.title}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) =>
                        setRenaming({ id: s.id, title: e.target.value })
                      }
                      onFocus={(e) => e.currentTarget.select()}
                      onBlur={commitRename}
                      onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === "Enter") {
                          e.preventDefault();
                          commitRename();
                        } else if (e.key === "Escape") {
                          e.preventDefault();
                          setRenaming(null);
                        }
                      }}
                    />
                  ) : (
                    <span
                      title={s.title}
                      className={cn(
                        "text-body min-w-0 flex-1 truncate",
                        s.id === activeSession && "font-medium"
                      )}
                    >
                      {s.title}
                    </span>
                  )}
                  {isAwaitingInput || isFailed || isRunning ? (
                    <span
                      data-session-status
                      aria-label={statusLabel}
                      title={isFailed ? activity.message : statusLabel}
                      className={cn(
                        "text-muted-foreground flex size-5 shrink-0 items-center justify-center group-focus-within:hidden group-hover:hidden group-data-[popup-open]:hidden",
                        isAwaitingInput && "text-warning",
                        isFailed && "text-destructive",
                        isRunning && !isAwaitingInput && "text-primary"
                      )}
                    >
                      {isAwaitingInput ? (
                        <span className="bg-warning size-1.5 animate-pulse rounded-full" />
                      ) : isFailed ? (
                        <CircleAlert className="size-3" />
                      ) : (
                        <ActivityOrb
                          state="working"
                          visualSize={14}
                          aria-hidden="true"
                        />
                      )}
                    </span>
                  ) : null}
                  <span
                    data-session-actions
                    className="hidden shrink-0 gap-0.5 group-focus-within:flex group-hover:flex group-data-[popup-open]:flex"
                  >
                    {!isArchived && (
                      <span
                        data-session-drag-handle
                        draggable
                        title={t("rail.dragTask")}
                        className="text-muted-foreground pointer-events-auto flex size-5 cursor-grab items-center justify-center active:cursor-grabbing"
                        aria-hidden="true"
                      >
                        <GripVertical className="pointer-events-none size-3" />
                      </span>
                    )}
                    {!isArchived && (
                      <TooltipButton
                        label={s.pinned ? t("rail.unpin") : t("rail.pin")}
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-pressed={s.pinned}
                        className={cn(
                          "text-muted-foreground hover:text-foreground pointer-events-auto relative z-10",
                          s.pinned && "text-primary"
                        )}
                        onClick={(e) => {
                          e.stopPropagation();
                          onPin(s.id, !s.pinned);
                        }}
                      >
                        <Pin data-icon="inline-start" />
                      </TooltipButton>
                    )}
                    <TooltipButton
                      label={t("rail.rename")}
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      className="text-muted-foreground hover:text-foreground pointer-events-auto relative z-10"
                      onClick={(e) => {
                        e.stopPropagation();
                        setRenaming({ id: s.id, title: s.title });
                      }}
                    >
                      <Pencil data-icon="inline-start" />
                    </TooltipButton>
                    <TooltipButton
                      label={
                        isArchived ? t("rail.unarchive") : t("rail.archive")
                      }
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      className="text-muted-foreground hover:text-foreground pointer-events-auto relative z-10"
                      onClick={(e) => {
                        e.stopPropagation();
                        requestArchive(s.id, !isArchived);
                      }}
                    >
                      {isArchived ? (
                        <ArchiveRestore data-icon="inline-start" />
                      ) : (
                        <Archive data-icon="inline-start" />
                      )}
                    </TooltipButton>
                  </span>
                </div>

                {hasUsefulPreview ? (
                  <div
                    id={`session-preview-${s.id}`}
                    data-session-line="preview"
                    className="text-callout text-muted-foreground mt-0.5 h-4 truncate"
                  >
                    {preview}
                  </div>
                ) : null}

                {/* Workspace identity closes the hierarchy; provider and completed state stay quiet. */}
                <div
                  data-session-line="workspace"
                  className="text-callout text-muted-foreground mt-0.5 flex h-4 items-center gap-1.5"
                >
                  {isShowProjectIdentity ? (
                    <>
                      <Folder
                        className="size-3 shrink-0 opacity-70"
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1 truncate">
                        {workspaceName}
                      </span>
                    </>
                  ) : (
                    <span className="min-w-0 flex-1" />
                  )}
                  <span
                    data-session-checkout-kind={
                      isWorktree ? "worktree" : "checkout"
                    }
                    title={t(
                      isWorktree
                        ? "rail.gitWorktreeHint"
                        : "rail.gitCheckoutHint"
                    )}
                    aria-label={t(
                      isWorktree
                        ? "rail.gitWorktreeHint"
                        : "rail.gitCheckoutHint"
                    )}
                    className="rounded-micro bg-fill-quiet text-fine text-foreground/55 flex shrink-0 items-center gap-0.5 px-1 leading-4"
                  >
                    <GitBranch className="size-2.5" aria-hidden="true" />
                    {t(isWorktree ? "rail.gitWorktree" : "rail.gitCheckout")}
                  </span>
                  {pullRequest && pullRequestLabel ? (
                    <span
                      data-session-pull-request={pullRequest.state}
                      title={`#${pullRequest.number} · ${pullRequestLabel}`}
                      aria-label={`#${pullRequest.number} · ${pullRequestLabel}`}
                      className={cn(
                        "rounded-micro bg-fill-quiet text-fine flex shrink-0 items-center gap-0.5 px-1 leading-4",
                        pullRequestTone
                      )}
                    >
                      {pullRequest.state === "merged" ? (
                        <GitMerge className="size-2.5" aria-hidden="true" />
                      ) : pullRequest.state === "ci_running" ? (
                        <ActivityOrb
                          state="working"
                          visualSize={14}
                          aria-hidden="true"
                        />
                      ) : (
                        <GitPullRequest
                          className="size-2.5"
                          aria-hidden="true"
                        />
                      )}
                      #{pullRequest.number} {pullRequestLabel}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          }
        />
        <ContextMenuContent className="min-w-56">
          <ContextMenuGroup>
            {!isArchived ? (
              <ContextMenuItem onClick={() => onPin(s.id, !s.pinned)}>
                <Pin />
                {s.pinned ? t("rail.unpin") : t("rail.pin")}
              </ContextMenuItem>
            ) : null}
            <ContextMenuItem onClick={startRename}>
              <Pencil />
              {t("rail.rename")}
            </ContextMenuItem>
            {!isArchived ? (
              <>
                <ContextMenuItem
                  disabled={!canMoveUp}
                  onClick={() => moveTaskBy(s, -1)}
                >
                  <ArrowUp />
                  {t("rail.moveUp")}
                </ContextMenuItem>
                <ContextMenuItem
                  disabled={!canMoveDown}
                  onClick={() => moveTaskBy(s, 1)}
                >
                  <ArrowDown />
                  {t("rail.moveDown")}
                </ContextMenuItem>
              </>
            ) : null}
            {!isArchived ? (
              <ContextMenuSub>
                <ContextMenuSubTrigger>
                  <Hash />
                  {t("rail.section")}
                </ContextMenuSubTrigger>
                <ContextMenuSubContent>
                  <ContextMenuItem onClick={() => assignSection(null)}>
                    <Check
                      className={cn(currentSectionId !== null && "opacity-0")}
                    />
                    {t("rail.noSection")}
                  </ContextMenuItem>
                  {taskSections.sections.map((section) => (
                    <ContextMenuItem
                      key={section.id}
                      onClick={() => assignSection(section.id)}
                    >
                      <Check
                        className={cn(
                          currentSectionId !== section.id && "opacity-0"
                        )}
                      />
                      {section.name}
                    </ContextMenuItem>
                  ))}
                  <ContextMenuSeparator />
                  <ContextMenuItem onClick={startSectionCreationForTask}>
                    <Plus />
                    {t("rail.newSection")}
                  </ContextMenuItem>
                </ContextMenuSubContent>
              </ContextMenuSub>
            ) : null}
            <ContextMenuItem onClick={() => requestArchive(s.id, !isArchived)}>
              {isArchived ? <ArchiveRestore /> : <Archive />}
              {isArchived ? t("rail.unarchive") : t("rail.archive")}
            </ContextMenuItem>
          </ContextMenuGroup>
          <ContextMenuSeparator />
          <ContextMenuGroup>
            <ContextMenuItem
              onClick={() =>
                void revealWorkingDirectory(s.worktree_path ?? s.cwd)
              }
            >
              <FolderOpen />
              {t("rail.revealWorkingDirectory")}
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() =>
                void copyToClipboard(
                  s.worktree_path ?? s.cwd,
                  t("rail.workingDirectoryCopied")
                )
              }
            >
              <Copy />
              {t("rail.copyWorkingDirectory")}
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() =>
                void copyToClipboard(s.id, t("rail.sessionIdCopied"))
              }
            >
              <Hash />
              {t("rail.copySessionId")}
            </ContextMenuItem>
          </ContextMenuGroup>
          {/* Discarding deletes uncommitted work, so it sits apart from the reversible actions
              and only appears while there is still a checkout to remove. */}
          {s.worktree_path !== null && !s.worktree_discarded ? (
            <>
              <ContextMenuSeparator />
              <ContextMenuGroup>
                <ContextMenuItem
                  variant="destructive"
                  onClick={() => onDiscardWorktree(s)}
                >
                  <FolderX />
                  {t("worktree.discardAction")}
                </ContextMenuItem>
              </ContextMenuGroup>
            </>
          ) : null}
        </ContextMenuContent>
      </SessionContextMenu>
    );
  };

  const renderProject = (project: Project) => {
    const rows = projectRows.get(project.path) ?? [];
    const sectionId = assignedProjectSection(project.path);
    const paths = projectPathsForSection(sectionId);
    const projectIndex = paths.indexOf(project.path);
    const canMoveUp = projectIndex > 0;
    const canMoveDown = projectIndex >= 0 && projectIndex < paths.length - 1;
    const isOpen = projectOrganization.collapsed[project.path] !== true;
    const taskIds = rows.map((row) => row.id);
    const moveToSection = (nextSectionId: string | null) =>
      dropProject(project.path, nextSectionId, null);

    return (
      <Collapsible
        key={project.path}
        open={isOpen}
        onOpenChange={(nextOpen) =>
          setProjectOrganization((current) =>
            setSidebarProjectCollapsed(current, project.path, !nextOpen)
          )
        }
        data-project-group={project.path}
      >
        <div
          data-project-header={project.path}
          data-sidebar-dragging={
            dragItem?.kind === "project" && dragItem.id === project.path
              ? "true"
              : undefined
          }
          draggable
          onDragStart={(event) => {
            if (
              event.target instanceof Element &&
              event.target.closest("[data-project-actions]")
            ) {
              event.preventDefault();
              return;
            }
            const item = { id: project.path, kind: "project" } as const;
            writeSidebarDrag(event, item);
            setDragItem(item);
          }}
          onDragEnd={() => setDragItem(null)}
          onDragOver={(event) => {
            const item = readSidebarDrag(event);
            if (!item || item.kind === "section") {
              return;
            }
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
          }}
          onDrop={(event) => {
            const item = readSidebarDrag(event);
            if (!item || item.kind === "section") {
              return;
            }
            event.preventDefault();
            event.stopPropagation();
            if (item.kind === "project") {
              dropProject(item.id, sectionId, project.path);
            } else {
              dropTask(
                item.id,
                null,
                null,
                taskIds,
                projectTaskOrderKey(project.path),
                project.path
              );
            }
          }}
          className="group/project min-h-control rounded-control hover:bg-fill-quiet relative flex items-center pr-1 transition-[background-color,opacity] data-[sidebar-dragging=true]:opacity-45"
        >
          <span
            data-project-drag-handle={project.path}
            title={t("rail.dragProject")}
            draggable
            className="text-foreground/35 absolute left-0 flex size-4 cursor-grab items-center justify-center opacity-0 group-hover/project:opacity-100 active:cursor-grabbing"
            aria-hidden="true"
          >
            <GripVertical className="pointer-events-none size-3" />
          </span>
          <CollapsibleTrigger
            data-project-toggle={project.path}
            draggable
            title={t(isOpen ? "rail.hideProject" : "rail.showProject", {
              name: project.name,
            })}
            className="rounded-control text-ui focus-visible:focus-ring-inset flex min-w-0 flex-1 items-center gap-2 px-2 leading-4 outline-none"
          >
            <Folder className="size-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-left">
              {project.name}
            </span>
            <ChevronRight
              className={cn(
                "text-muted-foreground size-3.5 shrink-0 transition-transform",
                isOpen && "rotate-90"
              )}
              aria-hidden="true"
            />
          </CollapsibleTrigger>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  data-project-actions={project.path}
                  aria-label={t("rail.projectActions", { name: project.name })}
                  className="opacity-0 group-hover/project:opacity-100 focus-visible:opacity-100 data-[popup-open]:opacity-100"
                >
                  <MoreHorizontal />
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                disabled={!canMoveUp}
                onClick={() => moveProjectBy(project.path, -1)}
              >
                <ArrowUp />
                {t("rail.moveUp")}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!canMoveDown}
                onClick={() => moveProjectBy(project.path, 1)}
              >
                <ArrowDown />
                {t("rail.moveDown")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => moveToSection(null)}>
                <Check className={cn(sectionId !== null && "opacity-0")} />
                {t("rail.noSection")}
              </DropdownMenuItem>
              {taskSections.sections.map((section) => (
                <DropdownMenuItem
                  key={section.id}
                  onClick={() => moveToSection(section.id)}
                >
                  <Check
                    className={cn(sectionId !== section.id && "opacity-0")}
                  />
                  {section.name}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() =>
                  setTimeout(() => beginProjectSectionCreation(project.path), 0)
                }
              >
                <Plus />
                {t("rail.newSection")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <CollapsibleContent
          data-project-content={project.path}
          className="ml-6"
          onDragOver={(event) => {
            if (readSidebarDrag(event)?.kind !== "task") {
              return;
            }
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
          }}
          onDrop={(event) => {
            const item = readSidebarDrag(event);
            if (item?.kind !== "task") {
              return;
            }
            event.preventDefault();
            event.stopPropagation();
            dropTask(
              item.id,
              null,
              null,
              taskIds,
              projectTaskOrderKey(project.path),
              project.path
            );
          }}
        >
          {rows.length > 0 ? (
            <div className="flex flex-col gap-0.5">
              {rows.map((row) => sessionRow(row, false, false))}
            </div>
          ) : (
            <p className="text-fine text-foreground/35 px-2 py-1.5">
              {t("rail.projectEmpty")}
            </p>
          )}
        </CollapsibleContent>
      </Collapsible>
    );
  };

  const renderManualSection = (section: SidebarTaskSection) => {
    const isOpen = !section.collapsed;
    const rows = sectionRows.get(section.id) ?? [];
    const sectionProjectRows = sectionProjects.get(section.id) ?? [];
    const sectionIndex = taskSections.sections.findIndex(
      (candidate) => candidate.id === section.id
    );
    const canMoveUp = sectionIndex > 0;
    const canMoveDown =
      sectionIndex >= 0 && sectionIndex < taskSections.sections.length - 1;
    const archiveSection = async () => {
      const tasks = [
        ...rows,
        ...sectionProjectRows.flatMap(
          (project) => projectRows.get(project.path) ?? []
        ),
      ];
      await Promise.all(
        tasks.map((row) => Promise.resolve(onArchive(row.id, true)))
      );
    };
    return (
      <Collapsible
        key={section.id}
        open={isOpen}
        onOpenChange={(nextOpen) =>
          setTaskSections((current) =>
            setSidebarTaskSectionCollapsed(current, section.id, !nextOpen)
          )
        }
      >
        <div
          data-task-section-header={section.id}
          data-sidebar-dragging={
            dragItem?.kind === "section" && dragItem.id === section.id
              ? "true"
              : undefined
          }
          draggable={renamingSection?.id !== section.id}
          onDragStart={(event) => {
            if (
              event.target instanceof Element &&
              event.target.closest("input, [data-task-section-actions]")
            ) {
              event.preventDefault();
              return;
            }
            const item = { id: section.id, kind: "section" } as const;
            writeSidebarDrag(event, item);
            setDragItem(item);
          }}
          onDragEnd={() => setDragItem(null)}
          onDragOver={(event) => {
            const item = readSidebarDrag(event);
            if (!item) {
              return;
            }
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
          }}
          onDrop={(event) => {
            const item = readSidebarDrag(event);
            if (!item) {
              return;
            }
            event.preventDefault();
            event.stopPropagation();
            if (item.kind === "section") {
              setTaskSections((current) =>
                moveSidebarTaskSection(current, item.id, section.id)
              );
              setDragItem(null);
            } else if (item.kind === "project") {
              dropProject(item.id, section.id, null);
            } else {
              dropTask(
                item.id,
                section.id,
                null,
                rows.map((row) => row.id),
                section.id
              );
            }
          }}
          className="group/section min-h-control-mini relative flex items-center pt-2 pr-2 pb-1 transition-opacity data-[sidebar-dragging=true]:opacity-45"
        >
          {renamingSection?.id === section.id ? (
            <Input
              autoFocus
              size="compact"
              aria-label={t("rail.sectionName")}
              className="h-control-mini text-body min-w-0 flex-1"
              value={renamingSection.name}
              onChange={(event) =>
                setRenamingSection({ id: section.id, name: event.target.value })
              }
              onFocus={(event) => event.currentTarget.select()}
              onBlur={commitSectionRename}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitSectionRename();
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  setRenamingSection(null);
                }
              }}
            />
          ) : (
            <>
              <span
                data-section-drag-handle={section.id}
                draggable
                title={t("rail.dragSection")}
                className="text-foreground/35 absolute left-0 flex size-4 cursor-grab items-center justify-center opacity-0 group-hover/section:opacity-100 active:cursor-grabbing"
                aria-hidden="true"
              >
                <GripVertical className="pointer-events-none size-3" />
              </span>
              <CollapsibleTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="compact"
                    focusStyle="inset"
                  />
                }
                data-task-section-toggle={section.id}
                draggable
                title={t(isOpen ? "rail.hideSection" : "rail.showSection", {
                  name: section.name,
                })}
                className="text-foreground/55 hover:text-foreground min-w-0 justify-start gap-1 font-normal"
              >
                <span className="truncate">{section.name}</span>
                <ChevronRight
                  className={cn(
                    "size-3.5 shrink-0 transition-transform",
                    isOpen && "rotate-90"
                  )}
                  aria-hidden="true"
                />
              </CollapsibleTrigger>
            </>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  data-task-section-actions={section.id}
                  aria-label={t("rail.sectionActions", { name: section.name })}
                  className="ml-auto opacity-0 group-hover/section:opacity-100 focus-visible:opacity-100 data-[popup-open]:opacity-100"
                >
                  <MoreHorizontal />
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() =>
                  setTimeout(
                    () =>
                      setRenamingSection({
                        id: section.id,
                        name: section.name,
                      }),
                    0
                  )
                }
              >
                <Pencil />
                {t("rail.editSection")}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!canMoveUp}
                onClick={() => moveSectionBy(section, -1)}
              >
                <ArrowUp />
                {t("rail.moveUp")}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!canMoveDown}
                onClick={() => moveSectionBy(section, 1)}
              >
                <ArrowDown />
                {t("rail.moveDown")}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={
                  rows.length === 0 &&
                  sectionProjectRows.every(
                    (project) =>
                      (projectRows.get(project.path) ?? []).length === 0
                  )
                }
                onClick={() => void archiveSection()}
              >
                <Archive />
                {t("rail.archiveSection")}
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onClick={() => {
                  setTaskSections((current) =>
                    deleteSidebarTaskSection(current, section.id)
                  );
                  setProjectOrganization((current) =>
                    releaseSidebarSectionProjects(current, section.id)
                  );
                }}
              >
                <Trash2 />
                {t("rail.deleteSection")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <CollapsibleContent
          data-task-section-content={section.id}
          onDragOver={(event) => {
            const item = readSidebarDrag(event);
            if (!item || item.kind === "section") {
              return;
            }
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
          }}
          onDrop={(event) => {
            const item = readSidebarDrag(event);
            if (!item || item.kind === "section") {
              return;
            }
            event.preventDefault();
            if (item.kind === "project") {
              dropProject(item.id, section.id, null);
            } else {
              dropTask(
                item.id,
                section.id,
                null,
                rows.map((row) => row.id),
                section.id
              );
            }
          }}
        >
          {sectionProjectRows.length > 0 || rows.length > 0 ? (
            <div className="flex flex-col gap-0.5">
              {sectionProjectRows.map(renderProject)}
              {rows.map((row) => sessionRow(row, false))}
            </div>
          ) : (
            <p className="text-callout text-foreground/35 px-2 py-1.5">
              {t("rail.sectionEmpty")}
            </p>
          )}
        </CollapsibleContent>
      </Collapsible>
    );
  };

  return (
    <aside
      aria-hidden={collapsed}
      data-collapsed={collapsed ? "" : undefined}
      data-dragging={dragging ? "" : undefined}
      className={cn(
        "session-rail glass-rail relative flex shrink-0 flex-col overflow-hidden",
        overlay && "fixed inset-y-0 left-0 z-50 shadow-2xl",
        gone && "invisible"
      )}
      style={{ width: collapsed ? 0 : applied }}
    >
      {/* Pinned to the open width so the content doesn't reflow while the pane sweeps. */}
      <div
        className="session-rail-content flex min-h-0 flex-1 flex-col"
        style={{ width: applied }}
      >
        {!collapsed && (
          <div
            className="rail-grip"
            aria-label={t("rail.resize")}
            title={t("rail.resize")}
            {...resizeHandle}
          />
        )}

        {/* ---- 1 · title ---------------------------------------------------------------------- */}
        {/* Keep the collapse control in the title row, with enough clearance for macOS traffic
          lights. Search gets a full-width launcher below; all panes share the same 46px baseline. */}
        <div
          data-rail-header
          className="window-titlebar window-controls-safe-rail electrobun-webkit-app-region-drag flex shrink-0 items-center gap-1 pr-2"
        >
          <div className="electrobun-webkit-app-region-drag min-w-0 flex-1" />
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground size-7 shrink-0"
                  aria-label={t("rail.collapse")}
                  onClick={onToggleCollapse}
                  disabled={taskBoardOpen ? !overlay : undefined}
                >
                  <PanelLeft className="size-4" />
                </Button>
              }
            />
            <TooltipContent side="right">{t("rail.collapse")}</TooltipContent>
          </Tooltip>
        </div>

        <Button
          type="button"
          variant="selectable"
          size="row"
          focusStyle="inset"
          data-rail-search
          className="h-control bg-fill-quiet text-muted-foreground mx-2 mb-1 shrink-0 gap-2 px-2"
          aria-label={t("rail.searchChats")}
          onClick={onOpenSearch}
        >
          <Search className="size-3.5 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1 truncate">
            {t("rail.searchChats")}
          </span>
          {searchHint ? (
            <kbd className="rounded-micro bg-background/45 text-callout text-muted-foreground shrink-0 px-1.5 py-0.5 font-mono">
              {searchHint}
            </kbd>
          ) : null}
        </Button>

        {/* ---- 2 · features ------------------------------------------------------------------- */}
        <div
          data-rail-features
          role="navigation"
          aria-label={t("rail.features")}
          className="flex flex-col gap-0.5 px-2 pb-1"
        >
          <div
            data-rail-feature="new-task"
            role="group"
            aria-label={t("rail.newTask")}
            className="group/new-task h-control rounded-control text-foreground/75 hover:bg-fill-hover hover:text-foreground focus-within:bg-fill-hover focus-within:text-foreground flex min-w-0 items-center transition-colors"
          >
            <Button
              type="button"
              variant="ghost"
              size="row"
              focusStyle="inset"
              className="h-full min-w-0 flex-1 gap-2 pr-1 pl-2"
              title={`${t("rail.newTask")} ${newHint}`}
              onClick={onNew}
            >
              <SquarePen
                className="text-muted-foreground size-4 shrink-0"
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate">
                {t("rail.newTask")}
              </span>
            </Button>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    data-rail-quick-chat
                    className={cn(
                      "size-control-mini rounded-control text-muted-foreground hover:bg-fill-hover hover:text-foreground group-hover/new-task:text-foreground mr-1",
                      quickChatOpen && "bg-fill-hover text-foreground"
                    )}
                    aria-label={t("quickChat.toggle")}
                    aria-pressed={quickChatOpen}
                    onClick={onToggleQuickChat}
                  >
                    <MessageSquarePlus className="size-4" aria-hidden />
                  </Button>
                }
              />
              <TooltipContent side="right">
                {t("quickChat.title")}
              </TooltipContent>
            </Tooltip>
          </div>
          <div data-rail-feature="pull-requests">
            <NavigationRow
              label={t("pullRequests.title")}
              leading={<GitPullRequest className="size-4" />}
              current={pullRequestsOpen}
              onSelect={onOpenPullRequests}
            />
          </div>
          <div data-rail-feature="task-board">
            <NavigationRow
              label={t("taskboard.title")}
              leading={<SquareKanban className="size-4" />}
              current={taskBoardOpen}
              onSelect={onOpenTaskBoard}
            />
          </div>
          <div data-rail-feature="scheduled-tasks">
            <NavigationRow
              label={t("automations.tasks")}
              leading={<CalendarClock className="size-4" />}
              current={automationsOpen}
              onSelect={onOpenAutomations}
            />
          </div>
          <div data-rail-feature="plugins">
            <NavigationRow
              label={t("pluginHub.plugins")}
              leading={<Blocks className="size-4" />}
              current={pluginManagerOpen}
              onSelect={onOpenMarket}
            />
          </div>
          {dockerAvailable ? (
            <div data-rail-feature="docker">
              <NavigationRow
                label={t("docker.title")}
                leading={<Container className="size-4" />}
                current={dockerOpen}
                onSelect={onOpenDocker}
              />
            </div>
          ) : null}
          {pluginActions}
        </div>

        {/* ---- 3 · Tasks ---------------------------------------------------------------------- */}
        <ScrollArea data-rail-session-scroll className="min-h-0 flex-1">
          <div
            data-session-list
            data-session-selection="instant"
            className="px-2 pb-4"
          >
            {resourceSections}
            {recent.length === 0 &&
            archived.length === 0 &&
            projectEntries.length === 0 &&
            taskSections.sections.length === 0 &&
            creatingSectionFor === undefined ? (
              <p className="text-callout text-muted-foreground px-2 py-3">
                {t("rail.empty")} {t("rail.emptyHint")}
              </p>
            ) : (
              <>
                <div
                  data-task-section-list
                  onDragOver={(event) => {
                    if (readSidebarDrag(event)?.kind !== "section") {
                      return;
                    }
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={(event) => {
                    const item = readSidebarDrag(event);
                    if (item?.kind !== "section") {
                      return;
                    }
                    event.preventDefault();
                    setTaskSections((current) =>
                      moveSidebarTaskSection(current, item.id, null)
                    );
                    setDragItem(null);
                  }}
                >
                  {taskSections.sections.map(renderManualSection)}
                </div>
                {rootProjects.length > 0 || dragItem?.kind === "project" ? (
                  <div
                    data-project-list="root"
                    className={cn(rootProjects.length === 0 && "min-h-control")}
                    onDragOver={(event) => {
                      if (readSidebarDrag(event)?.kind !== "project") {
                        return;
                      }
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                    }}
                    onDrop={(event) => {
                      const item = readSidebarDrag(event);
                      if (item?.kind !== "project") {
                        return;
                      }
                      event.preventDefault();
                      dropProject(item.id, null, null);
                    }}
                  >
                    {rootProjects.map(renderProject)}
                  </div>
                ) : null}
                {creatingSectionFor !== undefined ? (
                  <div data-task-section-creation className="px-2 pt-2 pb-1">
                    <Input
                      autoFocus
                      size="compact"
                      aria-label={t("rail.sectionName")}
                      placeholder={t("rail.sectionName")}
                      className="h-control-mini text-body"
                      value={sectionDraft}
                      onChange={(event) => setSectionDraft(event.target.value)}
                      onBlur={commitSectionCreation}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          commitSectionCreation();
                        } else if (event.key === "Escape") {
                          event.preventDefault();
                          setCreatingSectionFor(undefined);
                          setSectionDraft("");
                        }
                      }}
                    />
                  </div>
                ) : null}
                {unsectioned.length > 0 || dragItem?.kind === "task" ? (
                  <div
                    data-unsectioned-tasks
                    className={cn(
                      "flex flex-col gap-0.5 pt-1",
                      unsectioned.length === 0 && "min-h-control-mini"
                    )}
                    onDragOver={(event) => {
                      if (readSidebarDrag(event)?.kind !== "task") {
                        return;
                      }
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                    }}
                    onDrop={(event) => {
                      const item = readSidebarDrag(event);
                      if (item?.kind !== "task") {
                        return;
                      }
                      event.preventDefault();
                      dropTask(
                        item.id,
                        null,
                        null,
                        unsectioned.map((session) => session.id),
                        unsectionedTaskOrderKey
                      );
                    }}
                  >
                    {unsectioned.map((session) => sessionRow(session, false))}
                  </div>
                ) : null}
                {archived.length > 0 && (
                  <Collapsible
                    open={archivedOpen}
                    onOpenChange={setArchivedOpen}
                  >
                    <CollapsibleTrigger
                      render={
                        <Button
                          type="button"
                          variant="ghost"
                          size="compact"
                          focusStyle="inset"
                        />
                      }
                      data-rail-archive-toggle
                      title={
                        archivedOpen
                          ? t("rail.hideArchived")
                          : t("rail.showArchived")
                      }
                      className="text-foreground/55 hover:text-foreground justify-start gap-1 font-normal"
                    >
                      <span>{t("rail.groupArchived")}</span>
                      <ChevronRight
                        className={cn(
                          "size-3.5 shrink-0 transition-transform",
                          archivedOpen && "rotate-90"
                        )}
                        aria-hidden="true"
                      />
                      <span className="text-foreground/40 font-normal">
                        {archived.length}
                      </span>
                    </CollapsibleTrigger>
                    <CollapsibleContent
                      data-rail-archive-list
                      className="rail-archive-panel"
                    >
                      <div className="flex flex-col gap-0.5">
                        {archived.map((session) => sessionRow(session, true))}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                )}
              </>
            )}
          </div>
        </ScrollArea>

        {/* ---- 4 · utilities ------------------------------------------------------------------ */}
        <div
          data-rail-utilities
          data-layout="icon-toolbar"
          className="min-h-control-field flex shrink-0 items-center gap-1 px-3 py-1.5"
        >
          <div data-rail-feature="settings">
            <RailUtilityButton
              label={t("header.settings")}
              onSelect={onOpenSettings}
            >
              <Settings className="size-4" aria-hidden="true" />
            </RailUtilityButton>
          </div>
          <div data-rail-feature="usage">
            <RailUtilityButton
              label={quickQuotaTitle}
              busy={quickQuotaLoading}
              onSelect={onOpenUsage}
            >
              {quickQuotaLoading ? (
                <ActivityOrb
                  state="searching"
                  visualSize={14}
                  aria-hidden="true"
                />
              ) : (
                <ChartNoAxesColumn
                  data-quota-provider={quickQuota?.provider}
                  className="size-4"
                  aria-hidden="true"
                />
              )}
            </RailUtilityButton>
          </div>
          {deviceConnectionsAvailable ? (
            <div data-rail-feature="device-connections" className="ml-auto">
              <RailUtilityButton
                label={t("rail.deviceConnections")}
                selected={deviceConnectionsOpen}
                onSelect={onOpenDeviceConnections}
              >
                <Smartphone
                  data-device-connections-icon="phone"
                  className="size-4"
                  aria-hidden="true"
                />
              </RailUtilityButton>
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  );
};
