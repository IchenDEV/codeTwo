import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  Blocks,
  CalendarClock,
  Check,
  CircleAlert,
  ChevronDown,
  ChevronRight,
  Copy,
  Folder,
  FolderOpen,
  FolderPlus,
  FolderX,
  Hash,
  PanelLeft,
  Pencil,
  Pin,
  Plus,
  Search,
  Settings,
  SquareKanban,
  SquarePen,
  Trash2,
} from "lucide-react";

import { openNativePath, providerLabel, type Project, type SessionInfo } from "../bridge";
import { ProviderIcon } from "../providers/ProviderIcon";
import { Button } from "@/components/ui/button";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useT } from "../i18n";
import { usePersistedBoolean } from "@/lib/persist";
import { cn } from "@/lib/utils";
import { sessionActivity, sessionProjectPath } from "../session/sessionEvents";
import { useToast } from "../ui/toast";

/** "3h", "2d", "5w" — the glanceable age on a row. Anything under a minute is "now". */
function shortAge(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h`;
  if (s < 7 * 86_400) return `${Math.floor(s / 86_400)}d`;
  return `${Math.floor(s / (7 * 86_400))}w`;
}

/**
 * The rail, four zones top to bottom:
 *
 * 1. Title — wordmark on the traffic-light line, with search directly below it.
 * 2. Features — the app's primary destinations as compact, labeled source-list rows.
 * 3. Recent chats — the active project's sessions, newest first, with the project itself as a
 *    switcher dropdown in the section header (selection, add, rename, remove all live there).
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
  pluginHubOpen,
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
  onNew: () => void;
  onRename: (id: string, title: string) => void;
  /** Keeps an active session above the recency list until explicitly unpinned. */
  onPin: (id: string, pinned: boolean) => void;
  /** Flips a session's archived state — true to archive, false to restore. */
  onArchive: (id: string, archived: boolean) => void;
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
  pluginHubOpen: boolean;
}) {
  const t = useT();
  const toast = useToast();
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null);
  const [renamingProject, setRenamingProject] = useState<string | null>(null);

  // Clamped on every render, not just while dragging, so a width saved on one display comes back
  // usable on another.
  const applied = Math.min(420, Math.max(220, width));
  const featureRowClass =
    "flex h-(--ds-control-field) w-full items-center gap-2.5 rounded-(--ds-radius-control) px-2.5 text-left text-ui text-foreground/80 transition-colors hover:bg-accent/55 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

  // A grip drag must track the pointer 1:1 — the collapse transition below would ease every
  // intermediate width instead, so it's dropped for the duration of the drag (the dock does the
  // same, for the same reason).
  const [dragging, setDragging] = useState(false);

  // `invisible` only after the collapse lands: a zero-width pane still paints its border as a
  // hairline, and hiding earlier would cut the animation off.
  const [gone, setGone] = useState(collapsed);
  useEffect(() => {
    if (!collapsed) {
      setGone(false);
      return;
    }
    const id = window.setTimeout(() => setGone(true), 340);
    return () => window.clearTimeout(id);
  }, [collapsed]);

  const startDrag = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startW = applied;
      const onMove = (ev: MouseEvent) =>
        onWidth(Math.round(Math.min(420, Math.max(220, startW + (ev.clientX - startX)))));
      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        document.body.classList.remove("resizing-h");
        setDragging(false);
      };
      document.body.classList.add("resizing-h");
      setDragging(true);
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [applied, onWidth],
  );

  const activeProjectName = projects.find((p) => p.path === activeProject)?.name ?? null;

  // "Recent" means what it says: the active project's sessions, newest first — per group.
  const forProject = useCallback(
    (list: SessionInfo[]) =>
      list
        .filter((s) => sessionProjectPath(s) === activeProject)
        .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.created_at - a.created_at),
    [activeProject],
  );
  const recent = useMemo(() => forProject(sessions), [forProject, sessions]);
  const archived = useMemo(() => forProject(archivedSessions), [forProject, archivedSessions]);
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
    <p className="px-2 pb-0.5 pt-2 text-cap font-semibold uppercase tracking-wider text-muted-foreground/80">
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
    // It carries no glanceable meaning and should not consume a whole rail line.
    const hasUsefulPreview = Boolean(preview && /[\p{L}\p{N}]/u.test(preview));

    const commitRename = () => {
      if (renaming?.id !== s.id) return;
      const title = renaming.title.trim();
      if (title && title !== s.title) onRename(s.id, title);
      setRenaming(null);
    };

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
      <ContextMenu key={s.id}>
        <ContextMenuTrigger
          render={
            <div
              data-session-id={s.id}
              data-session-density="comfortable"
              title={hasUsefulPreview ? preview : undefined}
              onContextMenu={(event) =>
                event.currentTarget
                  .querySelector<HTMLButtonElement>("[data-session-select]")
                  ?.focus({ preventScroll: true })
              }
              className={cn(
                "group relative cursor-default rounded-md px-2 py-2 outline-none transition-[background-color,box-shadow] hover:bg-accent/50 data-[popup-open]:bg-accent/70",
                s.id === activeSession && "bg-accent",
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
                        onArchive(s.id, !isArchived);
                      }}
                    >
                      {isArchived ? <ArchiveRestore /> : <Archive />}
                    </Button>
                  </span>
                </div>

                {/* 2 — latest conversation text; bounded so one long response cannot take the rail. */}
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
                    <span className="min-w-0 flex-1 line-clamp-2">{preview}</span>
                  </div>
                )}

                {/* 3 — assigned agent; the icon slot matches the title and status rows exactly. */}
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
                  <span className="min-w-0 truncate">{displayProvider(s.provider)}</span>
                </div>

                {/* 4 — state gets its own row instead of competing with the provider label. */}
                <div
                  data-session-line="status"
                  aria-label={statusLabel}
                  title={isFailed ? activity.message : undefined}
                  className={cn(
                    "mt-1 flex h-4 items-center gap-1.5 text-fine leading-4 text-muted-foreground",
                    isAwaitingInput && "text-warning",
                    isFailed && "text-destructive",
                    isRunning && "text-primary",
                  )}
                >
                  <span
                    data-session-icon-column
                    className="flex h-4 w-6 shrink-0 items-center justify-center"
                  >
                    {isAwaitingInput ? (
                      <span className="size-1.5 animate-pulse rounded-full bg-warning" />
                    ) : isFailed ? (
                      <CircleAlert className="size-3" />
                    ) : isRunning ? (
                      <span className="size-1.5 animate-pulse rounded-full bg-primary" />
                    ) : (
                      <Check className="size-3" />
                    )}
                  </span>
                  <span className="min-w-0 truncate">{statusLabel}</span>
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
            <ContextMenuItem
              onClick={() => {
                // Let Base UI finish restoring focus from the closing menu before the auto-focus
                // input mounts; otherwise that restoration immediately blurs and cancels rename.
                setTimeout(() => setRenaming({ id: s.id, title: s.title }), 0);
              }}
            >
              <Pencil />
              {t("rail.rename")}
            </ContextMenuItem>
            <ContextMenuItem onClick={() => onArchive(s.id, !isArchived)}>
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
      </ContextMenu>
    );
  };

  return (
    <aside
      aria-hidden={collapsed}
      className={cn(
        "glass-rail relative flex shrink-0 flex-col overflow-hidden",
        overlay && "fixed inset-y-0 left-0 z-50 shadow-2xl",
        !dragging && "transition-[width] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
        gone && "invisible",
      )}
      style={{ width: collapsed ? 0 : applied }}
    >
      {/* Pinned to the open width so the content doesn't reflow while the pane sweeps. */}
      <div className="flex min-h-0 flex-1 flex-col" style={{ width: applied }}>
      {!collapsed && <div className="rail-grip" onMouseDown={startDrag} title={t("rail.resize")} />}

      {/* ---- 1 · title ---------------------------------------------------------------------- */}
      {/* Keep the wordmark and controls centred in the same 48px title row as the main header,
          with enough clearance for the macOS traffic lights. */}
      <div
        data-tauri-drag-region
        className="flex shrink-0 items-center gap-1 py-2.5 pl-24 pr-3"
      >
        <span data-tauri-drag-region className="min-w-0 truncate text-heading font-semibold">
          {t("app.name")}
        </span>
        <div data-tauri-drag-region className="min-w-0 flex-1" />
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
      <div className="px-3 pb-2 pt-2">
        <button
          onClick={onOpenSearch}
          className="flex h-8 w-full min-w-0 items-center gap-2 rounded-lg border bg-background px-2.5 text-left text-ui text-muted-foreground shadow-[0_1px_2px_rgb(0_0_0/0.03)] transition-colors hover:bg-accent/50"
        >
          <Search className="size-3.5 shrink-0" />
          <span className="flex-1 truncate">{t("rail.searchLabel")}</span>
          {searchHint && (
            <kbd className="shrink-0 rounded border bg-fill-rest px-1 py-px font-mono text-cap text-muted-foreground/80">
              {searchHint}
            </kbd>
          )}
        </button>
      </div>

      {/* ---- 2 · features ------------------------------------------------------------------- */}
      <nav data-rail-features aria-label={t("rail.features")} className="flex flex-col gap-0.5 px-3 pb-2">
        <button
          data-rail-feature="new-session"
          className={featureRowClass}
          title={`${t("rail.newSession")} ${newHint}`}
          onClick={onNew}
        >
          <SquarePen className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0 flex-1 truncate">{t("rail.newSession")}</span>
          <span className="flex size-4 shrink-0 items-center justify-center rounded-full text-muted-foreground ring-1 ring-foreground/10">
            <Plus className="size-2.5" aria-hidden />
          </span>
        </button>
        <button
          data-rail-feature="task-board"
          aria-current={taskBoardOpen ? "page" : undefined}
          className={cn(featureRowClass, taskBoardOpen && "bg-accent font-medium text-foreground")}
          onClick={onOpenTaskBoard}
        >
          <SquareKanban className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0 flex-1 truncate">{t("taskboard.title")}</span>
        </button>
        <button
          data-rail-feature="scheduled-tasks"
          className={featureRowClass}
          onClick={onOpenAutomations}
        >
          <CalendarClock className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0 flex-1 truncate">{t("automations.tasks")}</span>
        </button>
        <button
          data-rail-feature="plugins"
          aria-current={pluginHubOpen ? "page" : undefined}
          aria-haspopup="dialog"
          className={cn(featureRowClass, pluginHubOpen && "bg-accent font-medium text-foreground")}
          onClick={onOpenMarket}
        >
          <Blocks className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0 flex-1 truncate">{t("pluginHub.plugins")}</span>
        </button>
        <button
          data-rail-feature="settings"
          className={featureRowClass}
          onClick={onOpenSettings}
        >
          <Settings className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0 flex-1 truncate">{t("header.settings")}</span>
        </button>
      </nav>

      {/* ---- 3 · recent chats --------------------------------------------------------------- */}
      {/* The section header carries the project switcher: which project's chats these are, and
          every project operation, behind one chip instead of a whole tree. */}
      <div className="flex items-center gap-1 px-4 pb-1 pt-3">
        <span className="shrink-0 px-2 text-fine font-medium uppercase tracking-wide text-muted-foreground">
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
                className="flex min-w-0 max-w-44 shrink items-center gap-1.5 rounded-md px-2 py-1 text-hint text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
                title={activeProject ?? undefined}
              >
                <Folder className="size-3.5 shrink-0" />
                <span className="truncate">{activeProjectName ?? t("rail.noProject")}</span>
                <ChevronDown className="size-3 shrink-0 opacity-50" />
              </button>}
            />
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuGroup>
                {projects.map((p) => (
                  <DropdownMenuItem key={p.path} onClick={() => onSelectProject(p.path)}>
                    <Folder className={cn(p.path === activeProject && "text-primary")} />
                    <span className="min-w-0 flex-1 truncate" title={p.path}>
                      {p.name}
                    </span>
                    <span className="shrink-0 text-fine text-muted-foreground">
                      {shortAge(p.last_opened_at)}
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
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

      <ScrollArea className="min-h-0 flex-1">
        <div data-session-list className="px-4 pb-4">
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
                  <div className="flex flex-col gap-2">{pinned.map((s) => sessionRow(s, false))}</div>
                </>
              )}
              {active.length > 0 && (
                <>
                  {groupLabel(t("rail.groupActive"))}
                  <div className="flex flex-col gap-2">{active.map((s) => sessionRow(s, false))}</div>
                </>
              )}
              {archived.length > 0 && (
                <>
                  {/* Same face as a group label, but it folds — archived rows only take space
                      (and attention) when asked for. */}
                  <button
                    aria-expanded={archivedOpen}
                    title={archivedOpen ? t("rail.hideArchived") : t("rail.showArchived")}
                    onClick={() => setArchivedOpen(!archivedOpen)}
                    className="flex w-full items-center gap-1 rounded px-2 pb-0.5 pt-2 text-cap font-semibold uppercase tracking-wider text-muted-foreground/80 transition-colors hover:text-foreground"
                  >
                    <span>{t("rail.groupArchived")}</span>
                    <span className="font-normal text-muted-foreground/60">{archived.length}</span>
                    <ChevronRight
                      className={cn("size-3 shrink-0 transition-transform", archivedOpen && "rotate-90")}
                    />
                  </button>
                  {archivedOpen && (
                    <div className="flex flex-col gap-2 opacity-80">
                      {archived.map((s) => sessionRow(s, true))}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </ScrollArea>

      </div>
    </aside>
  );
}
