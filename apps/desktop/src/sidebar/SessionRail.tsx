import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  Check,
  ChevronDown,
  Folder,
  FolderPlus,
  PanelLeft,
  Pencil,
  Search,
  Settings,
  SquarePen,
  Store,
  Trash2,
} from "lucide-react";

import { providerLabel, type GitStatus, type Project, type SessionInfo } from "../bridge";
import { ProviderIcon } from "../providers/ProviderIcon";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useT } from "../i18n";
import { cn } from "@/lib/utils";

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
 * The rail, three zones top to bottom:
 *
 * 1. Title — wordmark on the traffic-light line, search + compose under it.
 * 2. Recent chats — the active project's sessions, newest first, with the project itself as a
 *    switcher dropdown in the section header (selection, add, rename, remove all live there).
 * 3. Status — the model this session runs on, and a small table of the working tree: branch,
 *    +/− lines, and file status. The table is the click-through to source control.
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
  running,
  onSelect,
  onNew,
  onRename,
  onArchive,
  displayProvider,
  model,
  provider,
  git,
  diffStat,
  onOpenSourceControl,
  onOpenMarket,
  newHint,
  searchHint,
  onOpenSearch,
  onOpenSettings,
  collapsed,
  onToggleCollapse,
  width,
  onWidth,
}: {
  projects: Project[];
  activeProject: string | null;
  onSelectProject: (path: string) => void;
  onAddProject: () => void;
  onRenameProject: (path: string, name: string) => void;
  onRemoveProject: (path: string) => void;
  /** Every live session; the rail shows the active project's, newest first. */
  sessions: SessionInfo[];
  /** Archived sessions, shown as their own labelled group below the live ones. */
  archivedSessions: SessionInfo[];
  /** Newest text per session id — the row's description line. */
  previews: Record<string, string>;
  activeSession: string | null;
  /** Whether the active session has a turn in flight. */
  running: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => void;
  /** Flips a session's archived state — true to archive, false to restore. */
  onArchive: (id: string, archived: boolean) => void;
  /** The provider a session runs on, as its display name — the row's agent line. */
  displayProvider: (p: SessionInfo["provider"]) => string;
  /** The model the next turn runs on — the agent's current pick, or the provider's name. */
  model: string;
  provider: string;
  git: GitStatus | null;
  /** Working-tree +/− line counts, parsed from the diff alongside the status. */
  diffStat: { added: number; deleted: number };
  onOpenSourceControl: () => void;
  onOpenMarket: () => void;
  newHint: string;
  /** The palette's shortcut, shown in the search box. */
  searchHint: string;
  onOpenSearch: () => void;
  onOpenSettings: () => void;
  /** Collapsed: the rail animates to zero width; the main header grows an expand button. */
  collapsed: boolean;
  onToggleCollapse: () => void;
  /** Rail width in px — dragged by the right-edge grip, persisted by the caller. */
  width: number;
  onWidth: (n: number) => void;
}) {
  const t = useT();
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null);
  const [renamingProject, setRenamingProject] = useState<string | null>(null);

  // Clamped on every render, not just while dragging, so a width saved on one display comes back
  // usable on another.
  const applied = Math.min(420, Math.max(220, width));

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
      list.filter((s) => s.cwd === activeProject).sort((a, b) => b.created_at - a.created_at),
    [activeProject],
  );
  const recent = useMemo(() => forProject(sessions), [forProject, sessions]);
  const archived = useMemo(() => forProject(archivedSessions), [forProject, archivedSessions]);

  /** Muted label over a group of rows — Active, Archived. */
  const groupLabel = (label: string) => (
    <p className="px-2 pb-0.5 pt-2 text-cap font-semibold uppercase tracking-wider text-muted-foreground/80">
      {label}
    </p>
  );

  /**
   * One thread, three lines: what it's called, the last thing said, and who's working it —
   * with the live/finished state spelled out rather than implied.
   */
  const sessionRow = (s: SessionInfo, isArchived: boolean) => {
    const isRunning = s.id === activeSession && running;
    return (
      <div
        key={s.id}
        onClick={() => onSelect(s.id)}
        className={cn(
          "group cursor-pointer rounded-md px-2 py-1.5 transition-colors hover:bg-accent/50",
          s.id === activeSession && "bg-accent",
        )}
      >
        {/* 1 — title, with the age (or the actions, on hover) at its shoulder */}
        <div className="flex items-center gap-2">
          {renaming?.id === s.id ? (
            <Input
              autoFocus
              className="h-6 flex-1 text-ui"
              value={renaming.title}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setRenaming({ id: s.id, title: e.target.value })}
              onBlur={() => setRenaming(null)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  onRename(s.id, renaming.title);
                  setRenaming(null);
                } else if (e.key === "Escape") setRenaming(null);
              }}
            />
          ) : (
            <span className={cn("min-w-0 flex-1 truncate text-ui", s.id === activeSession && "font-medium")}>
              {s.title}
            </span>
          )}
          <span className="shrink-0 text-fine text-muted-foreground group-hover:hidden">
            {shortAge(s.created_at)}
          </span>
          <span className="hidden shrink-0 gap-0.5 group-hover:flex">
            <button
              title={t("rail.rename")}
              className="rounded p-0.5 text-muted-foreground hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                setRenaming({ id: s.id, title: s.title });
              }}
            >
              <Pencil className="size-3" />
            </button>
            <button
              title={isArchived ? t("rail.unarchive") : t("rail.archive")}
              className="rounded p-0.5 text-muted-foreground hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                onArchive(s.id, !isArchived);
              }}
            >
              {isArchived ? <ArchiveRestore className="size-3" /> : <Archive className="size-3" />}
            </button>
          </span>
        </div>

        {/* 2 — the last thing said, so two "Untitled session" rows are tellable apart */}
        <div className="truncate text-fine leading-snug text-muted-foreground/80">
          {previews[s.id] ?? t("session.noMessages")}
        </div>

        {/* 3 — the assigned agent, and whether it's still at work */}
        <div className="flex items-center gap-1.5 pt-0.5 text-fine text-muted-foreground">
          <ProviderIcon provider={providerLabel(s.provider)} className="size-3 shrink-0 opacity-70" />
          <span className="min-w-0 truncate">{displayProvider(s.provider)}</span>
          <span className="min-w-0 flex-1" />
          {isRunning ? (
            <span className="flex shrink-0 items-center gap-1 text-primary">
              <span className="size-1.5 animate-pulse rounded-full bg-primary" />
              {t("session.running")}
            </span>
          ) : (
            <span className="flex shrink-0 items-center gap-1">
              <Check className="size-3" />
              {t("session.completed")}
            </span>
          )}
        </div>
      </div>
    );
  };

  const dirty = git?.is_repo ? git.files.length : 0;
  const staged = git?.is_repo ? git.files.filter((f) => f.staged).length : 0;

  return (
    <aside
      aria-hidden={collapsed}
      className={cn(
        "glass-rail relative flex shrink-0 flex-col overflow-hidden",
        !dragging && "transition-[width] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
        gone && "invisible",
      )}
      style={{ width: collapsed ? 0 : applied }}
    >
      {/* Pinned to the open width so the content doesn't reflow while the pane sweeps. */}
      <div className="flex min-h-0 flex-1 flex-col" style={{ width: applied }}>
      {!collapsed && <div className="rail-grip" onMouseDown={startDrag} title={t("rail.resize")} />}

      {/* ---- 1 · title ---------------------------------------------------------------------- */}
      {/* h-10 centres the row on the 20px line the traffic lights sit on. */}
      <div data-tauri-drag-region className="flex h-10 shrink-0 items-center gap-1 pl-[78px] pr-2">
        <span data-tauri-drag-region className="min-w-0 truncate text-ui font-semibold">
          {t("app.name")}
        </span>
        <div data-tauri-drag-region className="min-w-0 flex-1" />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 shrink-0 text-muted-foreground"
              aria-label={t("rail.collapse")}
              onClick={onToggleCollapse}
            >
              <PanelLeft className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">{t("rail.collapse")}</TooltipContent>
        </Tooltip>
      </div>
      <div className="flex items-center gap-1.5 px-3 pb-1 pt-2">
        <button
          onClick={onOpenSearch}
          className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg border bg-background px-2.5 text-left text-ui text-muted-foreground shadow-[0_1px_2px_rgb(0_0_0/0.03)] transition-colors hover:bg-accent/50"
        >
          <Search className="size-3.5 shrink-0" />
          <span className="flex-1 truncate">{t("rail.searchLabel")}</span>
          {searchHint && (
            <kbd className="shrink-0 rounded border bg-fill-rest px-1 py-px font-mono text-cap text-muted-foreground/80">
              {searchHint}
            </kbd>
          )}
        </button>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 shrink-0"
              aria-label={t("rail.newSession")}
              onClick={onNew}
            >
              <SquarePen className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">
            {t("rail.newSession")} <span className="ml-1 opacity-60">{newHint}</span>
          </TooltipContent>
        </Tooltip>
      </div>

      {/* ---- 2 · recent chats --------------------------------------------------------------- */}
      {/* The section header carries the project switcher: which project's chats these are, and
          every project operation, behind one chip instead of a whole tree. */}
      <div className="flex items-center gap-1 px-3 pb-0.5 pt-2">
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
            <DropdownMenuTrigger asChild>
              <button
                className="flex min-w-0 max-w-44 shrink items-center gap-1.5 rounded-md px-2 py-1 text-hint text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
                title={activeProject ?? undefined}
              >
                <Folder className="size-3.5 shrink-0" />
                <span className="truncate">{activeProjectName ?? t("rail.noProject")}</span>
                <ChevronDown className="size-3 shrink-0 opacity-50" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              {projects.map((p) => (
                <DropdownMenuItem key={p.path} onSelect={() => onSelectProject(p.path)}>
                  <Folder className={cn(p.path === activeProject && "text-primary")} />
                  <span className="min-w-0 flex-1 truncate" title={p.path}>
                    {p.name}
                  </span>
                  <span className="shrink-0 text-fine text-muted-foreground">
                    {shortAge(p.last_opened_at)}
                  </span>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onAddProject}>
                <FolderPlus />
                {t("rail.addProject")}
              </DropdownMenuItem>
              {activeProject && (
                <>
                  <DropdownMenuItem onSelect={() => setRenamingProject(activeProjectName ?? "")}>
                    <Pencil />
                    {t("rail.renameProject")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onSelect={() => onRemoveProject(activeProject)}
                  >
                    <Trash2 />
                    {t("rail.removeProject")}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="px-3 pb-3">
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
              {recent.length > 0 && (
                <>
                  {groupLabel(t("rail.groupActive"))}
                  <div className="space-y-px">{recent.map((s) => sessionRow(s, false))}</div>
                </>
              )}
              {archived.length > 0 && (
                <>
                  {groupLabel(t("rail.groupArchived"))}
                  <div className="space-y-px opacity-80">
                    {archived.map((s) => sessionRow(s, true))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </ScrollArea>

      {/* ---- 3 · the model, and the working tree at a glance -------------------------------- */}
      <div className="border-t border-sidebar-border px-3 pb-2.5 pt-2">
        <div className="flex items-center gap-2 px-1 pb-1.5">
          <ProviderIcon provider={provider} className="size-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate text-ui font-medium" title={t("composer.model")}>
            {model}
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 shrink-0 text-muted-foreground"
                onClick={onOpenMarket}
              >
                <Store className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("composer.market")}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 shrink-0 text-muted-foreground"
                onClick={onOpenSettings}
              >
                <Settings className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("header.settings")}</TooltipContent>
          </Tooltip>
        </div>

        {git?.is_repo && (
          <button
            onClick={onOpenSourceControl}
            className="w-full rounded-lg border bg-background px-2.5 py-1.5 text-left transition-colors hover:bg-accent/50"
            title={t("action.open_source_control")}
          >
            <table className="w-full border-collapse text-fine">
              <tbody>
                <tr>
                  <td className="py-0.5 pr-2 text-muted-foreground">{t("rail.branch")}</td>
                  <td className="max-w-0 truncate py-0.5 text-right font-mono">
                    {git.branch}
                    {git.ahead > 0 && <span className="ml-1 text-primary">↑{git.ahead}</span>}
                    {git.behind > 0 && <span className="ml-1 text-primary">↓{git.behind}</span>}
                  </td>
                </tr>
                <tr>
                  <td className="py-0.5 pr-2 text-muted-foreground">{t("rail.changes")}</td>
                  <td className="py-0.5 text-right font-mono">
                    <span className="text-success">+{diffStat.added}</span>{" "}
                    <span className="text-destructive">−{diffStat.deleted}</span>
                  </td>
                </tr>
                <tr>
                  <td className="py-0.5 pr-2 text-muted-foreground">{t("rail.status")}</td>
                  <td className="truncate py-0.5 text-right">
                    {dirty === 0
                      ? t("rail.clean")
                      : staged > 0
                        ? `${t("rail.changedCount", { count: dirty })} · ${t("rail.stagedCount", { count: staged })}`
                        : t("rail.changedCount", { count: dirty })}
                  </td>
                </tr>
              </tbody>
            </table>
          </button>
        )}
      </div>
      </div>
    </aside>
  );
}
