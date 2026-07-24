import { useMemo, useState } from "react";
import { Archive, Pencil, Plus, Search, SquarePen, Store, X } from "lucide-react";

import type { SessionInfo, SkillInfo } from "../bridge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

export function SessionRail({
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
  status,
}: {
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
  /** Foot-of-rail line: which provider is live, like Codex's account row. */
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
            s.cwd.toLowerCase().includes(q) ||
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
    <aside className="flex w-60 min-w-60 flex-col border-r bg-sidebar">
      {/* pt-7 clears the macOS traffic lights, which float over this row under the overlay title
          bar. That bar is transparent, so this row is also the only thing left to drag the window
          by — hence the drag region, on the row and on the wordmark that covers most of it. */}
      <div data-tauri-drag-region className="flex items-center gap-1 px-3 pb-1 pt-7">
        <span data-tauri-drag-region className="flex-1 text-[15px] font-bold tracking-tight">
          codeTwo
        </span>
        <Button
          variant="ghost"
          size="icon"
          className={cn("size-7", searching && "text-primary")}
          aria-label="Search sessions"
          onClick={() => {
            setSearching((v) => !v);
            if (searching) setQuery("");
          }}
        >
          <Search className="size-4" />
        </Button>
      </div>

      <div className="px-2 pb-2 pt-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onNew}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] font-medium transition-colors hover:bg-accent"
            >
              <SquarePen className="size-4 text-muted-foreground" />
              New session
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">
            Start a fresh session <span className="ml-1 opacity-60">{newHint}</span>
          </TooltipContent>
        </Tooltip>

        {searching && (
          <div className="relative mt-1.5">
            <Input
              autoFocus
              className="h-7 pl-7 text-[13px]"
              placeholder="Filter sessions"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setQuery("");
                  setSearching(false);
                }
              }}
            />
            <Search className="pointer-events-none absolute left-2 top-1.5 size-4 text-muted-foreground" />
            {query && (
              <button
                className="absolute right-1.5 top-1.5 rounded p-0.5 text-muted-foreground hover:text-foreground"
                onClick={() => setQuery("")}
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="px-1.5 pb-2">
          {sessions.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs leading-relaxed text-muted-foreground">
              No sessions yet.
              <br />
              Write a prompt and send it.
            </p>
          ) : groups.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-muted-foreground">
              Nothing matches “{query}”.
            </p>
          ) : (
            groups.map((g) => (
              <div key={g.label} className="mb-1">
                <div className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
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

      {/* Skills live at the foot of the rail — they're picked with "/" in the document, not here. */}
      <div className="border-t px-3 py-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {skills.length} skills
          </span>
          <span className="flex gap-1">
            <Button variant="ghost" size="icon" className="size-5" onClick={onOpenMarket} title="Skill market">
              <Store className="size-3" />
            </Button>
            <Button variant="ghost" size="icon" className="size-5" onClick={onNewSkill} title="New skill">
              <Plus className="size-3" />
            </Button>
          </span>
        </div>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Type <b>/</b> in the document to insert one.
        </p>
      </div>

      <div className="flex h-8 items-center gap-2 border-t px-3 text-[11px] text-muted-foreground">{status}</div>
    </aside>
  );
}
