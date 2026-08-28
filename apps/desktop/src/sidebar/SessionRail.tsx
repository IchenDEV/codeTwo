import {
  Children,
  cloneElement,
  isValidElement,
  useCallback,
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
  ChevronDown,
  ChevronRight,
  Copy,
  Folder,
  FolderOpen,
  FolderPlus,
  FolderX,
  GitPullRequest,
  Hash,
  MessageSquarePlus,
  PanelLeft,
  Pencil,
  Pin,
  Plus,
  Search,
  Settings,
  SquareKanban,
  SquarePen,
  Trash2,
} from "@/components/ui/icons";

import { openNativePath, providerLabel, type Project, type SessionInfo } from "../bridge";
import {
  nativeContextMenusAvailable,
  showNativeContextMenu,
  type NativeContextMenuItem,
} from "../container";
import { ProviderIcon } from "../providers/ProviderIcon";
import { NavigationRow } from "@/components/business/navigation-row";
import { QuotaProgress } from "@/components/business/quota-progress";
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
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuItemDescription,
  DropdownMenuItemText,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LiquidSelectionGroup } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useResizeHandle } from "@/components/ui/use-resize-handle";
import { useT } from "../i18n";
import { usePersistedBoolean } from "@/lib/persist";
import { cn } from "@/lib/utils";
import { sessionActivity, sessionProjectPath } from "../session/sessionEvents";
import type { QuickQuotaSummary } from "../usage/quickQuota";
import { useToast } from "../ui/toast";
import { ProjectIcon } from "../projects/ProjectIcon";

/** "3h", "2d", "5w" — the glanceable age on a row. Anything under a minute is "now". */
function shortAge(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h`;
  if (s < 7 * 86_400) return `${Math.floor(s / 86_400)}d`;
  return `${Math.floor(s / (7 * 86_400))}w`;
}

type ContextMenuTriggerElement = ReactElement<{
  render: ReactElement<HTMLAttributes<HTMLDivElement>>;
}>;

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
 * 3. Recent chats — the active project's sessions, newest first, with the project itself as a
 *    switcher dropdown in the section header (selection, add, rename, remove all live there).
 * 4. Utilities — quota and settings stay reachable at the bottom while recent chats scroll.
 * The active model remains available in the composer, where it can also be changed.
 */
export function SessionRail({
  projects,
  activeProject,
  onSelectProject,
  onAddProject,
  onRenameProject,
  onRemoveProject,
  sessions,
  archivedSessions,
  previews,
  activeSession,
  runningSessions,
  onSelect,
  onNew,
  onNewTemporary,
  sideChatOpen,
  onToggleSideChat,
  onRename,
  onPin,
  onArchive,
  onDiscardWorktree,
  displayProvider,
  onOpenMarket,
  onOpenAutomations,
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
}: {
  projects: Project[];
  activeProject: string | null;
  onSelectProject: (path: string) => void;
  onAddProject: () => void;
  onRenameProject: (path: string, name: string) => void;
  onRemoveProject: (path: string) => void;
  /** Every live session; the rail shows the active project's, newest first. */
  sessions: SessionInfo[];
  /** Archived sessions, shown as their own collapsible group below the live ones. */
  archivedSessions: SessionInfo[];
  /** Newest text per session id — shown as a bounded conversation summary below the title. */
  previews: Record<string, string>;
  activeSession: string | null;
  /** Every session with a turn in flight, including background sessions. */
  runningSessions: ReadonlySet<string>;
  onSelect: (id: string) => void;
  /** Opens the default Task-owned draft. */
  onNew: () => void;
  /** Explicit escape hatch for work the user does not want tracked as a Task. */
  onNewTemporary: () => void;
  /** App-lifetime quick chat that stays outside the tracked task list. */
  sideChatOpen: boolean;
  onToggleSideChat: () => void;
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
}) {
  const t = useT();
  const toast = useToast();
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null);
  const [renamingProject, setRenamingProject] = useState<string | null>(null);

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

  const activeProjectRecord = projects.find((p) => p.path === activeProject) ?? null;
  const activeProjectName = activeProjectRecord?.name ?? null;
  const runningProjectPaths = new Set(
    sessions
      .filter((session) =>
        runningSessions.has(session.id) || sessionActivity(session).state.kind === "running"
      )
      .map(sessionProjectPath),
  );

  // "Recent" follows deliberate re-entry into work, not background chunks or the original
  // creation date. Archived history keeps its stable creation order.
  const forProject = useCallback(
    (list: SessionInfo[], activeList: boolean) =>
      list
        .filter((s) => sessionProjectPath(s) === activeProject)
        .sort(
          (a, b) =>
            Number(b.pinned) - Number(a.pinned) ||
            (activeList
              ? (b.last_active_at ?? b.created_at) - (a.last_active_at ?? a.created_at)
              : b.created_at - a.created_at),
        ),
    [activeProject],
  );
  const recent = useMemo(() => forProject(sessions, true), [forProject, sessions]);
  const archived = useMemo(
    () => forProject(archivedSessions, false),
    [forProject, archivedSessions],
  );
  const pinned = useMemo(() => recent.filter((s) => s.pinned), [recent]);
  const active = useMemo(() => recent.filter((s) => !s.pinned), [recent]);

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

  /** Muted label over a group of rows — Active, Archived. */
  const groupLabel = (label: string) => (
    <p
      data-rail-group-label
      className="px-2 pb-1 pt-2 text-ui font-normal leading-4 text-foreground/55"
    >
      {label}
    </p>
  );

  /** One thread: title, optional latest-message summary, agent, and status on one icon axis. */
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

    const runContextMenuAction = (action: string) => {
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
                "group relative cursor-default rounded-control px-2 py-1.5 outline-none transition-[background-color,box-shadow] hover:bg-accent/50 data-[popup-open]:bg-accent/70",
                s.id === activeSession && "bg-fill-rest",
                s.id === activeSession && typeof ResizeObserver === "undefined" && "bg-fill-hover",
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
                className="absolute inset-0 z-0 h-auto rounded-(--ds-radius-control) p-0 hover:bg-transparent"
              />
              <div className="pointer-events-none relative z-10">
                {/* 1 — title, with the age (or the actions, on hover) at its shoulder */}
                <div data-session-line="title" className="flex h-6 items-center gap-1.5">
                  <span
                    data-session-icon-column
                    className="flex size-6 shrink-0 items-center justify-center"
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
                        <Pin />
                      </Button>
                    )}
                  </span>
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
                  <span className="shrink-0 text-fine leading-4 text-muted-foreground group-hover:hidden group-focus-within:hidden group-data-[popup-open]:hidden">
                    {shortAge(s.created_at)}
                  </span>
                  <span className="hidden shrink-0 gap-0.5 group-hover:flex group-focus-within:flex group-data-[popup-open]:flex">
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
                      <Pencil />
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
                      {isArchived ? <ArchiveRestore /> : <Archive />}
                    </Button>
                  </span>
                </div>

                {/* 2 — latest conversation text; one glanceable line keeps the rail scannable. */}
                {hasUsefulPreview && (
                  <div
                    id={`session-preview-${s.id}`}
                    data-session-line="preview"
                    className="mt-1 flex min-h-4 items-start gap-1.5 text-fine leading-4 text-muted-foreground"
                  >
                    <span
                      data-session-icon-column
                      aria-hidden="true"
                      className="h-4 w-6 shrink-0"
                    />
                    <span className="min-w-0 flex-1 truncate">{preview}</span>
                  </div>
                )}

                {/* 3 — assigned agent on the left, current state in the free space on the right. */}
                <div
                  data-session-line="provider"
                  className="mt-1 flex h-4 items-center gap-1.5 text-fine leading-4 text-muted-foreground"
                >
                  <span
                    data-session-icon-column
                    className="flex h-4 w-6 shrink-0 items-center justify-center"
                  >
                    <ProviderIcon
                      provider={providerLabel(s.provider)}
                      className="size-3 opacity-70"
                    />
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {displayProvider(s.provider)}
                  </span>
                  <span
                    data-session-line="status"
                    aria-label={statusLabel}
                    title={isFailed ? activity.message : undefined}
                    className={cn(
                      "ml-auto flex h-4 shrink-0 items-center gap-1.5 pl-2 text-fine leading-4 text-muted-foreground",
                      isAwaitingInput && "text-warning",
                      isFailed && "text-destructive",
                      isRunning && "text-primary",
                    )}
                  >
                    <span className="flex size-4 shrink-0 items-center justify-center">
                      {isAwaitingInput ? (
                        <span className="size-1.5 animate-pulse rounded-full bg-warning" />
                      ) : isFailed ? (
                        <CircleAlert className="size-3" />
                      ) : isRunning ? (
                        <ActivityOrb state="working" visualSize={14} aria-hidden="true" />
                      ) : (
                        <Check className="size-3" />
                      )}
                    </span>
                    <span className="min-w-0 truncate">{statusLabel}</span>
                  </span>
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
                  data-rail-quick-session
                  className="mr-1 size-control-mini rounded-control text-muted-foreground hover:bg-fill-hover hover:text-foreground group-hover/new-task:text-foreground"
                  aria-label={t("rail.newTemporarySession")}
                  onClick={onNewTemporary}
                >
                  <Plus className="size-3" aria-hidden />
                </Button>
              }
            />
            <TooltipContent side="right">{t("rail.newTemporarySession")}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  data-rail-side-chat
                  className={cn(
                    "mr-1 size-control-mini rounded-control text-muted-foreground hover:bg-fill-hover hover:text-foreground group-hover/new-task:text-foreground",
                    sideChatOpen && "bg-fill-hover text-foreground",
                  )}
                  aria-label={t("sideChat.toggle")}
                  aria-pressed={sideChatOpen}
                  onClick={onToggleSideChat}
                >
                  <MessageSquarePlus className="size-4" aria-hidden />
                </Button>
              }
            />
            <TooltipContent side="right">{t("sideChat.title")}</TooltipContent>
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

      {/* ---- 3 · recent chats --------------------------------------------------------------- */}
      {/* The section header carries the project switcher: which project's chats these are, and
          every project operation, behind one chip instead of a whole tree. */}
      <div className="flex items-center gap-1 px-2 pb-1 pt-2">
        <span
          data-rail-section-label="recent"
          className="shrink-0 px-2 text-ui font-normal leading-4 text-foreground/55"
        >
          {t("rail.recent")}
        </span>
        <div className="min-w-0 flex-1" />
        {renamingProject !== null && activeProject ? (
          <Input
            autoFocus
            className="h-6 w-36 text-hint"
            value={renamingProject}
            onChange={(e) => setRenamingProject(e.target.value)}
            onBlur={() => setRenamingProject(null)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onRenameProject(activeProject, renamingProject);
                setRenamingProject(null);
              } else if (e.key === "Escape") setRenamingProject(null);
            }}
          />
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<button
                data-rail-project-switcher
                className="flex min-w-0 max-w-44 shrink items-center gap-1.5 rounded-md px-2 py-1 text-ui leading-4 text-foreground/60 transition-colors hover:bg-accent/50 hover:text-foreground data-[popup-open]:bg-accent/70 data-[popup-open]:text-foreground"
                title={activeProject ?? undefined}
              >
                {activeProjectRecord ? (
                  <ProjectIcon project={activeProjectRecord} size={16} />
                ) : (
                  <Folder className="size-3.5 shrink-0" />
                )}
                <span className="truncate">{activeProjectName ?? t("rail.noProject")}</span>
                <ChevronDown className="size-3 shrink-0 opacity-50" />
              </button>}
            />
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuRadioGroup value={activeProject ?? undefined} onValueChange={onSelectProject}>
                {projects.map((p) => (
                  <DropdownMenuRadioItem key={p.path} value={p.path}>
                    <ProjectIcon
                      project={p}
                      size={20}
                      className={cn(p.path === activeProject && "text-primary ring-primary/35")}
                    />
                    <DropdownMenuItemText title={p.path}>
                      <span className="truncate">{p.name}</span>
                      <DropdownMenuItemDescription>{p.path}</DropdownMenuItemDescription>
                    </DropdownMenuItemText>
                    {runningProjectPaths.has(p.path) && (
                      <ActivityOrb
                        data-project-running=""
                        state="working"
                        visualSize={14}
                        aria-label={t("session.running")}
                        title={t("session.running")}
                      />
                    )}
                    <span className="shrink-0 text-fine text-muted-foreground">
                      {shortAge(p.last_opened_at)}
                    </span>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={onAddProject}>
                  <FolderPlus />
                  {t("rail.addProject")}
                </DropdownMenuItem>
                {activeProject && (
                  <>
                    <DropdownMenuItem onClick={() => setRenamingProject(activeProjectName ?? "")}>
                      <Pencil />
                      {t("rail.renameProject")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => onRemoveProject(activeProject)}
                    >
                      <Trash2 />
                      {t("rail.removeProject")}
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <ScrollArea data-rail-session-scroll className="min-h-0 flex-1">
        <LiquidSelectionGroup
          data-session-list
          activeSelector='[aria-current="page"]'
          fill="var(--color-fill-hover)"
          className="px-2 pb-4"
        >
          {projects.length === 0 ? (
            <p className="px-2 py-4 text-fine leading-relaxed text-muted-foreground">
              {t("rail.projectsEmpty")}
            </p>
          ) : recent.length === 0 && archived.length === 0 ? (
            <p className="px-2 py-3 text-fine leading-relaxed text-muted-foreground">
              {t("rail.empty")} {t("rail.emptyHint")}
            </p>
          ) : (
            <>
              {pinned.length > 0 && (
                <>
                  {groupLabel(t("rail.groupPinned"))}
                  <div className="flex flex-col gap-0.5">{pinned.map((s) => sessionRow(s, false))}</div>
                </>
              )}
              {active.length > 0 && (
                <>
                  {groupLabel(t("rail.groupActive"))}
                  <div className="flex flex-col gap-0.5">{active.map((s) => sessionRow(s, false))}</div>
                </>
              )}
              {archived.length > 0 && (
                <Collapsible open={archivedOpen} onOpenChange={setArchivedOpen}>
                  {/* Same face as a group label, but it folds — archived rows only take space
                      (and attention) when asked for. */}
                  <CollapsibleTrigger
                    data-rail-archive-toggle
                    title={archivedOpen ? t("rail.hideArchived") : t("rail.showArchived")}
                    className="flex w-full items-center gap-1 rounded px-2 pb-1 pt-2 text-ui font-normal leading-4 text-foreground/55 transition-colors hover:text-foreground"
                  >
                    <ChevronRight
                      className={cn("size-3.5 shrink-0 transition-transform", archivedOpen && "rotate-90")}
                    />
                    <span>{t("rail.groupArchived")}</span>
                    <span className="font-normal text-foreground/40">{archived.length}</span>
                  </CollapsibleTrigger>
                  <CollapsibleContent data-rail-archive-list className="rail-archive-panel">
                    <div className="flex flex-col gap-0.5">
                      {archived.map((s) => sessionRow(s, true))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}
            </>
          )}
        </LiquidSelectionGroup>
      </ScrollArea>

      {/* ---- 4 · utilities ------------------------------------------------------------------ */}
      <div data-rail-utilities className="flex shrink-0 flex-col gap-0.5 px-2 pb-2 pt-1.5">
        <div data-rail-feature="usage">
          <NavigationRow
            label={quickQuota ? quickQuotaWindow : t("quota.quick")}
            busy={quickQuotaLoading}
            accessibilityLabel={quickQuotaTitle}
            title={quickQuotaTitle}
            onSelect={onOpenUsage}
            leading={quickQuota ? (
              <span
                data-quota-provider={quickQuota.provider}
                className="flex size-4 shrink-0 items-center justify-center text-muted-foreground"
              >
                <ProviderIcon provider={quickQuota.provider} className="size-4" />
              </span>
            ) : (
              <ChartNoAxesColumn className="size-4" />
            )}
            meta={quickQuota ? (
              <span className="flex shrink-0 items-center gap-1.5">
                <QuotaProgress
                  density="rail"
                  label={t("quota.remainingLabel", { window: quickQuotaWindow })}
                  remainingPercent={quickQuota.remainingPercent}
                />
                <span className="w-7 text-right text-fine font-medium tabular-nums">
                  {quickQuota.remainingPercent}%
                </span>
              </span>
            ) : (
              <span className="shrink-0 text-fine tabular-nums text-muted-foreground">
                {quickQuotaLoading ? (
                  <ActivityOrb state="searching" visualSize={14} aria-hidden="true" />
                ) : "—"}
              </span>
            )}
          />
        </div>
        <div data-rail-feature="settings">
          <NavigationRow
            label={t("header.settings")}
            leading={<Settings className="size-4" />}
            onSelect={onOpenSettings}
          />
        </div>
      </div>
      </div>
    </aside>
  );
}
