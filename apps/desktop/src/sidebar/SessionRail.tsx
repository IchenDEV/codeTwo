import { useMemo, useState } from "react";
import {
  Archive,
  Check,
  ChevronDown,
  FolderPlus,
  GitBranch,
  Pencil,
  Plus,
  Search,
  SquarePen,
  Store,
  Trash2,
  X,
} from "lucide-react";

import type { GitStatus, Project, SessionInfo, SkillInfo } from "../bridge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** Which recency bucket a session falls into. Sessions arrive newest-first, so a single pass works. */
function bucketOf(createdAt: number): string {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = 86_400_000;
  if (createdAt >= startOfToday) return "Today";
  if (createdAt >= startOfToday - day) return "Yesterday";
  if (createdAt >= startOfToday - 7 * day) return "Previous 7 days";
  if (createdAt >= startOfToday - 30 * day) return "Previous 30 days";
  return "Older";
}

/** `/Users/me/projects/codeTwo` → `~/projects/codeTwo`. The home prefix is noise on every row. */
function tildify(path: string): string {
  const home = path.match(/^\/Users\/[^/]+/)?.[0];
  return home ? path.replace(home, "~") : path;
}

/** Section 1 — which project you're in, and how to get to another. */
function ProjectPicker({
  projects,
  activeProject,
  onSelect,
  onAdd,
  onRename,
  onRemove,
}: {
  projects: Project[];
  activeProject: string | null;
  onSelect: (path: string) => void;
  onAdd: () => void;
  onRename: (path: string, name: string) => void;
  onRemove: (path: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState<{ path: string; name: string } | null>(null);
  const current = projects.find((p) => p.path === activeProject);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-left transition-colors hover:bg-accent">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-bold tracking-tight">
              {current?.name ?? "codeTwo"}
            </span>
            <span className="block truncate text-[11px] text-muted-foreground">
              {current ? tildify(current.path) : "No project selected"}
            </span>
          </span>
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-72 p-1">
        <ScrollArea className="max-h-72">
          {projects.length === 0 && (
            <p className="px-2 py-2 text-[11px] leading-relaxed text-muted-foreground">
              No projects yet. Add a directory to work in — sessions and git status follow it.
            </p>
          )}
          {projects.map((p) => (
            <div
              key={p.path}
              className="group flex items-center gap-1 rounded-md px-1 transition-colors hover:bg-accent"
            >
              {renaming?.path === p.path ? (
                <Input
                  autoFocus
                  className="my-1 h-6 text-[13px]"
                  value={renaming.name}
                  onChange={(e) => setRenaming({ path: p.path, name: e.target.value })}
                  onBlur={() => setRenaming(null)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      onRename(p.path, renaming.name);
                      setRenaming(null);
                    } else if (e.key === "Escape") setRenaming(null);
                  }}
                />
              ) : (
                <>
                  <button
                    onClick={() => {
                      onSelect(p.path);
                      setOpen(false);
                    }}
                    className="flex min-w-0 flex-1 items-start gap-2 py-1.5 text-left"
                  >
                    <Check
                      className={cn(
                        "mt-0.5 size-3.5 shrink-0",
                        p.path === activeProject ? "text-primary" : "opacity-0",
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px]">{p.name}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {tildify(p.path)}
                      </span>
                    </span>
                  </button>
                  <span className="hidden shrink-0 gap-0.5 pr-1 group-hover:flex">
                    <button
                      title="Rename"
                      className="rounded p-1 text-muted-foreground hover:text-foreground"
                      onClick={() => setRenaming({ path: p.path, name: p.name })}
                    >
                      <Pencil className="size-3" />
                    </button>
                    <button
                      title="Remove from list (sessions are kept)"
                      className="rounded p-1 text-muted-foreground hover:text-destructive"
                      onClick={() => onRemove(p.path)}
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </span>
                </>
              )}
            </div>
          ))}
        </ScrollArea>

        <button
          onClick={() => {
            setOpen(false);
            onAdd();
          }}
          className="mt-1 flex w-full items-center gap-2.5 rounded-md border-t px-2 py-2 text-left text-[13px] transition-colors hover:bg-accent"
        >
          <FolderPlus className="size-3.5 shrink-0 text-muted-foreground" />
          Add a project…
        </button>
      </PopoverContent>
    </Popover>
  );
}

/** Section 3 — what the working tree looks like right now. */
function GitSection({
  git,
  onOpenSourceControl,
}: {
  git: GitStatus | null;
  onOpenSourceControl: () => void;
}) {
  if (!git?.is_repo) {
    return (
      <div className="border-t px-3 py-2.5 text-[11px] text-muted-foreground">Not a git repo.</div>
    );
  }

  return (
    <div className="border-t">
      <div className="flex items-center gap-1.5 px-3 pb-1 pt-2.5">
        <GitBranch className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-[12px] font-medium">{git.branch || "?"}</span>
        {git.ahead > 0 && <span className="shrink-0 text-[11px] text-primary">↑{git.ahead}</span>}
        {git.behind > 0 && <span className="shrink-0 text-[11px] text-primary">↓{git.behind}</span>}
      </div>

      {git.files.length === 0 ? (
        <p className="px-3 pb-2.5 text-[11px] text-muted-foreground">Working tree clean</p>
      ) : (
        <>
          {/* Capped on purpose: this is a status glance, not the review surface. The count below
              says how many didn't fit, and the button goes where they all are. */}
          <ScrollArea className="max-h-32">
            <div className="space-y-0.5 px-3 pb-1">
              {git.files.slice(0, 8).map((f) => (
                <div key={f.path} className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      "inline-flex size-3.5 shrink-0 items-center justify-center rounded text-[9px] font-bold",
                      f.staged ? "bg-success/15 text-success" : "bg-warning/15 text-warning",
                    )}
                    title={f.state}
                  >
                    {f.state.charAt(0).toUpperCase()}
                  </span>
                  <span className="truncate font-mono text-[11px] text-muted-foreground" title={f.path}>
                    {f.path}
                  </span>
                </div>
              ))}
            </div>
          </ScrollArea>
          <button
            onClick={onOpenSourceControl}
            className="w-full px-3 pb-2.5 pt-1 text-left text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          >
            {git.files.length > 8 && `+${git.files.length - 8} more · `}
            Review &amp; commit →
          </button>
        </>
      )}
    </div>
  );
}

/**
 * The rail, in three sections: which project you're in, what you've been talking about in it, and
 * what its working tree looks like. Each one answers a question you'd otherwise leave the app to
 * answer.
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
  onSelect,
  onNew,
  onRename,
  onArchive,
  displayProvider,
  skills,
  onOpenMarket,
  onNewSkill,
  newHint,
  git,
  onOpenSourceControl,
  status,
}: {
  projects: Project[];
  activeProject: string | null;
  onSelectProject: (path: string) => void;
  onAddProject: () => void;
  onRenameProject: (path: string, name: string) => void;
  onRemoveProject: (path: string) => void;
  sessions: SessionInfo[];
  activeSession: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => void;
  onArchive: (id: string) => void;
  displayProvider: (p: SessionInfo["provider"]) => string;
  skills: SkillInfo[];
  onOpenMarket: () => void;
  onNewSkill: () => void;
  newHint: string;
  git: GitStatus | null;
  onOpenSourceControl: () => void;
  /** Foot-of-rail line: which provider is live. */
  status: React.ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = q
      ? sessions.filter(
          (s) =>
            s.title.toLowerCase().includes(q) ||
            displayProvider(s.provider).toLowerCase().includes(q),
        )
      : sessions;

    const out: { label: string; items: SessionInfo[] }[] = [];
    for (const s of matched) {
      const label = bucketOf(s.created_at);
      const last = out[out.length - 1];
      if (last && last.label === label) last.items.push(s);
      else out.push({ label, items: [s] });
    }
    return out;
  }, [sessions, query, displayProvider]);

  return (
    <aside className="glass-rail flex w-64 min-w-64 flex-col border-r">
      {/* ---- 1. the project ---------------------------------------------------------------- */}
      {/* pt-7 clears the macOS traffic lights, which float over this row under the overlay title
          bar. That bar is transparent, so this row is also what drags the window. */}
      <div data-tauri-drag-region className="flex items-center gap-1 px-2 pb-1 pt-7">
        <ProjectPicker
          projects={projects}
          activeProject={activeProject}
          onSelect={onSelectProject}
          onAdd={onAddProject}
          onRename={onRenameProject}
          onRemove={onRemoveProject}
        />
      </div>

      {/* ---- 2. the conversations ---------------------------------------------------------- */}
      <div className="flex items-center gap-1 px-2 pt-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onNew}
              className="flex flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] font-medium transition-colors hover:bg-accent"
            >
              <SquarePen className="size-4 text-muted-foreground" />
              New session
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">
            Start a fresh session <span className="ml-1 opacity-60">{newHint}</span>
          </TooltipContent>
        </Tooltip>
        <Button
          variant="ghost"
          size="icon"
          className={cn("size-7 shrink-0", searching && "text-primary")}
          aria-label="Search sessions"
          onClick={() => {
            setSearching((v) => !v);
            if (searching) setQuery("");
          }}
        >
          <Search className="size-4" />
        </Button>
      </div>

      {searching && (
        <div className="relative px-2 pt-1.5">
          <Input
            autoFocus
            className="h-7 pl-7 text-[13px]"
            placeholder="Filter conversations"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setQuery("");
                setSearching(false);
              }
            }}
          />
          <Search className="pointer-events-none absolute left-4 top-3 size-4 text-muted-foreground" />
          {query && (
            <button
              className="absolute right-3.5 top-3 rounded p-0.5 text-muted-foreground hover:text-foreground"
              onClick={() => setQuery("")}
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      )}

      <div className="px-3 pb-0.5 pt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Recent
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="px-1.5 pb-2">
          {sessions.length === 0 ? (
            <p className="px-2 py-5 text-center text-xs leading-relaxed text-muted-foreground">
              Nothing here yet.
              <br />
              Write a prompt and send it.
            </p>
          ) : groups.length === 0 ? (
            <p className="px-2 py-5 text-center text-xs text-muted-foreground">
              Nothing matches “{query}”.
            </p>
          ) : (
            groups.map((g) => (
              <div key={g.label} className="mb-1">
                <div className="px-2 pb-1 pt-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
                  {g.label}
                </div>
                <div className="space-y-px">
                  {g.items.map((s) => (
                    <div
                      key={s.id}
                      onClick={() => onSelect(s.id)}
                      className={cn(
                        "group cursor-pointer rounded-md px-2 py-1.5 transition-colors hover:bg-accent",
                        s.id === activeSession && "bg-accent",
                      )}
                    >
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
                          className={cn(
                            "truncate text-[13px] font-medium",
                            s.id === activeSession && "text-primary",
                          )}
                        >
                          {s.title}
                        </div>
                      )}
                      <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <span className="truncate">{displayProvider(s.provider)}</span>
                        {s.worktree_path && (
                          <Badge variant="secondary" className="h-4 px-1 text-[9px]">
                            wt
                          </Badge>
                        )}
                        <span className="ml-auto hidden shrink-0 gap-0.5 group-hover:flex">
                          <button
                            title="Rename"
                            className="rounded p-0.5 hover:text-primary"
                            onClick={(e) => {
                              e.stopPropagation();
                              setRenaming({ id: s.id, title: s.title });
                            }}
                          >
                            <Pencil className="size-3" />
                          </button>
                          <button
                            title="Archive"
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
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      {/* ---- 3. the working tree ----------------------------------------------------------- */}
      <GitSection git={git} onOpenSourceControl={onOpenSourceControl} />

      <div className="flex h-8 items-center gap-2 border-t px-3 text-[11px] text-muted-foreground">
        {status}
        <span className="ml-auto flex shrink-0 gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="size-5" onClick={onOpenMarket}>
                <Store className="size-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{skills.length} skills — open the market</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="size-5" onClick={onNewSkill}>
                <Plus className="size-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>New skill — type / in the document to insert one</TooltipContent>
          </Tooltip>
        </span>
      </div>
    </aside>
  );
}
