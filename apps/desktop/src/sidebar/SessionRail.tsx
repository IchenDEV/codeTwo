import {
  Children,
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  DragDropRoot,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@/components/ui/drag-drop";
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

import {
  githubCurrentPullRequest,
  openNativePath,
  providerLabel,
  type GitHubPullRequest,
  type Project,
  type SessionInfo,
} from "../bridge";
import {
  nativeContextMenusAvailable,
  showNativeContextMenu,
  type NativeContextMenuItem,
} from "../container";
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
import { Tooltip, TooltipButton, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useResizeHandle } from "@/components/ui/use-resize-handle";
import { useT } from "../i18n";
import { usePersistedBoolean } from "@/lib/persist";
import { cn } from "@/lib/utils";
import { ProviderIcon } from "../providers/ProviderIcon";
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
  UNSECTIONED_TASK_ORDER_KEY,
  type SidebarTaskSection,
} from "./sidebarSections";
import {
  ROOT_PROJECT_ORDER_KEY,
  loadSidebarProjects,
  moveSidebarProject,
  releaseSidebarSectionProjects,
  saveSidebarProjects,
  setSidebarProjectCollapsed,
  sortSidebarProjects,
} from "./sidebarProjects";
import {
  loadSidebarPullRequests,
  type SidebarPullRequestStatus,
} from "./sidebarGitStatus";
import {
  SidebarDropZone,
  SidebarSortable,
  sidebarBeforeIdAtFinalIndex,
  sidebarDndData,
  sidebarFinalizedDestination,
  sidebarRememberedDragTarget,
  sidebarSortableSnapshot,
  sidebarTaskContainerCollisionPriority,
  type SidebarDndData,
  type SidebarDragItem,
} from "./sidebarDnd";

type ContextMenuTriggerElement = ReactElement<{
  render: ReactElement<HTMLAttributes<HTMLDivElement>>;
}>;

/** Compact relative age for a dense Task row. */
function shortAge(timestamp: number, now: number): string {
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (seconds < 60) return "now";
  if (seconds < 3_600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3_600)}h`;
  if (seconds < 7 * 86_400) return `${Math.floor(seconds / 86_400)}d`;
  return `${Math.floor(seconds / (7 * 86_400))}w`;
}

function RailUtilityButton({
  label,
  selected = false,
  busy = false,
  onSelect,
  children,
}: {
  label: string;
  selected?: boolean;
  busy?: boolean;
  onSelect: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={<Button
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
            "rounded-full text-muted-foreground hover:text-foreground",
            selected && "bg-primary/15 text-primary hover:bg-primary/20 hover:text-primary",
          )}
        >
          {children}
        </Button>}
      />
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}

function SessionContextMenu({
  items,
  onAction,
  children,
}: {
  items: NativeContextMenuItem[];
  onAction: (action: string) => void;
  children: ReactNode;
}) {
  if (!nativeContextMenusAvailable) return <ContextMenu>{children}</ContextMenu>;

  const trigger = Children.toArray(children)[0];
  if (!isValidElement(trigger)) return null;
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
}

/**
 * The rail, four zones top to bottom:
 *
 * 1. Title — sidebar controls on the traffic-light line, with search directly below it.
 * 2. Features — the app's primary destinations as compact, labeled source-list rows.
 * 3. Tasks — user-created Sections contain ordered Projects, which contain ordered Tasks.
 * 4. Utilities — quota and settings stay reachable at the bottom while recent chats scroll.
 * The active model remains available in the composer, where it can also be changed.
 */
export function SessionRail({
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
  projects: Project[];
  /** Every live Task session; the rail nests it under its Project unless explicitly Sectioned. */
  sessions: SessionInfo[];
  /** Every archived Task session, shown in one collapsible system Section. */
  archivedSessions: SessionInfo[];
  /** Newest text per session id — shown as a bounded conversation summary below the title. */
  previews: Record<string, string>;
  activeSession: string | null;
  /** Every session with a turn in flight, including background sessions. */
  runningSessions: ReadonlySet<string>;
  onSelect: (id: string) => void;
  /** Opens the default Task-owned draft. */
  onNew: () => void;
  /** App-lifetime quick chat that stays outside the tracked task list. */
  quickChatOpen: boolean;
  onToggleQuickChat: () => void;
  onRename: (id: string, title: string) => void;
  /** Keeps an active session above the recency list until explicitly unpinned. */
  onPin: (id: string, pinned: boolean) => void;
  /** Flips a session's archived state — true to archive, false to restore. */
  onArchive: (id: string, archived: boolean) => Promise<void> | void;
  /** Permanently removes a session's isolated checkout and branch, after confirmation. */
  onDiscardWorktree: (session: SessionInfo) => void;
  /** The provider a session runs on, as its display name — the row's agent line. */
  displayProvider: (p: SessionInfo["provider"]) => string;
  onOpenMarket: () => void;
  onOpenAutomations: () => void;
  /** The built-in remote component is live and can open its pairing surface. */
  deviceConnectionsAvailable: boolean;
  deviceConnectionsOpen: boolean;
  onOpenDeviceConnections: () => void;
  newHint: string;
  /** The palette's shortcut, shown in the search box. */
  searchHint: string;
  onOpenSearch: () => void;
  onOpenSettings: () => void;
  /** Collapsed: the rail animates to zero width; the main header grows an expand button. */
  collapsed: boolean;
  /** Narrow layouts take the rail out of the flex row and show it above the session column. */
  overlay: boolean;
  onToggleCollapse: () => void;
  /** Rail width in px — dragged by the right-edge grip, persisted by the caller. */
  width: number;
  onWidth: (n: number) => void;
  taskBoardOpen: boolean;
  onOpenTaskBoard: () => void;
  pullRequestsOpen: boolean;
  onOpenPullRequests: () => void;
  automationsOpen: boolean;
  pluginManagerOpen: boolean;
  dockerAvailable: boolean;
  dockerOpen: boolean;
  onOpenDocker: () => void;
  /** Most constrained provider-owned quota window, for the glanceable rail meter. */
  quickQuota: QuickQuotaSummary | null;
  quickQuotaLoading: boolean;
  quickQuotaProviderName: string;
  onOpenUsage: () => void;
  /** Host-rendered declarative plugin actions in the primary feature list. */
  pluginActions?: ReactNode;
  /** External resources render as peer Sections in the same scroll flow as Tasks. */
  resourceSections?: ReactNode;
  /** Injectable for deterministic rendered tests; production resolves the current branch via GitHub. */
  loadPullRequest?: (path: string) => Promise<GitHubPullRequest | null>;
}) {
  const t = useT();
  const toast = useToast();
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null);
  const [taskSections, setTaskSections] = useState(() =>
    loadSidebarTaskSections(typeof localStorage === "undefined" ? null : localStorage),
  );
  const [creatingSectionFor, setCreatingSectionFor] = useState<
    { kind: "task" | "project"; id: string } | undefined
  >();
  const [sectionDraft, setSectionDraft] = useState("");
  const [renamingSection, setRenamingSection] = useState<{ id: string; name: string } | null>(null);
  const [dragItem, setDragItem] = useState<SidebarDragItem | null>(null);
  const dragTargetRef = useRef<SidebarDndData | null>(null);
  const [ageNow, setAgeNow] = useState(() => Date.now());
  const [projectOrganization, setProjectOrganization] = useState(() =>
    loadSidebarProjects(typeof localStorage === "undefined" ? null : localStorage),
  );

  useEffect(() => {
    const interval = window.setInterval(() => setAgeNow(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    saveSidebarTaskSections(
      typeof localStorage === "undefined" ? null : localStorage,
      taskSections,
    );
  }, [taskSections]);

  useEffect(() => {
    saveSidebarProjects(
      typeof localStorage === "undefined" ? null : localStorage,
      projectOrganization,
    );
  }, [projectOrganization]);

  // Clamped on every render, not just while dragging, so a width saved on one display comes back
  // usable on another.
  const applied = Math.min(420, Math.max(220, width));
  const quickQuotaWindow = quickQuota?.windowMinutes === 300
    ? t("quota.window5h")
    : quickQuota?.windowMinutes === 10_080
      ? t("quota.windowWeekly")
      : quickQuota?.windowMinutes != null && quickQuota.windowMinutes >= 43_000
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
  const [archiveMotion, setArchiveMotion] = useState<ReadonlyMap<string, boolean>>(
    () => new Map(),
  );
  const requestArchive = useCallback((id: string, archived: boolean) => {
    setArchiveMotion((current) => {
      if (current.has(id)) return current;
      const next = new Map(current);
      next.set(id, archived);
      return next;
    });
  }, []);
  const finishArchiveMotion = useCallback((id: string) => {
    const archived = archiveMotion.get(id);
    if (archived === undefined) return;

    const clearMotion = () => {
      setArchiveMotion((current) => {
        if (!current.has(id)) return current;
        const next = new Map(current);
        next.delete(id);
        return next;
      });
    };

    Promise.resolve(onArchive(id, archived)).then(clearMotion, clearMotion);
  }, [archiveMotion, onArchive]);

  const resizeHandle = useResizeHandle({
    axis: "x",
    value: applied,
    min: 220,
    max: 420,
    onStart: () => {
      setDragging(true);
    },
    onResize: onWidth,
    onEnd: () => setDragging(false),
  });

  const projectNames = useMemo(
    () => new Map(projects.map((project) => [project.path, project.name])),
    [projects],
  );

  // "Recent" follows deliberate re-entry into work, not background chunks or the original
  // creation date. Archived history keeps its stable creation order.
  const recent = useMemo(
    () => [...sessions].sort(
      (a, b) =>
        Number(b.pinned) - Number(a.pinned) ||
        (b.last_active_at ?? b.created_at) - (a.last_active_at ?? a.created_at),
    ),
    [sessions],
  );
  const archived = useMemo(
    () => [...archivedSessions].sort((a, b) => b.created_at - a.created_at),
    [archivedSessions],
  );
  const gitTargetPaths = useMemo(
    () => [...new Set(recent.slice(0, 48).map((session) => session.worktree_path ?? session.cwd))],
    [recent],
  );
  const gitTargetKey = gitTargetPaths.join("\u0000");
  const [gitRefresh, setGitRefresh] = useState(0);
  const [pullRequestsByPath, setPullRequestsByPath] = useState<
    ReadonlyMap<string, SidebarPullRequestStatus | null>
  >(() => new Map());

  useEffect(() => {
    const timer = window.setInterval(() => setGitRefresh((current) => current + 1), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    void loadSidebarPullRequests(
      gitTargetPaths.map((path) => ({ path })),
      loadPullRequest,
    ).then((statuses) => {
      if (active) setPullRequestsByPath(statuses);
    });
    return () => {
      active = false;
    };
  }, [gitRefresh, gitTargetKey, loadPullRequest]);

  const manualSectionIds = useMemo(
    () => new Set(taskSections.sections.map((section) => section.id)),
    [taskSections.sections],
  );
  const assignedSection = useCallback(
    (session: SessionInfo) => {
      const id = taskSections.assignments[session.id];
      return id && manualSectionIds.has(id) ? id : null;
    },
    [manualSectionIds, taskSections.assignments],
  );
  const projectPathForSession = useCallback(
    (session: SessionInfo) => session.project_path
      ?? (projectNames.has(session.cwd) ? session.cwd : null),
    [projectNames],
  );
  const projectEntries = useMemo(() => {
    const entries = new Map(projects.map((project) => [project.path, project]));
    for (const session of recent) {
      const path = projectPathForSession(session);
      if (!path || entries.has(path)) continue;
      entries.set(path, {
        path,
        name: path.split(/[\\/]/).filter(Boolean).pop() ?? path,
        last_opened_at: session.last_active_at ?? session.created_at,
        default_worktree_mode: null,
      });
    }
    return [...entries.values()].sort((left, right) => right.last_opened_at - left.last_opened_at);
  }, [projectPathForSession, projects, recent]);
  const assignedProjectSection = useCallback(
    (path: string) => {
      const id = projectOrganization.assignments[path];
      return id && manualSectionIds.has(id) ? id : null;
    },
    [manualSectionIds, projectOrganization.assignments],
  );
  const unsectioned = useMemo(
    () => sortSidebarTasks(
      recent.filter((session) => !assignedSection(session) && !projectPathForSession(session)),
      taskSections.taskOrder[UNSECTIONED_TASK_ORDER_KEY],
    ),
    [assignedSection, projectPathForSession, recent, taskSections.taskOrder],
  );
  const sectionRows = useMemo(
    () => new Map(taskSections.sections.map((section) => [
      section.id,
      sortSidebarTasks(
        recent.filter((session) => assignedSection(session) === section.id),
        taskSections.taskOrder[section.id],
      ),
    ])),
    [assignedSection, recent, taskSections.sections, taskSections.taskOrder],
  );
  const projectRows = useMemo(
    () => new Map(projectEntries.map((project) => [
      project.path,
      sortSidebarTasks(
        recent.filter((session) =>
          !assignedSection(session) && projectPathForSession(session) === project.path,
        ),
        taskSections.taskOrder[projectTaskOrderKey(project.path)],
      ),
    ])),
    [assignedSection, projectEntries, projectPathForSession, recent, taskSections.taskOrder],
  );
  const rootProjects = useMemo(
    () => sortSidebarProjects(
      projectEntries.filter((project) => !assignedProjectSection(project.path)),
      projectOrganization.order[ROOT_PROJECT_ORDER_KEY],
    ),
    [assignedProjectSection, projectEntries, projectOrganization.order],
  );
  const sectionProjects = useMemo(
    () => new Map(taskSections.sections.map((section) => [
      section.id,
      sortSidebarProjects(
        projectEntries.filter((project) => assignedProjectSection(project.path) === section.id),
        projectOrganization.order[section.id],
      ),
    ])),
    [assignedProjectSection, projectEntries, projectOrganization.order, taskSections.sections],
  );

  const [allProjectsOpen, setAllProjectsOpen] = usePersistedBoolean(
    "rail.allProjectsOpen",
    true,
  );
  // Folded by default: archived threads are reference material, not the working set, so they
  // shouldn't compete with the live rows for attention. The fold survives a restart.
  const [archivedOpen, setArchivedOpen] = usePersistedBoolean("rail.archivedOpen", false);

  const copyToClipboard = useCallback(
    async (value: string, confirmation: string) => {
      try {
        if (!navigator.clipboard) throw new Error("Clipboard API unavailable");
        await navigator.clipboard.writeText(value);
        toast(confirmation, "success");
      } catch {
        toast(t("rail.copyFailed"), "error");
      }
    },
    [t, toast],
  );

  const revealWorkingDirectory = useCallback(
    async (path: string) => {
      try {
        if (!(await openNativePath(path))) throw new Error("Native path reveal unavailable");
      } catch {
        toast(t("rail.revealFailed"), "error");
      }
    },
    [t, toast],
  );

  const beginSectionCreation = useCallback((taskId: string) => {
    setSectionDraft("");
    setCreatingSectionFor({ kind: "task", id: taskId });
  }, []);

  const beginProjectSectionCreation = useCallback((path: string) => {
    setSectionDraft("");
    setCreatingSectionFor({ kind: "project", id: path });
  }, []);

  const commitSectionCreation = useCallback(() => {
    const name = sectionDraft.trim();
    if (name) {
      const id = `section:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
      setTaskSections((current) =>
        createSidebarTaskSection(
          current,
          name,
          id,
          creatingSectionFor?.kind === "task" ? creatingSectionFor.id : undefined,
        ),
      );
      if (creatingSectionFor?.kind === "project") {
        setProjectOrganization((current) =>
          moveSidebarProject(current, creatingSectionFor.id, id, null, []),
        );
      }
    }
    setCreatingSectionFor(undefined);
    setSectionDraft("");
  }, [creatingSectionFor, sectionDraft]);

  const commitSectionRename = useCallback(() => {
    if (!renamingSection) return;
    setTaskSections((current) =>
      renameSidebarTaskSection(current, renamingSection.id, renamingSection.name),
    );
    setRenamingSection(null);
  }, [renamingSection]);

  const taskIdsForSection = useCallback(
    (sectionId: string | null) => (sectionId === null ? unsectioned : sectionRows.get(sectionId) ?? [])
      .map((session) => session.id),
    [sectionRows, unsectioned],
  );
  const taskIdsForProject = useCallback(
    (path: string) => (projectRows.get(path) ?? []).map((session) => session.id),
    [projectRows],
  );

  const dropTask = useCallback((
    taskId: string,
    sectionId: string | null,
    beforeTaskId: string | null,
    destinationTaskIds: readonly string[],
    destinationOrderKey: string,
    projectPath: string | null = null,
  ) => {
    if (projectPath) {
      const source = recent.find((session) => session.id === taskId);
      if (!source || projectPathForSession(source) !== projectPath) return;
    }
    setTaskSections((current) => moveSidebarTask(
      current,
      taskId,
      sectionId,
      beforeTaskId,
      destinationTaskIds,
      destinationOrderKey,
    ));
    setDragItem(null);
  }, [projectPathForSession, recent]);

  const moveTaskBy = useCallback((session: SessionInfo, offset: -1 | 1) => {
    const sectionId = assignedSection(session);
    const projectPath = sectionId === null ? projectPathForSession(session) : null;
    const ids = projectPath ? taskIdsForProject(projectPath) : taskIdsForSection(sectionId);
    const currentIndex = ids.indexOf(session.id);
    const nextIndex = Math.min(ids.length - 1, Math.max(0, currentIndex + offset));
    if (currentIndex < 0 || nextIndex === currentIndex) return;
    const remaining = ids.filter((id) => id !== session.id);
    const beforeTaskId = remaining[nextIndex] ?? null;
    dropTask(
      session.id,
      sectionId,
      beforeTaskId,
      ids,
      projectPath ? projectTaskOrderKey(projectPath) : sectionId ?? UNSECTIONED_TASK_ORDER_KEY,
      projectPath,
    );
  }, [assignedSection, dropTask, projectPathForSession, taskIdsForProject, taskIdsForSection]);

  const projectPathsForSection = useCallback(
    (sectionId: string | null) => (sectionId === null
      ? rootProjects
      : sectionProjects.get(sectionId) ?? []).map((project) => project.path),
    [rootProjects, sectionProjects],
  );

  const dropProject = useCallback((
    path: string,
    sectionId: string | null,
    beforePath: string | null,
  ) => {
    setProjectOrganization((current) => moveSidebarProject(
      current,
      path,
      sectionId,
      beforePath,
      projectPathsForSection(sectionId),
    ));
    setDragItem(null);
  }, [projectPathsForSection]);

  const moveProjectBy = useCallback((path: string, offset: -1 | 1) => {
    const sectionId = assignedProjectSection(path);
    const paths = projectPathsForSection(sectionId);
    const currentIndex = paths.indexOf(path);
    const nextIndex = Math.min(paths.length - 1, Math.max(0, currentIndex + offset));
    if (currentIndex < 0 || nextIndex === currentIndex) return;
    const remaining = paths.filter((candidate) => candidate !== path);
    dropProject(path, sectionId, remaining[nextIndex] ?? null);
  }, [assignedProjectSection, dropProject, projectPathsForSection]);

  const moveSectionBy = useCallback((section: SidebarTaskSection, offset: -1 | 1) => {
    const ids = taskSections.sections.map((candidate) => candidate.id);
    const currentIndex = ids.indexOf(section.id);
    const nextIndex = Math.min(ids.length - 1, Math.max(0, currentIndex + offset));
    if (currentIndex < 0 || nextIndex === currentIndex) return;
    const remaining = ids.filter((id) => id !== section.id);
    const beforeId = remaining[nextIndex] ?? null;
    setTaskSections((current) => moveSidebarTaskSection(current, section.id, beforeId));
  }, [taskSections.sections]);

  const handleSidebarDragStart = useCallback((event: DragStartEvent) => {
    dragTargetRef.current = null;
    const source = sidebarDndData(event.operation.source?.data);
    setDragItem(source?.item ?? null);
  }, []);

  const handleSidebarDragOver = useCallback((event: DragOverEvent) => {
    const source = sidebarDndData(event.operation.source?.data)?.item;
    dragTargetRef.current = sidebarRememberedDragTarget(
      source ?? null,
      event.operation.target?.data,
      dragTargetRef.current,
    );
  }, []);

  const handleSidebarDragEnd = useCallback((event: DragEndEvent) => {
    setDragItem(null);
    const lastTarget = dragTargetRef.current;
    dragTargetRef.current = null;
    if (event.canceled) return;

    const source = sidebarDndData(event.operation.source?.data)?.item;
    if (!source) return;
    const sortable = sidebarSortableSnapshot(event.operation.source);
    const rawEventTarget = sidebarDndData(event.operation.target?.data);
    const eventTarget = sidebarRememberedDragTarget(
      source,
      event.operation.target?.data,
      lastTarget,
    );
    const target = rawEventTarget?.item?.kind === source.kind
      && rawEventTarget.item.id === source.id
      ? lastTarget
      : eventTarget;
    const finalized = sidebarFinalizedDestination(source, sortable);

    if (source.kind === "section") {
      if (finalized?.kind === "sections") {
        const sectionIds = taskSections.sections.map((section) => section.id);
        const beforeId = sidebarBeforeIdAtFinalIndex(sectionIds, source.id, finalized.index);
        setTaskSections((current) => moveSidebarTaskSection(current, source.id, beforeId));
        return;
      }
      if (!target) return;
      if (target.item?.kind === "section") {
        setTaskSections((current) =>
          moveSidebarTaskSection(current, source.id, target.item!.id),
        );
      } else if (target.location.kind === "sections") {
        setTaskSections((current) => moveSidebarTaskSection(current, source.id, null));
      }
      return;
    }

    if (source.kind === "project") {
      if (finalized?.kind === "projects") {
        dropProject(
          source.id,
          finalized.sectionId,
          sidebarBeforeIdAtFinalIndex(
            projectPathsForSection(finalized.sectionId),
            source.id,
            finalized.index,
          ),
        );
        return;
      }
      if (!target) return;
      if (target.item?.kind === "section") {
        dropProject(source.id, target.item.id, null);
      } else if (target.item?.kind === "project" && target.location.kind === "projects") {
        dropProject(source.id, target.location.sectionId, target.item.id);
      } else if (target.location.kind === "section") {
        dropProject(source.id, target.location.sectionId, null);
      } else if (target.location.kind === "projects") {
        dropProject(source.id, target.location.sectionId, null);
      }
      return;
    }

    if (finalized?.kind === "tasks") {
      const destinationTaskIds = finalized.projectPath
        ? taskIdsForProject(finalized.projectPath)
        : taskIdsForSection(finalized.sectionId);
      dropTask(
        source.id,
        finalized.sectionId,
        sidebarBeforeIdAtFinalIndex(destinationTaskIds, source.id, finalized.index),
        destinationTaskIds,
        finalized.projectPath
          ? projectTaskOrderKey(finalized.projectPath)
          : finalized.sectionId ?? UNSECTIONED_TASK_ORDER_KEY,
        finalized.projectPath,
      );
      return;
    }
    if (!target) return;

    let sectionId: string | null;
    let projectPath: string | null;
    let beforeTaskId: string | null = null;
    if (target.item?.kind === "section") {
      sectionId = target.item.id;
      projectPath = null;
    } else if (target.item?.kind === "project") {
      sectionId = null;
      projectPath = target.item.id;
    } else if (target.location.kind === "section") {
      sectionId = target.location.sectionId;
      projectPath = null;
    } else if (target.location.kind === "tasks") {
      sectionId = target.location.sectionId;
      projectPath = target.location.projectPath;
      beforeTaskId = target.item?.kind === "task" ? target.item.id : null;
    } else {
      return;
    }

    const destinationTaskIds = projectPath
      ? taskIdsForProject(projectPath)
      : taskIdsForSection(sectionId);
    dropTask(
      source.id,
      sectionId,
      beforeTaskId,
      destinationTaskIds,
      projectPath
        ? projectTaskOrderKey(projectPath)
        : sectionId ?? UNSECTIONED_TASK_ORDER_KEY,
      projectPath,
    );
  }, [
    dropProject,
    dropTask,
    projectPathsForSection,
    taskIdsForProject,
    taskIdsForSection,
    taskSections.sections,
  ]);

  /** One quiet source-list row: task title, workspace identity, and only actionable status. */
  const sessionRow = (s: SessionInfo, isArchived: boolean, showProjectIdentity = true) => {
    const activity = sessionActivity(s).state;
    const isAwaitingInput = activity.kind === "awaiting_input";
    const isFailed = activity.kind === "failed";
    const isRunning =
      runningSessions.has(s.id) || activity.kind === "running" || isAwaitingInput;
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
    // Preview rows are Agent-only at the Core boundary, so a meaningful reply remains useful even
    // when it happens to match the Task title.
    const hasUsefulPreview = Boolean(
      preview && /[\p{L}\p{N}]/u.test(preview),
    );
    const lastActiveAt = s.last_active_at && s.last_active_at > 0
      ? s.last_active_at
      : s.created_at;
    const workspacePath = s.project_path ?? s.worktree_path ?? s.cwd;
    const workspaceName = (s.project_path ? projectNames.get(s.project_path) : null)
      ?? workspacePath.split(/[\\/]/).filter(Boolean).pop()
      ?? workspacePath;
    const checkoutPath = s.worktree_path ?? s.cwd;
    const isWorktree = s.worktree_path !== null && !s.worktree_discarded;
    const pullRequest = pullRequestsByPath.get(checkoutPath) ?? null;
    const pullRequestLabel = pullRequest
      ? t(`rail.pullRequest.${pullRequest.state}`)
      : null;
    const pullRequestTone = pullRequest?.state === "merged"
      ? "text-success"
      : pullRequest?.state === "conflicting" || pullRequest?.state === "ci_failed"
        ? "text-destructive"
        : pullRequest?.state === "ci_running"
          ? "text-warning"
          : "text-muted-foreground";
    const checkoutBadge = (
      <span
        data-session-checkout-kind={isWorktree ? "worktree" : "checkout"}
        title={t(isWorktree ? "rail.gitWorktreeHint" : "rail.gitCheckoutHint")}
        aria-label={t(isWorktree ? "rail.gitWorktreeHint" : "rail.gitCheckoutHint")}
        className="flex shrink-0 items-center gap-0.5 rounded-micro bg-fill-quiet px-1 text-fine leading-4 text-foreground/55"
      >
        <GitBranch className="size-2.5" aria-hidden="true" />
        {t(isWorktree ? "rail.gitWorktree" : "rail.gitCheckout")}
      </span>
    );
    const pullRequestBadge = pullRequest && pullRequestLabel ? (
      <span
        data-session-pull-request={pullRequest.state}
        title={`#${pullRequest.number} · ${pullRequestLabel}`}
        aria-label={`#${pullRequest.number} · ${pullRequestLabel}`}
        className={cn(
          "flex shrink-0 items-center gap-0.5 rounded-micro bg-fill-quiet px-1 text-fine leading-4",
          pullRequestTone,
        )}
      >
        {pullRequest.state === "merged" ? (
          <GitMerge className="size-2.5" aria-hidden="true" />
        ) : pullRequest.state === "ci_running" ? (
          <ActivityOrb state="working" visualSize={14} aria-hidden="true" />
        ) : (
          <GitPullRequest className="size-2.5" aria-hidden="true" />
        )}
        #{pullRequest.number} {pullRequestLabel}
      </span>
    ) : null;
    const provenanceInSummary = pullRequest === null;
    const showWorkspaceLine = pullRequest !== null;

    const commitRename = () => {
      if (renaming?.id !== s.id) return;
      const title = renaming.title.trim();
      if (title && title !== s.title) onRename(s.id, title);
      setRenaming(null);
    };

    const startRename = () => {
      // Let the closing menu restore focus before mounting the auto-focus field.
      setTimeout(() => setRenaming({ id: s.id, title: s.title }), 0);
    };

    const currentSectionId = assignedSection(s);
    const currentProjectPath = currentSectionId === null ? projectPathForSession(s) : null;
    const currentTaskIds = currentProjectPath
      ? taskIdsForProject(currentProjectPath)
      : taskIdsForSection(currentSectionId);
    const currentTaskIndex = currentTaskIds.indexOf(s.id);
    const canMoveUp = !isArchived && currentTaskIndex > 0;
    const canMoveDown = !isArchived && currentTaskIndex >= 0 && currentTaskIndex < currentTaskIds.length - 1;
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
        case "pin":
          onPin(s.id, !s.pinned);
          break;
        case "rename":
          startRename();
          break;
        case "move-up":
          moveTaskBy(s, -1);
          break;
        case "move-down":
          moveTaskBy(s, 1);
          break;
        case "archive":
          requestArchive(s.id, !isArchived);
          break;
        case "reveal-working-directory":
          void revealWorkingDirectory(s.worktree_path ?? s.cwd);
          break;
        case "copy-working-directory":
          void copyToClipboard(
            s.worktree_path ?? s.cwd,
            t("rail.workingDirectoryCopied"),
          );
          break;
        case "copy-session-id":
          void copyToClipboard(s.id, t("rail.sessionIdCopied"));
          break;
        case "discard-worktree":
          onDiscardWorktree(s);
          break;
      }
    };

    const nativeSectionMenu: NativeContextMenuItem = {
      type: "item",
      label: t("rail.section"),
      action: "section-menu",
      submenu: [
        {
          type: "item",
          label: t("rail.noSection"),
          action: "section:none",
          checked: currentSectionId === null,
        },
        ...taskSections.sections.map((section) => ({
          type: "item" as const,
          label: section.name,
          action: `section:${section.id}`,
          checked: currentSectionId === section.id,
        })),
        { type: "separator" },
        {
          type: "item",
          label: t("rail.newSection"),
          action: "section:new",
        },
      ],
    };

    const nativeMenuItems: NativeContextMenuItem[] = [
      ...(!isArchived
        ? [
            {
              type: "item",
              label: s.pinned ? t("rail.unpin") : t("rail.pin"),
              action: "pin",
            } as const,
          ]
        : []),
      { type: "item", label: t("rail.rename"), action: "rename" },
      ...(!isArchived
        ? [
            {
              type: "item",
              label: t("rail.moveUp"),
              action: "move-up",
              enabled: canMoveUp,
            } as const,
            {
              type: "item",
              label: t("rail.moveDown"),
              action: "move-down",
              enabled: canMoveDown,
            } as const,
          ]
        : []),
      ...(!isArchived ? [nativeSectionMenu] : []),
      {
        type: "item",
        label: isArchived ? t("rail.unarchive") : t("rail.archive"),
        action: "archive",
      },
      { type: "separator" },
      {
        type: "item",
        label: t("rail.revealWorkingDirectory"),
        action: "reveal-working-directory",
      },
      {
        type: "item",
        label: t("rail.copyWorkingDirectory"),
        action: "copy-working-directory",
      },
      { type: "item", label: t("rail.copySessionId"), action: "copy-session-id" },
      ...(s.worktree_path !== null && !s.worktree_discarded
        ? [
            { type: "separator" } as const,
            {
              type: "item",
              label: t("worktree.discardAction"),
              action: "discard-worktree",
            } as const,
          ]
        : []),
    ];

    const onRowKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.target !== event.currentTarget) return;

      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onSelect(s.id);
        return;
      }

      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        const rows = Array.from(
          event.currentTarget
            .closest("[data-session-list]")
            ?.querySelectorAll<HTMLButtonElement>("[data-session-select]") ?? [],
        );
        const current = rows.indexOf(event.currentTarget);
        const delta = event.key === "ArrowDown" ? 1 : -1;
        const next = rows[Math.min(rows.length - 1, Math.max(0, current + delta))];
        if (next && next !== event.currentTarget) {
          event.preventDefault();
          next.focus();
        }
        return;
      }

      if ((event.key === "F10" && event.shiftKey) || event.key === "ContextMenu") {
        event.preventDefault();
        const rect = event.currentTarget.getBoundingClientRect();
        event.currentTarget.dispatchEvent(
          new MouseEvent("contextmenu", {
            bubbles: true,
            cancelable: true,
            button: 2,
            clientX: rect.left + Math.min(24, rect.width / 2),
            clientY: rect.top + Math.min(24, rect.height / 2),
          }),
        );
      }
    };

    return (
      <SidebarSortable
        key={s.id}
        item={{ kind: "task", id: s.id }}
        location={{ kind: "tasks", sectionId: currentSectionId, projectPath: currentProjectPath }}
        index={Math.max(0, currentTaskIndex)}
        accept="task"
        collisionPriority={2}
        disabled={isArchived || renaming?.id === s.id}
      >
        {({ ref: sortableRef, handleRef, sourceRef, targetRef, isDragging, isDropTarget }) => (
      <SessionContextMenu items={nativeMenuItems} onAction={runContextMenuAction}>
        <ContextMenuTrigger
          render={
            <div
              ref={(element) => {
                sortableRef(element);
                targetRef?.(element);
              }}
              data-session-id={s.id}
              data-sidebar-dragging={isDragging ? "true" : undefined}
              data-sidebar-drop-target={isDropTarget ? "true" : undefined}
              data-session-density="compact"
              data-session-archive-motion={archiveMotion.has(s.id)
                ? isArchived ? "restore" : "archive"
                : undefined}
              aria-busy={archiveMotion.has(s.id) || undefined}
              title={hasUsefulPreview ? preview : undefined}
              onAnimationEnd={(event) => {
                if (event.target === event.currentTarget) finishArchiveMotion(s.id);
              }}
              onContextMenu={(event) =>
                event.currentTarget
                  .querySelector<HTMLButtonElement>("[data-session-select]")
                  ?.focus({ preventScroll: true })
              }
              className={cn(
                "session-rail-row group relative cursor-default rounded-control px-2 py-1.5 outline-none transition-[box-shadow,opacity] hover:bg-fill-quiet focus-within:bg-fill-quiet data-[popup-open]:bg-fill-hover data-[sidebar-dragging=true]:opacity-45",
                s.id === activeSession && "bg-fill-hover",
              )}
            >
              <Button
                ref={sourceRef}
                type="button"
                variant="ghost"
                data-session-select
                aria-current={s.id === activeSession ? "page" : undefined}
                aria-describedby={hasUsefulPreview ? `session-preview-${s.id}` : undefined}
                aria-label={t("rail.sessionAccessibility", {
                  title: s.title,
                  provider: displayProvider(s.provider),
                  status: statusLabel,
                })}
                onClick={() => onSelect(s.id)}
                onKeyDown={onRowKeyDown}
                className="absolute inset-0 z-0 h-auto rounded-control p-0 hover:bg-transparent"
              />
              <div
                data-session-content
                className="pointer-events-none relative z-10 pl-1.5"
              >
                {/* Title owns the row. Routine controls appear on demand. */}
                <div data-session-line="title" className="flex h-control-mini items-center gap-2">
                  {renaming?.id === s.id ? (
                    <Input
                      autoFocus
                      size="compact"
                      className="pointer-events-auto relative z-10 h-(--ds-control-mini) flex-1 text-body"
                      value={renaming.title}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setRenaming({ id: s.id, title: e.target.value })}
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
                        "min-w-0 flex-1 truncate text-body",
                        s.id === activeSession && "font-medium",
                      )}
                    >
                      {s.title}
                    </span>
                  )}
                  {(isAwaitingInput || isFailed || isRunning) && (
                    <span
                      data-session-status
                      aria-label={statusLabel}
                      title={isFailed ? activity.message : statusLabel}
                      className={cn(
                        "flex size-5 shrink-0 items-center justify-center text-muted-foreground group-hover:hidden group-focus-within:hidden group-data-[popup-open]:hidden",
                        isAwaitingInput && "text-warning",
                        isFailed && "text-destructive",
                        isRunning && !isAwaitingInput && "text-primary",
                      )}
                    >
                      {isAwaitingInput ? (
                        <span className="size-1.5 animate-pulse rounded-full bg-warning" />
                      ) : isFailed ? (
                        <CircleAlert className="size-3" />
                      ) : (
                        <ActivityOrb state="working" visualSize={14} aria-hidden="true" />
                      )}
                    </span>
                  )}
                  <span
                    data-session-actions
                    className="hidden shrink-0 gap-0.5 group-hover:flex group-focus-within:flex group-data-[popup-open]:flex"
                  >
                    {!isArchived && (
                      <TooltipButton
                        ref={handleRef}
                        label={t("rail.dragTask")}
                        variant="ghost"
                        size="icon-xs"
                        data-session-drag-handle
                        className="pointer-events-auto relative z-10 cursor-grab text-muted-foreground active:cursor-grabbing"
                      >
                        <GripVertical className="pointer-events-none" />
                      </TooltipButton>
                    )}
                    {!isArchived && (
                      <TooltipButton
                        label={s.pinned ? t("rail.unpin") : t("rail.pin")}
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-pressed={s.pinned}
                        className={cn(
                          "pointer-events-auto relative z-10 text-muted-foreground hover:text-foreground",
                          s.pinned && "text-primary",
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
                      className="pointer-events-auto relative z-10 text-muted-foreground hover:text-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
                        setRenaming({ id: s.id, title: s.title });
                      }}
                    >
                      <Pencil data-icon="inline-start" />
                    </TooltipButton>
                    <TooltipButton
                      label={isArchived ? t("rail.unarchive") : t("rail.archive")}
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      className="pointer-events-auto relative z-10 text-muted-foreground hover:text-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
                        requestArchive(s.id, !isArchived);
                      }}
                    >
                      {isArchived
                        ? <ArchiveRestore data-icon="inline-start" />
                        : <Archive data-icon="inline-start" />}
                    </TooltipButton>
                  </span>
                </div>

                {/* Keep the preview aligned with the title; trail provider and timing metadata. */}
                <div
                  data-session-line="summary"
                  className="mt-0.5 flex h-4 items-center gap-1.5 text-callout text-muted-foreground"
                >
                  {hasUsefulPreview ? (
                    <span
                      id={`session-preview-${s.id}`}
                      data-session-preview
                      className="min-w-0 flex-1 truncate"
                    >
                      {preview}
                    </span>
                  ) : (
                    <span className="min-w-0 flex-1" aria-hidden="true" />
                  )}
                  <span
                    data-session-provider={providerLabel(s.provider)}
                    title={displayProvider(s.provider)}
                    aria-label={displayProvider(s.provider)}
                    className="flex size-3.5 shrink-0 items-center justify-center"
                  >
                    <ProviderIcon
                      provider={providerLabel(s.provider)}
                      className="size-3 opacity-70"
                    />
                  </span>
                  <time
                    data-session-age
                    dateTime={new Date(lastActiveAt).toISOString()}
                    title={new Date(lastActiveAt).toLocaleString()}
                    className="shrink-0 text-fine"
                  >
                    {shortAge(lastActiveAt, ageNow)}
                  </time>
                  {provenanceInSummary ? checkoutBadge : null}
                </div>

                {/* Workspace identity and Git provenance close the hierarchy. */}
                {showWorkspaceLine && (
                  <div
                    data-session-line="workspace"
                    className="mt-0.5 flex h-4 items-center gap-1.5 text-callout text-muted-foreground"
                  >
                    {showProjectIdentity ? (
                      <>
                        <Folder className="size-3 shrink-0 opacity-70" aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate">{workspaceName}</span>
                      </>
                    ) : null}
                    {checkoutBadge}
                    {pullRequestBadge}
                  </div>
                )}
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
                <ContextMenuItem disabled={!canMoveUp} onClick={() => moveTaskBy(s, -1)}>
                  <ArrowUp />
                  {t("rail.moveUp")}
                </ContextMenuItem>
                <ContextMenuItem disabled={!canMoveDown} onClick={() => moveTaskBy(s, 1)}>
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
                    <Check className={cn(currentSectionId !== null && "opacity-0")} />
                    {t("rail.noSection")}
                  </ContextMenuItem>
                  {taskSections.sections.map((section) => (
                    <ContextMenuItem
                      key={section.id}
                      onClick={() => assignSection(section.id)}
                    >
                      <Check className={cn(currentSectionId !== section.id && "opacity-0")} />
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
              {isArchived ? (
                <ArchiveRestore />
              ) : (
                <Archive />
              )}
              {isArchived ? t("rail.unarchive") : t("rail.archive")}
            </ContextMenuItem>
          </ContextMenuGroup>
          <ContextMenuSeparator />
          <ContextMenuGroup>
            <ContextMenuItem
              onClick={() => void revealWorkingDirectory(s.worktree_path ?? s.cwd)}
            >
              <FolderOpen />
              {t("rail.revealWorkingDirectory")}
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() =>
                void copyToClipboard(
                  s.worktree_path ?? s.cwd,
                  t("rail.workingDirectoryCopied"),
                )
              }
            >
              <Copy />
              {t("rail.copyWorkingDirectory")}
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => void copyToClipboard(s.id, t("rail.sessionIdCopied"))}
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
                <ContextMenuItem variant="destructive" onClick={() => onDiscardWorktree(s)}>
                  <FolderX />
                  {t("worktree.discardAction")}
                </ContextMenuItem>
              </ContextMenuGroup>
            </>
          ) : null}
        </ContextMenuContent>
      </SessionContextMenu>
        )}
      </SidebarSortable>
    );
  };

  const renderProject = (project: Project) => {
    const rows = projectRows.get(project.path) ?? [];
    const sectionId = assignedProjectSection(project.path);
    const paths = projectPathsForSection(sectionId);
    const projectIndex = paths.indexOf(project.path);
    const canMoveUp = projectIndex > 0;
    const canMoveDown = projectIndex >= 0 && projectIndex < paths.length - 1;
    const open = projectOrganization.collapsed[project.path] !== true;
    const moveToSection = (nextSectionId: string | null) =>
      dropProject(project.path, nextSectionId, null);

    return (
      <SidebarDropZone
        key={project.path}
        location={{ kind: "tasks", sectionId: null, projectPath: project.path }}
        accept="task"
        collisionPriority={sidebarTaskContainerCollisionPriority(rows.length > 0)}
      >
        {({ ref: taskDropRef, isDropTarget: isTaskDropTarget }) => (
      <SidebarSortable
        item={{ kind: "project", id: project.path }}
        location={{ kind: "projects", sectionId }}
        index={Math.max(0, projectIndex)}
        accept="project"
        collisionPriority={1}
      >
        {({ ref: sortableRef, handleRef, sourceRef, targetRef, isDragging, isDropTarget }) => (
      <div
        ref={(element) => {
          sortableRef(element);
          taskDropRef(element);
        }}
        data-project-group={project.path}
        data-sidebar-dragging={isDragging ? "true" : undefined}
        data-sidebar-drop-target={isTaskDropTarget ? "true" : undefined}
      >
      <Collapsible
        open={open}
        onOpenChange={(nextOpen) =>
          setProjectOrganization((current) =>
            setSidebarProjectCollapsed(current, project.path, !nextOpen),
          )
        }
      >
        <div
          ref={targetRef}
          data-project-header={project.path}
          data-sidebar-drop-target={isDropTarget ? "true" : undefined}
          className="group/project relative flex min-h-control items-center rounded-control pr-1 transition-[background-color,opacity] hover:bg-fill-quiet data-[sidebar-dragging=true]:opacity-45"
        >
          <TooltipButton
            ref={handleRef}
            label={t("rail.dragProject")}
            variant="ghost"
            size="icon-xs"
            data-project-drag-handle={project.path}
            className="absolute left-0 z-10 cursor-grab text-foreground/35 opacity-0 group-hover/project:opacity-100 focus-visible:opacity-100 active:cursor-grabbing"
          >
            <GripVertical className="pointer-events-none" />
          </TooltipButton>
          <CollapsibleTrigger
            render={
              <Button
                ref={sourceRef}
                type="button"
                variant="ghost"
                focusStyle="inset"
              />
            }
            data-project-toggle={project.path}
            title={t(open ? "rail.hideProject" : "rail.showProject", { name: project.name })}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-control px-2 text-ui leading-4 outline-none hover:bg-transparent focus-visible:focus-ring-inset dark:hover:bg-transparent"
          >
            <Folder className="size-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-left">{project.name}</span>
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
              <DropdownMenuItem disabled={!canMoveUp} onClick={() => moveProjectBy(project.path, -1)}>
                <ArrowUp />
                {t("rail.moveUp")}
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!canMoveDown} onClick={() => moveProjectBy(project.path, 1)}>
                <ArrowDown />
                {t("rail.moveDown")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => moveToSection(null)}>
                <Check className={cn(sectionId !== null && "opacity-0")} />
                {t("rail.noSection")}
              </DropdownMenuItem>
              {taskSections.sections.map((section) => (
                <DropdownMenuItem key={section.id} onClick={() => moveToSection(section.id)}>
                  <Check className={cn(sectionId !== section.id && "opacity-0")} />
                  {section.name}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setTimeout(() => beginProjectSectionCreation(project.path), 0)}
              >
                <Plus />
                {t("rail.newSection")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <CollapsibleContent
          data-project-content={project.path}
          className="ml-0"
        >
          {rows.length > 0 ? (
            <div className="flex flex-col gap-0.5">
              {rows.map((row) => sessionRow(row, false, false))}
            </div>
          ) : (
            <p className="py-1.5 pl-8 pr-2 text-fine text-foreground/35">
              {t("rail.projectEmpty")}
            </p>
          )}
        </CollapsibleContent>
      </Collapsible>
      </div>
        )}
      </SidebarSortable>
        )}
      </SidebarDropZone>
    );
  };

  const renderManualSection = (section: SidebarTaskSection) => {
    const open = !section.collapsed;
    const rows = sectionRows.get(section.id) ?? [];
    const sectionProjectRows = sectionProjects.get(section.id) ?? [];
    const sectionIndex = taskSections.sections.findIndex((candidate) => candidate.id === section.id);
    const canMoveUp = sectionIndex > 0;
    const canMoveDown = sectionIndex >= 0 && sectionIndex < taskSections.sections.length - 1;
    const archiveSection = async () => {
      const tasks = [
        ...rows,
        ...sectionProjectRows.flatMap((project) => projectRows.get(project.path) ?? []),
      ];
      await Promise.all(tasks.map((row) => Promise.resolve(onArchive(row.id, true))));
    };
    return (
      <SidebarDropZone
        key={section.id}
        location={{ kind: "section", sectionId: section.id }}
        accept="project"
        collisionPriority={2}
      >
        {({ ref: projectDropRef, isDropTarget: isProjectDropTarget }) => (
      <SidebarDropZone
        location={{ kind: "section", sectionId: section.id }}
        accept="task"
        collisionPriority={sidebarTaskContainerCollisionPriority(
          rows.length > 0 || sectionProjectRows.some(
            (project) => (projectRows.get(project.path) ?? []).length > 0,
          ),
        )}
      >
        {({ ref: taskDropRef, isDropTarget: isTaskDropTarget }) => (
      <SidebarSortable
        item={{ kind: "section", id: section.id }}
        location={{ kind: "sections" }}
        index={Math.max(0, sectionIndex)}
        accept="section"
        disabled={renamingSection?.id === section.id}
      >
        {({ ref: sortableRef, handleRef, sourceRef, targetRef, isDragging, isDropTarget }) => (
      <div
        ref={(element) => {
          sortableRef(element);
          taskDropRef(element);
        }}
        data-task-section-group={section.id}
        data-sidebar-dragging={isDragging ? "true" : undefined}
        data-sidebar-drop-target={isTaskDropTarget ? "true" : undefined}
      >
      <Collapsible
        open={open}
        onOpenChange={(nextOpen) =>
          setTaskSections((current) =>
            setSidebarTaskSectionCollapsed(current, section.id, !nextOpen),
          )
        }
      >
        <div
          ref={projectDropRef}
          data-task-section-header={section.id}
          data-sidebar-drop-target={
            isDropTarget || isProjectDropTarget ? "true" : undefined
          }
          className="group/section relative flex min-h-control-mini items-center pr-2 pb-1 pt-2 transition-opacity data-[sidebar-dragging=true]:opacity-45"
        >
          {renamingSection?.id === section.id ? (
            <Input
              autoFocus
              size="compact"
              aria-label={t("rail.sectionName")}
              className="h-control-mini min-w-0 flex-1 text-body"
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
              <TooltipButton
                ref={handleRef}
                label={t("rail.dragSection")}
                variant="ghost"
                size="icon-xs"
                data-section-drag-handle={section.id}
                className="absolute left-0 z-10 cursor-grab text-foreground/35 opacity-0 group-hover/section:opacity-100 focus-visible:opacity-100 active:cursor-grabbing"
              >
                <GripVertical className="pointer-events-none" />
              </TooltipButton>
              <CollapsibleTrigger
                render={
                  <Button
                    ref={(element) => {
                      sourceRef?.(element);
                      targetRef?.(element);
                    }}
                    type="button"
                    variant="ghost"
                    size="compact"
                    focusStyle="inset"
                  />
                }
                data-task-section-toggle={section.id}
                title={t(open ? "rail.hideSection" : "rail.showSection", { name: section.name })}
                className="min-w-0 justify-start gap-1 font-normal text-foreground/55 hover:text-foreground"
              >
                <span className="truncate">{section.name}</span>
                <ChevronRight
                  className={cn("size-3.5 shrink-0 transition-transform", open && "rotate-90")}
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
                  setTimeout(() => setRenamingSection({ id: section.id, name: section.name }), 0)
                }
              >
                <Pencil />
                {t("rail.editSection")}
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!canMoveUp} onClick={() => moveSectionBy(section, -1)}>
                <ArrowUp />
                {t("rail.moveUp")}
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!canMoveDown} onClick={() => moveSectionBy(section, 1)}>
                <ArrowDown />
                {t("rail.moveDown")}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={rows.length === 0 && sectionProjectRows.every(
                  (project) => (projectRows.get(project.path) ?? []).length === 0,
                )}
                onClick={() => void archiveSection()}
              >
                <Archive />
                {t("rail.archiveSection")}
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onClick={() => {
                  setTaskSections((current) => deleteSidebarTaskSection(current, section.id));
                  setProjectOrganization((current) =>
                    releaseSidebarSectionProjects(current, section.id),
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
        >
          {sectionProjectRows.length > 0 || rows.length > 0 ? (
            <div className="flex flex-col gap-0.5">
              {sectionProjectRows.map(renderProject)}
              {rows.map((row) => sessionRow(row, false))}
            </div>
          ) : (
            <p className="px-2 py-1.5 text-callout text-foreground/35">{t("rail.sectionEmpty")}</p>
          )}
        </CollapsibleContent>
      </Collapsible>
      </div>
        )}
      </SidebarSortable>
        )}
      </SidebarDropZone>
        )}
      </SidebarDropZone>
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
        gone && "invisible",
      )}
      style={{ width: collapsed ? 0 : applied }}
    >
      <DragDropRoot
        onDragStart={handleSidebarDragStart}
        onDragOver={handleSidebarDragOver}
        onDragEnd={handleSidebarDragEnd}
      >
      {/* Pinned to the open width so the content doesn't reflow while the pane sweeps. */}
      <div className="session-rail-content flex min-h-0 flex-1 flex-col" style={{ width: applied }}>
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
            render={<Button
              variant="ghost"
              size="icon"
              className="size-7 shrink-0 text-muted-foreground"
              aria-label={t("rail.collapse")}
              onClick={onToggleCollapse}
              disabled={taskBoardOpen && !overlay}
            >
              <PanelLeft className="size-4" />
            </Button>}
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
        className="mx-2 mb-1 h-control w-auto shrink-0 gap-2 bg-fill-quiet px-2 text-muted-foreground"
        aria-label={t("rail.searchChats")}
        onClick={onOpenSearch}
      >
        <Search className="size-3.5 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 truncate">{t("rail.searchChats")}</span>
        {searchHint ? (
          <kbd className="shrink-0 rounded-micro bg-background/45 px-1.5 py-0.5 font-mono text-callout text-muted-foreground">
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
          className="group/new-task flex h-control min-w-0 items-center rounded-control text-foreground/75 transition-colors hover:bg-fill-hover hover:text-foreground focus-within:bg-fill-hover focus-within:text-foreground"
        >
          <Button
            type="button"
            variant="ghost"
            size="row"
            focusStyle="inset"
            className="h-full min-w-0 flex-1 gap-2 pl-2 pr-1"
            title={`${t("rail.newTask")} ${newHint}`}
            onClick={onNew}
          >
            <SquarePen className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="min-w-0 flex-1 truncate">{t("rail.newTask")}</span>
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
                    "mr-1 size-control-mini rounded-control text-muted-foreground hover:bg-fill-hover hover:text-foreground group-hover/new-task:text-foreground",
                    quickChatOpen && "bg-fill-hover text-foreground",
                  )}
                  aria-label={t("quickChat.toggle")}
                  aria-pressed={quickChatOpen}
                  onClick={onToggleQuickChat}
                >
                  <MessageSquarePlus className="size-4" aria-hidden />
                </Button>
              }
            />
            <TooltipContent side="right">{t("quickChat.title")}</TooltipContent>
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
          {recent.length === 0 && archived.length === 0 && projectEntries.length === 0 &&
          taskSections.sections.length === 0 && creatingSectionFor === undefined ? (
            <p className="px-2 py-3 text-callout text-muted-foreground">
              {t("rail.empty")} {t("rail.emptyHint")}
            </p>
          ) : (
            <>
              <SidebarDropZone location={{ kind: "sections" }} accept="section">
                {({ ref, isDropTarget }) => (
              <div
                ref={ref}
                data-task-section-list
                data-sidebar-drop-target={isDropTarget ? "true" : undefined}
              >
                {taskSections.sections.map(renderManualSection)}
              </div>
                )}
              </SidebarDropZone>
              {rootProjects.length > 0 || dragItem?.kind === "project" ? (
                <Collapsible
                  open={allProjectsOpen || dragItem?.kind === "project"}
                  onOpenChange={setAllProjectsOpen}
                >
                  <div data-default-project-group>
                    <div className="flex min-h-control-mini items-center pb-1 pr-2 pt-2">
                      <CollapsibleTrigger
                        render={
                          <Button
                            type="button"
                            variant="ghost"
                            size="compact"
                            focusStyle="inset"
                          />
                        }
                        data-default-project-toggle
                        title={t(
                          allProjectsOpen ? "rail.hideSection" : "rail.showSection",
                          { name: t("rail.allProjects") },
                        )}
                        className="min-w-0 justify-start gap-1 font-normal text-foreground/55 hover:text-foreground"
                      >
                        <span className="truncate">{t("rail.allProjects")}</span>
                        <ChevronRight
                          className={cn(
                            "size-3.5 shrink-0 transition-transform",
                            (allProjectsOpen || dragItem?.kind === "project") && "rotate-90",
                          )}
                          aria-hidden="true"
                        />
                      </CollapsibleTrigger>
                    </div>
                    <CollapsibleContent data-default-project-content>
                      <SidebarDropZone
                        location={{ kind: "projects", sectionId: null }}
                        accept="project"
                        collisionPriority={rootProjects.length === 0 ? 2 : 0}
                      >
                        {({ ref, isDropTarget }) => (
                          <div
                            ref={ref}
                            data-project-list="root"
                            data-sidebar-drop-target={isDropTarget ? "true" : undefined}
                            className={cn(rootProjects.length === 0 && "min-h-control")}
                          >
                            {rootProjects.map(renderProject)}
                          </div>
                        )}
                      </SidebarDropZone>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              ) : null}
              {creatingSectionFor !== undefined ? (
                <div data-task-section-creation className="px-2 pb-1 pt-2">
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
                <SidebarDropZone
                  location={{ kind: "tasks", sectionId: null, projectPath: null }}
                  accept="task"
                >
                  {({ ref, isDropTarget }) => (
                <div
                  ref={ref}
                  data-unsectioned-tasks
                  data-sidebar-drop-target={isDropTarget ? "true" : undefined}
                  className={cn(
                    "flex flex-col gap-0.5 pt-1",
                    unsectioned.length === 0 && "min-h-control-mini",
                  )}
                >
                  {unsectioned.map((session) => sessionRow(session, false))}
                </div>
                  )}
                </SidebarDropZone>
              ) : null}
              {archived.length > 0 && (
                <Collapsible open={archivedOpen} onOpenChange={setArchivedOpen}>
                  <CollapsibleTrigger
                    render={<Button type="button" variant="ghost" size="compact" focusStyle="inset" />}
                    data-rail-archive-toggle
                    title={archivedOpen ? t("rail.hideArchived") : t("rail.showArchived")}
                    className="justify-start gap-1 font-normal text-foreground/55 hover:text-foreground"
                  >
                    <span>{t("rail.groupArchived")}</span>
                    <ChevronRight
                      className={cn(
                        "size-3.5 shrink-0 transition-transform",
                        archivedOpen && "rotate-90",
                      )}
                      aria-hidden="true"
                    />
                    <span className="font-normal text-foreground/40">{archived.length}</span>
                  </CollapsibleTrigger>
                  <CollapsibleContent data-rail-archive-list className="rail-archive-panel">
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
        className="flex min-h-control-field shrink-0 items-center gap-1 px-3 py-1.5"
      >
        <div data-rail-feature="settings">
          <RailUtilityButton label={t("header.settings")} onSelect={onOpenSettings}>
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
              <ActivityOrb state="searching" visualSize={14} aria-hidden="true" />
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
      </DragDropRoot>
    </aside>
  );
}
