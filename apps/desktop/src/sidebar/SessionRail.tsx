import {
  Children,
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  Archive,
  ArchiveRestore,
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
  GitPullRequest,
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

import { openNativePath, type Project, type SessionInfo } from "../bridge";
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
  renameSidebarTaskSection,
  saveSidebarTaskSections,
  setSidebarTaskSectionCollapsed,
  type SidebarTaskSection,
} from "./sidebarSections";

type ContextMenuTriggerElement = ReactElement<{
  render: ReactElement<HTMLAttributes<HTMLDivElement>>;
}>;

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
 * 3. Tasks — one cross-Project feed with optional user Sections and automatic Highlight.
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
}: {
  projects: Project[];
  /** Every live Task session; the rail shows one cross-Project feed, newest first. */
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
}) {
  const t = useT();
  const toast = useToast();
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null);
  const [taskSections, setTaskSections] = useState(() =>
    loadSidebarTaskSections(typeof localStorage === "undefined" ? null : localStorage),
  );
  const [creatingSectionFor, setCreatingSectionFor] = useState<string | undefined>();
  const [sectionDraft, setSectionDraft] = useState("");
  const [renamingSection, setRenamingSection] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    saveSidebarTaskSections(
      typeof localStorage === "undefined" ? null : localStorage,
      taskSections,
    );
  }, [taskSections]);

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
  const belongsInHighlight = useCallback(
    (session: SessionInfo) => {
      if (assignedSection(session)) return false;
      const kind = sessionActivity(session).state.kind;
      return session.pinned || runningSessions.has(session.id) ||
        kind === "running" || kind === "awaiting_input" || kind === "failed";
    },
    [assignedSection, runningSessions],
  );
  const highlighted = useMemo(
    () => recent.filter(belongsInHighlight),
    [belongsInHighlight, recent],
  );
  const unsectioned = useMemo(
    () => recent.filter((session) => !assignedSection(session) && !belongsInHighlight(session)),
    [assignedSection, belongsInHighlight, recent],
  );
  const sectionRows = useMemo(
    () => new Map(taskSections.sections.map((section) => [
      section.id,
      recent.filter((session) => assignedSection(session) === section.id),
    ])),
    [assignedSection, recent, taskSections.sections],
  );

  // Folded by default: archived threads are reference material, not the working set, so they
  // shouldn't compete with the live rows for attention. The fold survives a restart.
  const [archivedOpen, setArchivedOpen] = usePersistedBoolean("rail.archivedOpen", false);
  const [highlightOpen, setHighlightOpen] = usePersistedBoolean("rail.highlightOpen", true);

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
    setCreatingSectionFor(taskId);
  }, []);

  const commitSectionCreation = useCallback(() => {
    const name = sectionDraft.trim();
    if (name) {
      const id = `section:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
      setTaskSections((current) =>
        createSidebarTaskSection(current, name, id, creatingSectionFor),
      );
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

  /** One quiet source-list row: task title, workspace identity, and only actionable status. */
  const sessionRow = (s: SessionInfo, isArchived: boolean) => {
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
    // preview that merely restates the title, which is typical of single-prompt threads.
    const hasUsefulPreview = Boolean(
      preview && /[\p{L}\p{N}]/u.test(preview) && preview !== s.title.trim(),
    );
    const workspacePath = s.project_path ?? s.worktree_path ?? s.cwd;
    const workspaceName = (s.project_path ? projectNames.get(s.project_path) : null)
      ?? workspacePath.split(/[\\/]/).filter(Boolean).pop()
      ?? workspacePath;

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
      <SessionContextMenu
        key={s.id}
        items={nativeMenuItems}
        onAction={runContextMenuAction}
      >
        <ContextMenuTrigger
          render={
            <div
              data-session-id={s.id}
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
                "group relative cursor-default rounded-control px-2 py-1.5 outline-none transition-shadow hover:bg-fill-quiet focus-within:bg-fill-quiet data-[popup-open]:bg-fill-hover",
                s.id === activeSession && "bg-fill-hover",
              )}
            >
              <Button
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
              <div className="pointer-events-none relative z-10">
                {/* Title owns the row. Routine controls appear on demand. */}
                <div data-session-line="title" className="flex h-control-mini items-center gap-1.5">
                  {renaming?.id === s.id ? (
                    <Input
                      autoFocus
                      size="compact"
                      className="pointer-events-auto relative z-10 h-(--ds-control-mini) flex-1 text-ui leading-4"
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
                        "min-w-0 flex-1 truncate text-ui leading-4",
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
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        title={s.pinned ? t("rail.unpin") : t("rail.pin")}
                        aria-label={s.pinned ? t("rail.unpin") : t("rail.pin")}
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
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      title={t("rail.rename")}
                      aria-label={t("rail.rename")}
                      className="pointer-events-auto relative z-10 text-muted-foreground hover:text-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
                        setRenaming({ id: s.id, title: s.title });
                      }}
                    >
                      <Pencil data-icon="inline-start" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      title={isArchived ? t("rail.unarchive") : t("rail.archive")}
                      aria-label={isArchived ? t("rail.unarchive") : t("rail.archive")}
                      className="pointer-events-auto relative z-10 text-muted-foreground hover:text-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
                        requestArchive(s.id, !isArchived);
                      }}
                    >
                      {isArchived
                        ? <ArchiveRestore data-icon="inline-start" />
                        : <Archive data-icon="inline-start" />}
                    </Button>
                  </span>
                </div>

                {hasUsefulPreview && (
                  <div
                    id={`session-preview-${s.id}`}
                    data-session-line="preview"
                    className="mt-0.5 h-4 truncate text-fine leading-4 text-muted-foreground"
                  >
                    {preview}
                  </div>
                )}

                {/* Workspace identity closes the hierarchy; provider and completed state stay quiet. */}
                <div
                  data-session-line="workspace"
                  className="mt-0.5 flex h-4 items-center gap-1.5 text-fine leading-4 text-muted-foreground"
                >
                  <Folder className="size-3 shrink-0 opacity-70" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{workspaceName}</span>
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
    );
  };

  const renderManualSection = (section: SidebarTaskSection) => {
    const open = !section.collapsed;
    const rows = sectionRows.get(section.id) ?? [];
    return (
      <Collapsible
        key={section.id}
        open={open}
        onOpenChange={(nextOpen) =>
          setTaskSections((current) =>
            setSidebarTaskSectionCollapsed(current, section.id, !nextOpen),
          )
        }
      >
        <div
          data-task-section-header={section.id}
          className="group/section flex min-h-control-mini items-center pr-2 pb-1 pt-2"
        >
          {renamingSection?.id === section.id ? (
            <Input
              autoFocus
              size="compact"
              aria-label={t("rail.sectionName")}
              className="h-control-mini min-w-0 flex-1 text-ui"
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
            <CollapsibleTrigger
              data-task-section-toggle={section.id}
              title={t(open ? "rail.hideSection" : "rail.showSection", { name: section.name })}
              className="flex min-w-0 items-center gap-1 rounded-control px-2 text-ui font-normal leading-4 text-foreground/55 outline-none transition-colors hover:text-foreground focus-visible:focus-ring-inset"
            >
              <span className="truncate">{section.name}</span>
              <ChevronRight
                className={cn("size-3.5 shrink-0 transition-transform", open && "rotate-90")}
                aria-hidden="true"
              />
            </CollapsibleTrigger>
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
                {t("rail.renameSection")}
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onClick={() =>
                  setTaskSections((current) => deleteSidebarTaskSection(current, section.id))
                }
              >
                <Trash2 />
                {t("rail.deleteSection")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <CollapsibleContent data-task-section-content={section.id}>
          {rows.length > 0 ? (
            <div className="flex flex-col gap-0.5">{rows.map((row) => sessionRow(row, false))}</div>
          ) : (
            <p className="px-2 py-1.5 text-fine text-foreground/35">{t("rail.sectionEmpty")}</p>
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
        gone && "invisible",
      )}
      style={{ width: collapsed ? 0 : applied }}
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
          lights. Search gets a full-width launcher below; all panes share the same 40px baseline. */}
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

      <button
        type="button"
        data-rail-search
        className="mx-2 mb-1 flex h-control shrink-0 items-center gap-2 rounded-control bg-fill-quiet px-2 text-left text-ui text-muted-foreground outline-none transition-colors hover:bg-fill-hover hover:text-foreground focus-visible:focus-ring"
        aria-label={t("rail.searchChats")}
        onClick={onOpenSearch}
      >
        <Search className="size-3.5 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 truncate">{t("rail.searchChats")}</span>
        {searchHint ? (
          <kbd className="shrink-0 rounded-micro bg-background/45 px-1.5 py-0.5 font-mono text-fine leading-4 text-muted-foreground">
            {searchHint}
          </kbd>
        ) : null}
      </button>

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
          <button
            className="flex h-full min-w-0 flex-1 items-center gap-2 rounded-control pl-2 pr-1 text-left text-ui outline-none focus-visible:focus-ring-inset"
            title={`${t("rail.newTask")} ${newHint}`}
            onClick={onNew}
          >
            <SquarePen className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="min-w-0 flex-1 truncate">{t("rail.newTask")}</span>
          </button>
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
          {recent.length === 0 && archived.length === 0 &&
          taskSections.sections.length === 0 && creatingSectionFor === undefined ? (
            <p className="px-2 py-3 text-fine leading-relaxed text-muted-foreground">
              {t("rail.empty")} {t("rail.emptyHint")}
            </p>
          ) : (
            <>
              {highlighted.length > 0 && (
                <Collapsible open={highlightOpen} onOpenChange={setHighlightOpen}>
                  <CollapsibleTrigger
                    data-task-section-toggle="system:highlight"
                    title={t(highlightOpen ? "rail.hideSection" : "rail.showSection", {
                      name: t("rail.highlight"),
                    })}
                    className="flex items-center gap-1 rounded-control px-2 pb-1 pt-2 text-ui font-normal leading-4 text-foreground/55 outline-none transition-colors hover:text-foreground focus-visible:focus-ring-inset"
                  >
                    <span>{t("rail.highlight")}</span>
                    <ChevronRight
                      className={cn(
                        "size-3.5 shrink-0 transition-transform",
                        highlightOpen && "rotate-90",
                      )}
                      aria-hidden="true"
                    />
                  </CollapsibleTrigger>
                  <CollapsibleContent data-task-section-content="system:highlight">
                    <div className="flex flex-col gap-0.5">
                      {highlighted.map((session) => sessionRow(session, false))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}
              {taskSections.sections.map(renderManualSection)}
              {creatingSectionFor !== undefined ? (
                <div data-task-section-creation className="px-2 pb-1 pt-2">
                  <Input
                    autoFocus
                    size="compact"
                    aria-label={t("rail.sectionName")}
                    placeholder={t("rail.sectionName")}
                    className="h-control-mini text-ui"
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
              {unsectioned.length > 0 ? (
                <div data-unsectioned-tasks className="flex flex-col gap-0.5 pt-1">
                  {unsectioned.map((session) => sessionRow(session, false))}
                </div>
              ) : null}
              {archived.length > 0 && (
                <Collapsible open={archivedOpen} onOpenChange={setArchivedOpen}>
                  <CollapsibleTrigger
                    data-rail-archive-toggle
                    title={archivedOpen ? t("rail.hideArchived") : t("rail.showArchived")}
                    className="flex items-center gap-1 rounded-control px-2 pb-1 pt-2 text-ui font-normal leading-4 text-foreground/55 outline-none transition-colors hover:text-foreground focus-visible:focus-ring-inset"
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
    </aside>
  );
}
