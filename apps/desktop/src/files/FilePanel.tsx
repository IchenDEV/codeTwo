import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AtSign,
  ChevronRight,
  Copy,
  CornerUpRight,
  File,
  FilePlus,
  FolderPlus,
  Folder,
  FolderOpen,
  Pencil,
  RefreshCw,
  Trash2,
} from "lucide-react";

import { copyPath, createDir, createFile, deletePath, listDir, renamePath, type DirEntry } from "../bridge";
import { useToast } from "../ui/toast";
import { useT } from "../i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";

/** A directory's children, once loaded. Absent means "not expanded, or still loading". */
type Loaded = Record<string, DirEntry[]>;

/** An in-place input in the tree: VS Code creates and renames where the thing will live. */
type Draft =
  | { kind: "new-file" | "new-folder"; parent: string; value: string }
  | { kind: "rename"; path: string; value: string };

const parentOf = (path: string) => path.split("/").slice(0, -1).join("/");
const nameOf = (path: string) => path.split("/").pop() ?? path;

/** `README.md` → `README copy.md`, so a duplicate keeps its extension. */
function copyName(path: string): string {
  const dot = nameOf(path).lastIndexOf(".");
  if (dot <= 0) return `${path} copy`;
  const dir = parentOf(path);
  const base = nameOf(path);
  const dup = `${base.slice(0, dot)} copy${base.slice(dot)}`;
  return dir ? `${dir}/${dup}` : dup;
}

export function FilePanel({
  cwd,
  onInsert,
  onOpen,
  openPath,
}: {
  cwd: string | null;
  /** Drop an `@` mention into the prompt. */
  onInsert: (path: string) => void;
  /** Show the file in the built-in viewer — what a plain click does. */
  onOpen: (path: string) => void;
  /** Which file the viewer is showing, so the tree can mark it. */
  openPath: string | null;
}) {
  const t = useT();
  const toast = useToast();
  const [loaded, setLoaded] = useState<Loaded>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const draftInput = useRef<HTMLInputElement | null>(null);

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

  /** Reload every directory currently open, so the tree matches disk after a mutation. */
  const reload = useCallback(async () => {
    if (!cwd) return;
    const paths = ["", ...expanded];
    const entries = await Promise.all(
      paths.map(async (p) => [p, await listDir(cwd, p).catch(() => [])] as const),
    );
    setLoaded(Object.fromEntries(entries));
  }, [cwd, expanded]);

  // A stale tree from the previous project is worse than an empty one.
  useEffect(() => {
    setLoaded({});
    setExpanded(new Set());
    setSelected(null);
    void load("");
  }, [cwd, load]);

  useEffect(() => {
    if (draft) draftInput.current?.focus();
  }, [draft]);

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

  /** Open a directory (without collapsing it) so a new child is visible where it lands. */
  const reveal = useCallback(
    (dir: string) => {
      if (!dir) return;
      setExpanded((prev) => new Set(prev).add(dir));
      if (!(dir in loaded)) void load(dir);
    },
    [loaded, load],
  );

  const run = useCallback(
    async (op: Promise<unknown>, ok: string) => {
      try {
        await op;
        await reload();
        toast(ok, "success");
        return true;
      } catch (e) {
        toast(String(e), "error");
        return false;
      }
    },
    [reload, toast],
  );

  const commitDraft = useCallback(async () => {
    if (!draft || !cwd) return;
    const value = draft.value.trim();
    if (!value) {
      setDraft(null);
      return;
    }

    if (draft.kind === "rename") {
      // The field holds a path, not a name, so typing `src/x.ts` moves it. That's `mv`, and it's
      // why rename and move don't need to be two commands.
      const to = value.includes("/") ? value : [parentOf(draft.path), value].filter(Boolean).join("/");
      if (to !== draft.path) await run(renamePath(cwd, draft.path, to), t("files.renamed", { path: to }));
    } else {
      const path = [draft.parent, value].filter(Boolean).join("/");
      const made =
        draft.kind === "new-file"
          ? await run(createFile(cwd, path), t("files.created", { path }))
          : await run(createDir(cwd, path), t("files.created", { path }));
      if (made) {
        reveal(parentOf(path));
        if (draft.kind === "new-file") onOpen(path);
      }
    }
    setDraft(null);
  }, [draft, cwd, run, t, reveal, onOpen]);

  /** Depth-first walk of what's open, flattened into rows — plus any in-place draft input. */
  const rows = useMemo(() => {
    const out: { entry: DirEntry; depth: number }[] = [];
    const q = filter.trim().toLowerCase();
    const walk = (path: string, depth: number) => {
      for (const entry of loaded[path] ?? []) {
        // A filter hides non-matching files but keeps folders, so matches stay reachable.
        if (q && !entry.is_dir && !entry.name.toLowerCase().includes(q)) continue;
        out.push({ entry, depth });
        if (entry.is_dir && expanded.has(entry.path)) walk(entry.path, depth + 1);
      }
    };
    walk("", 0);
    return out;
  }, [loaded, expanded, filter]);

  const menuFor = (entry: DirEntry) => (
    <ContextMenuContent>
      {!entry.is_dir && (
        <>
          <ContextMenuItem onSelect={() => onOpen(entry.path)}>
            <File className="size-3.5" /> {t("files.open")}
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => onInsert(entry.path)}>
            <AtSign className="size-3.5" /> {t("files.insert")}
          </ContextMenuItem>
          <ContextMenuSeparator />
        </>
      )}

      <ContextMenuItem
        onSelect={() => {
          const parent = entry.is_dir ? entry.path : parentOf(entry.path);
          reveal(parent);
          setDraft({ kind: "new-file", parent, value: "" });
        }}
      >
        <FilePlus className="size-3.5" /> {t("files.newFile")}
      </ContextMenuItem>
      <ContextMenuItem
        onSelect={() => {
          const parent = entry.is_dir ? entry.path : parentOf(entry.path);
          reveal(parent);
          setDraft({ kind: "new-folder", parent, value: "" });
        }}
      >
        <FolderPlus className="size-3.5" /> {t("files.newFolder")}
      </ContextMenuItem>
      <ContextMenuSeparator />

      <ContextMenuItem onSelect={() => setDraft({ kind: "rename", path: entry.path, value: entry.name })}>
        <Pencil className="size-3.5" /> {t("files.rename")}
      </ContextMenuItem>
      <ContextMenuItem
        onSelect={() => setDraft({ kind: "rename", path: entry.path, value: entry.path })}
      >
        <CornerUpRight className="size-3.5" /> {t("files.move")}
      </ContextMenuItem>
      {!entry.is_dir && (
        <ContextMenuItem
          onSelect={() => {
            if (cwd) void run(copyPath(cwd, entry.path, copyName(entry.path)), t("files.duplicated"));
          }}
        >
          <Copy className="size-3.5" /> {t("files.duplicate")}
        </ContextMenuItem>
      )}
      <ContextMenuItem onSelect={() => void navigator.clipboard?.writeText(entry.path)}>
        <Copy className="size-3.5" /> {t("files.copyPath")}
      </ContextMenuItem>
      <ContextMenuSeparator />

      <ContextMenuItem
        variant="destructive"
        onSelect={() => {
          // Deleting a folder takes everything in it, so the confirmation says which and how much.
          const message = entry.is_dir
            ? t("files.confirmDeleteFolder", { name: entry.name })
            : t("files.confirmDelete", { name: entry.name });
          if (!window.confirm(message)) return;
          if (cwd) void run(deletePath(cwd, entry.path), t("files.deleted", { name: entry.name }));
        }}
      >
        <Trash2 className="size-3.5" /> {t("files.delete")}
      </ContextMenuItem>
    </ContextMenuContent>
  );

  const draftRow = (depth: number) => (
    <div className="flex items-center gap-1 py-0.5" style={{ paddingLeft: depth * 12 + 18 }}>
      {draft?.kind === "new-folder" ? (
        <Folder className="size-3.5 shrink-0 text-muted-foreground" />
      ) : (
        <File className="size-3.5 shrink-0 text-muted-foreground" />
      )}
      <Input
        ref={draftInput}
        className="h-6 font-mono text-hint"
        value={draft?.value ?? ""}
        onChange={(e) => setDraft((d) => (d ? { ...d, value: e.target.value } : d))}
        onBlur={() => void commitDraft()}
        onKeyDown={(e) => {
          if (e.key === "Enter") void commitDraft();
          else if (e.key === "Escape") setDraft(null);
        }}
      />
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-1 border-b p-2">
        <Input
          className="h-7 text-hint"
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
              disabled={!cwd}
              onClick={() => setDraft({ kind: "new-file", parent: "", value: "" })}
            >
              <FilePlus className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("files.newFile")}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 shrink-0"
              disabled={!cwd}
              onClick={() => setDraft({ kind: "new-folder", parent: "", value: "" })}
            >
              <FolderPlus className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("files.newFolder")}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="size-7 shrink-0" onClick={() => void reload()}>
              <RefreshCw className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("files.refresh")}</TooltipContent>
        </Tooltip>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="p-1">
          {draft && draft.kind !== "rename" && draft.parent === "" && draftRow(0)}

          {error ? (
            <p className="px-2 py-3 text-fine text-destructive">{error}</p>
          ) : rows.length === 0 && !draft ? (
            <p className="px-2 py-3 text-fine text-muted-foreground">
              {cwd ? t("files.empty") : t("files.noProject")}
            </p>
          ) : (
            rows.map(({ entry, depth }) => {
              const isRenaming = draft?.kind === "rename" && draft.path === entry.path;
              const Icon = entry.is_dir ? (expanded.has(entry.path) ? FolderOpen : Folder) : File;

              return (
                <div key={entry.path}>
                  {isRenaming ? (
                    draftRow(depth)
                  ) : (
                    <ContextMenu>
                      <ContextMenuTrigger asChild>
                        <div
                          onClick={() => {
                            setSelected(entry.path);
                            // A plain click opens a directory or *views* a file. It never edits —
                            // editing is a deliberate act, so it lives in the menu.
                            if (entry.is_dir) toggle(entry.path);
                            else onOpen(entry.path);
                          }}
                          onContextMenu={() => setSelected(entry.path)}
                          className={cn(
                            "group flex cursor-default items-center gap-1 rounded-md pr-1 transition-colors",
                            openPath === entry.path
                              ? "bg-accent"
                              : selected === entry.path
                                ? "bg-accent/60"
                                : "hover:bg-accent/50",
                          )}
                          style={{ paddingLeft: depth * 12 }}
                        >
                          <ChevronRight
                            className={cn(
                              "size-3 shrink-0 text-muted-foreground transition-transform",
                              !entry.is_dir && "opacity-0",
                              expanded.has(entry.path) && "rotate-90",
                            )}
                          />
                          <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                          <span className="truncate py-1 text-hint">{entry.name}</span>

                          {!entry.is_dir && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onInsert(entry.path);
                              }}
                              title={t("files.insert")}
                              className="ml-auto hidden shrink-0 rounded p-1 text-muted-foreground hover:text-primary group-hover:block"
                            >
                              <AtSign className="size-3" />
                            </button>
                          )}
                        </div>
                      </ContextMenuTrigger>
                      {menuFor(entry)}
                    </ContextMenu>
                  )}

                  {/* A new child appears indented under the folder it's going into. */}
                  {draft &&
                    draft.kind !== "rename" &&
                    draft.parent === entry.path &&
                    draftRow(depth + 1)}
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
