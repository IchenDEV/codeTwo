import { useMemo, useState } from "react";
import {
  Archive,
  Folder,
  FolderOpen,
  FolderPlus,
  Pencil,
  Plus,
  Search,
  Settings,
  SquarePen,
  Store,
  Trash2,
} from "lucide-react";

import { providerLabel, type Project, type SessionInfo, type SkillInfo } from "../bridge";
import { ProviderIcon } from "../providers/ProviderIcon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useT } from "../i18n";
import { cn } from "@/lib/utils";

/** "3h", "2d", "5w" — the glanceable age on a project row. Anything under a minute is "now". */
function shortAge(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h`;
  if (s < 7 * 86_400) return `${Math.floor(s / 86_400)}d`;
  return `${Math.floor(s / (7 * 86_400))}w`;
}

/**
 * The rail as a project tree: search and compose on top, every project listed with the active
 * one's conversations nested under it, and settings anchored at the bottom. One glance answers
 * where you are, what you've been doing there, and where everything else is.
 */
export function SessionRail({
  projects,
  activeProject,
  onSelectProject,
  onAddProject,
  onRenameProject,
  onRemoveProject,
  sessions,
  activeSession,
  previews,
  running,
  onSelect,
  onNew,
  onRename,
  onArchive,
  displayProvider,
  skills,
  onOpenMarket,
  onNewSkill,
  newHint,
  searchHint,
  onOpenSearch,
  onOpenSettings,
  status,
}: {
  projects: Project[];
  activeProject: string | null;
  onSelectProject: (path: string) => void;
  onAddProject: () => void;
  onRenameProject: (path: string, name: string) => void;
  onRemoveProject: (path: string) => void;
  /** Every session; the rail groups them under their project by cwd. */
  sessions: SessionInfo[];
  activeSession: string | null;
  /** Newest text per session id — row 2. */
  previews: Record<string, string>;
  /** Whether the active session has a turn in flight — row 3. */
  running: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => void;
  onArchive: (id: string) => void;
  displayProvider: (p: SessionInfo["provider"]) => string;
  skills: SkillInfo[];
  onOpenMarket: () => void;
  onNewSkill: () => void;
  newHint: string;
  /** The palette's shortcut, shown in the search pill. */
  searchHint: string;
  onOpenSearch: () => void;
  onOpenSettings: () => void;
  /** Foot-of-rail line: which provider is live. */
  status: React.ReactNode;
}) {
  const t = useT();
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null);
  const [renamingProject, setRenamingProject] = useState<{ path: string; name: string } | null>(null);

  // A session belongs to whichever project its cwd is — a filter, not a stored relation.
  const byProject = useMemo(() => {
    const map = new Map<string, SessionInfo[]>();
    for (const s of sessions) {
      const list = map.get(s.cwd);
      if (list) list.push(s);
      else map.set(s.cwd, [s]);
    }
    return map;
  }, [sessions]);

  const sessionRow = (s: SessionInfo) => (
    <div
      key={s.id}
      onClick={() => onSelect(s.id)}
      className={cn(
        "group cursor-pointer rounded-md px-2 py-1.5 transition-colors hover:bg-accent",
        s.id === activeSession && "bg-accent",
      )}
    >
      {/* 1 — the session's name */}
      {renaming?.id === s.id ? (
        <Input
          autoFocus
          className="h-6 text-[13px]"
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
        <div
          className={cn("truncate text-[13px] font-medium", s.id === activeSession && "text-primary")}
        >
          {s.title}
        </div>
      )}

      {/* 2 — the last thing said, so the title isn't the only way to tell two
             "Untitled session" rows apart */}
      <div className="truncate text-[11px] leading-snug text-muted-foreground/80">
        {previews[s.id] ?? t("session.noMessages")}
      </div>

      {/* 3 — what it's doing and what it's running on */}
      <div className="flex items-center gap-1 pt-0.5 text-[11px] text-muted-foreground">
        {s.id === activeSession && running ? (
          <>
            <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-primary" />
            <span className="shrink-0 text-primary">{t("session.running")}</span>
          </>
        ) : (
          <ProviderIcon provider={providerLabel(s.provider)} className="size-3 shrink-0 opacity-70" />
        )}
        <span className="truncate">{displayProvider(s.provider)}</span>
        {s.worktree_path && (
          <Badge variant="secondary" className="h-4 px-1 text-[9px]">
            wt
          </Badge>
        )}
        <span className="ml-auto hidden shrink-0 gap-0.5 group-hover:flex">
          <button
            title={t("rail.rename")}
            className="rounded p-0.5 hover:text-primary"
            onClick={(e) => {
              e.stopPropagation();
              setRenaming({ id: s.id, title: s.title });
            }}
          >
            <Pencil className="size-3" />
          </button>
          <button
            title={t("rail.archive")}
            className="rounded p-0.5 hover:text-primary"
            onClick={(e) => {
              e.stopPropagation();
              onArchive(s.id);
            }}
          >
            <Archive className="size-3" />
          </button>
        </span>
      </div>
    </div>
  );

  return (
    <aside className="glass-rail flex w-72 min-w-72 flex-col border-r">
      {/* ---- search + compose ------------------------------------------------------------- */}
      {/* pt-7 clears the macOS traffic lights, which float over this row under the overlay title
          bar. That bar is transparent, so this row is also what drags the window. */}
      <div data-tauri-drag-region className="flex items-center gap-1.5 px-3 pb-1.5 pt-7">
        <button
          onClick={onOpenSearch}
          className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg bg-foreground/[0.05] px-2.5 text-left text-[13px] text-muted-foreground transition-colors hover:bg-accent"
        >
          <Search className="size-3.5 shrink-0" />
          <span className="flex-1 truncate">{t("rail.searchLabel")}</span>
          {searchHint && (
            <kbd className="shrink-0 rounded border border-border/70 px-1 py-px font-mono text-[10px] text-muted-foreground/80">
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

      {/* ---- all projects ----------------------------------------------------------------- */}
      <div className="flex items-center gap-2 px-3 pb-0.5 pt-1.5">
        <div className="flex min-w-0 flex-1 items-center gap-2 px-2 text-[13px] font-medium">
          <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{t("rail.allProjects")}</span>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-6 shrink-0 text-muted-foreground"
              aria-label={t("rail.addProject")}
              onClick={onAddProject}
            >
              <FolderPlus className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">{t("rail.addProject")}</TooltipContent>
        </Tooltip>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="px-2 pb-3">
          {projects.length === 0 ? (
            <p className="px-3 py-4 text-[11px] leading-relaxed text-muted-foreground">
              {t("rail.projectsEmpty")}
            </p>
          ) : (
            projects.map((p) => {
              const isActive = p.path === activeProject;
              const list = byProject.get(p.path) ?? [];
              return (
                <div key={p.path} className="mb-0.5">
                  {/* the project */}
                  <div
                    onClick={() => onSelectProject(p.path)}
                    className={cn(
                      "group flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-accent",
                      isActive && "text-foreground",
                    )}
                  >
                    <Folder
                      className={cn(
                        "size-4 shrink-0",
                        isActive ? "text-foreground" : "text-muted-foreground",
                      )}
                    />
                    {renamingProject?.path === p.path ? (
                      <Input
                        autoFocus
                        className="h-6 flex-1 text-[13px]"
                        value={renamingProject.name}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setRenamingProject({ path: p.path, name: e.target.value })}
                        onBlur={() => setRenamingProject(null)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            onRenameProject(p.path, renamingProject.name);
                            setRenamingProject(null);
                          } else if (e.key === "Escape") setRenamingProject(null);
                        }}
                      />
                    ) : (
                      <span
                        className={cn(
                          "min-w-0 flex-1 truncate text-[13px]",
                          isActive ? "font-semibold" : "font-medium text-muted-foreground",
                        )}
                        title={p.path}
                      >
                        {p.name}
                      </span>
                    )}
                    <span className="shrink-0 text-[11px] text-muted-foreground group-hover:hidden">
                      {shortAge(p.last_opened_at)}
                    </span>
                    <span className="hidden shrink-0 gap-0.5 group-hover:flex">
                      <button
                        title={t("rail.renameProject")}
                        className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                        onClick={(e) => {
                          e.stopPropagation();
                          setRenamingProject({ path: p.path, name: p.name });
                        }}
                      >
                        <Pencil className="size-3" />
                      </button>
                      <button
                        title={t("rail.removeProject")}
                        className="rounded p-0.5 text-muted-foreground hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemoveProject(p.path);
                        }}
                      >
                        <Trash2 className="size-3" />
                      </button>
                    </span>
                  </div>

                  {/* its conversations, only for the project you're in */}
                  {isActive &&
                    (list.length === 0 ? (
                      <p className="py-2 pl-8 pr-2 text-[11px] leading-relaxed text-muted-foreground">
                        {t("rail.empty")} {t("rail.emptyHint")}
                      </p>
                    ) : (
                      <div className="mt-0.5 space-y-px pl-4">{list.map(sessionRow)}</div>
                    ))}
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>

      {/* ---- foot: what's live, and the way to settings ------------------------------------ */}
      <div className="border-t px-2 pb-1.5 pt-1">
        <div className="flex h-7 items-center gap-2 px-2 text-[11px] text-muted-foreground">{status}</div>
        <div className="flex items-center gap-1">
          <button
            onClick={onOpenSettings}
            className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-accent"
          >
            <Settings className="size-4 shrink-0 text-muted-foreground" />
            {t("header.settings")}
          </button>
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
            <TooltipContent>{t("rail.market", { count: skills.length })}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 shrink-0 text-muted-foreground"
                onClick={onNewSkill}
              >
                <Plus className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("rail.newSkill")}</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </aside>
  );
}
