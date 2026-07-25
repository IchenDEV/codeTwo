import { useCallback, useEffect, useState } from "react";
import { AtSign, ChevronRight, File, Folder, FolderOpen, RefreshCw } from "lucide-react";

import { listDir, type DirEntry } from "../bridge";
import { useT } from "../i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** A directory's children, once loaded. Absent means "not expanded or still loading". */
type Loaded = Record<string, DirEntry[]>;

function Row({
  entry,
  depth,
  expanded,
  onToggle,
  onInsert,
}: {
  entry: DirEntry;
  depth: number;
  expanded: boolean;
  onToggle: () => void;
  onInsert: () => void;
}) {
  const t = useT();
  const Icon = entry.is_dir ? (expanded ? FolderOpen : Folder) : File;

  return (
    <div
      className="group flex items-center gap-1 rounded-md pr-1 transition-colors hover:bg-accent"
      style={{ paddingLeft: depth * 12 }}
    >
      <button
        onClick={entry.is_dir ? onToggle : onInsert}
        className="flex min-w-0 flex-1 items-center gap-1 py-1 text-left"
        title={entry.path}
      >
        <ChevronRight
          className={cn(
            "size-3 shrink-0 text-muted-foreground transition-transform",
            !entry.is_dir && "opacity-0",
            expanded && "rotate-90",
          )}
        />
        <Icon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate text-[12px]">{entry.name}</span>
      </button>

      {/* Directories can't be mentioned, so only files get the affordance. */}
      {!entry.is_dir && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onInsert}
              className="hidden shrink-0 rounded p-1 text-muted-foreground hover:text-primary group-hover:block"
            >
              <AtSign className="size-3" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="left">{t("files.insert")}</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

/**
 * The workspace as a tree, in the side dock.
 *
 * Lazy by level: each directory is fetched when it's opened, so a large repository costs nothing
 * until you look inside it — and unlike the `⌘P` search, nothing is capped, so the tree never
 * quietly omits files. Clicking a file drops an `@` mention into the prompt, which is the reason
 * to have it beside the document rather than in a dialog you dismiss.
 */
export function FilePanel({ cwd, onInsert }: { cwd: string | null; onInsert: (path: string) => void }) {
  const t = useT();
  const [loaded, setLoaded] = useState<Loaded>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (path: string) => {
      if (!cwd) return;
      try {
        const entries = await listDir(cwd, path);
        setLoaded((prev) => ({ ...prev, [path]: entries }));
        setError(null);
      } catch (e) {
        setError(String(e));
      }
    },
    [cwd],
  );

  // Reload the root whenever the project changes — a stale tree from the previous project is worse
  // than an empty one.
  useEffect(() => {
    setLoaded({});
    setExpanded(new Set());
    void load("");
  }, [cwd, load]);

  const toggle = useCallback(
    (path: string) => {
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(path)) next.delete(path);
        else {
          next.add(path);
          if (!(path in loaded)) void load(path);
        }
        return next;
      });
    },
    [loaded, load],
  );

  /** Depth-first walk of what's currently open, so the tree renders as one flat list of rows. */
  const rows: { entry: DirEntry; depth: number }[] = [];
  const walk = (path: string, depth: number) => {
    for (const entry of loaded[path] ?? []) {
      const q = filter.trim().toLowerCase();
      // A filter matches on name, but keeps directories so their matching children stay reachable.
      if (q && !entry.is_dir && !entry.name.toLowerCase().includes(q)) continue;
      rows.push({ entry, depth });
      if (entry.is_dir && expanded.has(entry.path)) walk(entry.path, depth + 1);
    }
  };
  walk("", 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-1 border-b p-2">
        <Input
          className="h-7 text-[12px]"
          placeholder={t("files.filter")}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 shrink-0"
              onClick={() => {
                setLoaded({});
                setExpanded(new Set());
                void load("");
              }}
            >
              <RefreshCw className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("files.refresh")}</TooltipContent>
        </Tooltip>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="p-1.5">
          {error ? (
            <p className="px-2 py-3 text-[11px] text-destructive">{error}</p>
          ) : rows.length === 0 ? (
            <p className="px-2 py-3 text-[11px] text-muted-foreground">
              {cwd ? t("files.empty") : t("files.noProject")}
            </p>
          ) : (
            rows.map(({ entry, depth }) => (
              <Row
                key={entry.path}
                entry={entry}
                depth={depth}
                expanded={expanded.has(entry.path)}
                onToggle={() => toggle(entry.path)}
                onInsert={() => onInsert(entry.path)}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
