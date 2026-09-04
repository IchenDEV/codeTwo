import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import { CompositeActionRow } from "@/components/business/composite-action-row";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
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
} from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { TooltipButton } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import {
  confirmNative,
  copyPath,
  createDirectory,
  createFile,
  deletePath,
  listDirectory,
  renamePath,
} from "../bridge";
import type { DirectoryEntry } from "../bridge";
import { useT } from "../i18n";
import { useToast } from "../ui/toast";

/**
A directory's children, once loaded. Absent means "not expanded, or still loading".
*/
type Loaded = Record<string, DirectoryEntry[]>;

/**
An in-place input in the tree: VS Code creates and renames where the thing will live.
*/
type Draft =
  | { kind: "new-file" | "new-folder"; parent: string; value: string }
  | { kind: "rename"; path: string; value: string };

const parentOf = (path: string) => path.split("/").slice(0, -1).join("/");
const nameOf = (path: string) => path.split("/").pop() ?? path;

function copyName(path: string): string {
  const dot = nameOf(path).lastIndexOf(".");
  if (dot <= 0) {
    return `${path} copy`;
  }
  const dir = parentOf(path);
  const base = nameOf(path);
  const dup = `${base.slice(0, dot)} copy${base.slice(dot)}`;
  return dir ? `${dir}/${dup}` : dup;
}

function Branch({
  open,
  children,
}: {
  readonly open: boolean;
  readonly children: ReactNode;
}) {
  const inner = useRef<HTMLDivElement | null>(null);
  /**
  `null` is "no explicit height" — the subtree sizes itself.
  */
  const [height, setHeight] = useState<number | null>(0);

  useEffect(() => {
    const el = inner.current;
    if (!el) {
      return;
    }
    if (open) {
      setHeight(el.scrollHeight);
      return;
    }
    setHeight(el.scrollHeight); // pin the current auto height, then collapse from it
    const id = requestAnimationFrame(() => setHeight(0));
    return () => cancelAnimationFrame(id);
  }, [open]);

  return (
    <div
      style={{ height: height ?? undefined }}
      // Landing on `auto` matters only after opening; the closed state must stay pinned at 0. The
      // guards are load-bearing: `transitionend` bubbles, and every row in here has its own colour
      // transition, so hovering one mid-open would otherwise snap the branch to its full height.
      onTransitionEnd={(e) => {
        if (
          open &&
          e.target === e.currentTarget &&
          e.propertyName === "height"
        ) {
          setHeight(null);
        }
      }}
      className={cn("tree-branch", open ? "opacity-100" : "opacity-0")}
    >
      <div ref={inner}>{children}</div>
    </div>
  );
}

export function FilePanel({
  cwd,
  onInsert,
  onOpen,
  openPath,
}: {
  readonly cwd: string | null;
  /**
  Drop an `@` mention into the prompt.
  */
  readonly onInsert: (path: string) => void;
  /**
  Show the file in the built-in viewer — what a plain click does.
  */
  readonly onOpen: (path: string) => void;
  /**
  Which file the viewer is showing, so the tree can mark it.
  */
  readonly openPath: string | null;
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

  const load = async (path: string) => {
    if (!cwd) {
      return;
    }
    try {
      const entries = await listDirectory(cwd, path);
      setLoaded((prev) => ({ ...prev, [path]: entries }));
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  };

  /**
  Reload every directory currently open, so the tree matches disk after a mutation.
  */
  const reload = async () => {
    if (!cwd) {
      return;
    }
    const paths = ["", ...expanded];
    const entries = await Promise.all(
      paths.map(
        async (p) => [p, await listDirectory(cwd, p).catch(() => [])] as const
      )
    );
    setLoaded(Object.fromEntries(entries));
  };

  // A stale tree from the previous project is worse than an empty one.
  useEffect(() => {
    setLoaded({});
    setExpanded(new Set());
    setSelected(null);
    void load("");
  }, [cwd, load]);

  useEffect(() => {
    if (draft) {
      draftInput.current?.focus();
    }
  }, [draft]);

  const toggle = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
        if (!(path in loaded)) {
          void load(path);
        }
      }
      return next;
    });
  };

  /**
  Open a directory (without collapsing it) so a new child is visible where it lands.
  */
  const reveal = (dir: string) => {
    if (!dir) {
      return;
    }
    setExpanded((prev) => new Set(prev).add(dir));
    if (!(dir in loaded)) {
      void load(dir);
    }
  };

  const isRun = async (op: Promise<unknown>, ok: string) => {
    try {
      await op;
      await reload();
      toast(ok, "success");
      return true;
    } catch (e) {
      toast(String(e), "error");
      return false;
    }
  };

  const commitDraft = async () => {
    if (!draft || !cwd) {
      return;
    }
    const value = draft.value.trim();
    if (!value) {
      setDraft(null);
      return;
    }

    if (draft.kind === "rename") {
      // The field holds a path, not a name, so typing `src/x.ts` moves it. That's `mv`, and it's
      // why rename and move don't need to be two commands.
      const to = value.includes("/")
        ? value
        : [parentOf(draft.path), value].filter(Boolean).join("/");
      if (to !== draft.path) {
        await isRun(
          renamePath(cwd, draft.path, to),
          t("files.renamed", { path: to })
        );
      }
    } else {
      const path = [draft.parent, value].filter(Boolean).join("/");
      const isMade =
        draft.kind === "new-file"
          ? await isRun(createFile(cwd, path), t("files.created", { path }))
          : await isRun(
              createDirectory(cwd, path),
              t("files.created", { path })
            );
      if (isMade) {
        reveal(parentOf(path));
        if (draft.kind === "new-file") {
          onOpen(path);
        }
      }
    }
    setDraft(null);
  };

  /**
  A filter hides non-matching files but keeps folders, so matches stay reachable.
  */
  const visible = (entry: DirectoryEntry) => {
    const q = filter.trim().toLowerCase();
    return !q || entry.is_dir || entry.name.toLowerCase().includes(q);
  };

  const roots = (loaded[""] ?? []).filter(visible);

  const menuFor = (entry: DirectoryEntry) => (
    <ContextMenuContent>
      {!entry.is_dir && (
        <>
          <ContextMenuGroup>
            <ContextMenuItem onClick={() => onOpen(entry.path)}>
              <File className="size-3.5" /> {t("files.open")}
            </ContextMenuItem>
            <ContextMenuItem onClick={() => onInsert(entry.path)}>
              <AtSign className="size-3.5" /> {t("files.insert")}
            </ContextMenuItem>
          </ContextMenuGroup>
          <ContextMenuSeparator />
        </>
      )}

      <ContextMenuGroup>
        <ContextMenuItem
          onClick={() => {
            const parent = entry.is_dir ? entry.path : parentOf(entry.path);
            reveal(parent);
            setDraft({ kind: "new-file", parent, value: "" });
          }}
        >
          <FilePlus className="size-3.5" /> {t("files.newFile")}
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => {
            const parent = entry.is_dir ? entry.path : parentOf(entry.path);
            reveal(parent);
            setDraft({ kind: "new-folder", parent, value: "" });
          }}
        >
          <FolderPlus className="size-3.5" /> {t("files.newFolder")}
        </ContextMenuItem>
      </ContextMenuGroup>
      <ContextMenuSeparator />

      <ContextMenuGroup>
        <ContextMenuItem
          onClick={() =>
            setDraft({ kind: "rename", path: entry.path, value: entry.name })
          }
        >
          <Pencil className="size-3.5" /> {t("files.rename")}
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() =>
            setDraft({ kind: "rename", path: entry.path, value: entry.path })
          }
        >
          <CornerUpRight className="size-3.5" /> {t("files.move")}
        </ContextMenuItem>
        {!entry.is_dir && (
          <ContextMenuItem
            onClick={() => {
              if (cwd) {
                void isRun(
                  copyPath(cwd, entry.path, copyName(entry.path)),
                  t("files.duplicated")
                );
              }
            }}
          >
            <Copy className="size-3.5" /> {t("files.duplicate")}
          </ContextMenuItem>
        )}
        <ContextMenuItem
          onClick={() => void navigator.clipboard?.writeText(entry.path)}
        >
          <Copy className="size-3.5" /> {t("files.copyPath")}
        </ContextMenuItem>
      </ContextMenuGroup>
      <ContextMenuSeparator />

      <ContextMenuGroup>
        <ContextMenuItem
          variant="destructive"
          onClick={async () => {
            // Deleting a folder takes everything in it, so the confirmation says which and how much.
            // Native dialog, not window.confirm — wry's stub would silently answer "yes".
            const message = entry.is_dir
              ? t("files.confirmDeleteFolder", { name: entry.name })
              : t("files.confirmDelete", { name: entry.name });
            if (!(await confirmNative(message))) {
              return;
            }
            if (cwd) {
              void isRun(
                deletePath(cwd, entry.path),
                t("files.deleted", { name: entry.name })
              );
            }
          }}
        >
          <Trash2 className="size-3.5" /> {t("files.delete")}
        </ContextMenuItem>
      </ContextMenuGroup>
    </ContextMenuContent>
  );

  /**
   * One directory's rows, with each folder's children nested underneath rather than flattened into
   * the same list. The nesting is what gives a subtree a box of its own to grow and shrink; a flat
   * list can only have rows appear and vanish.
   *
   * Children are rendered for any folder whose contents are known, open or not — `Branch` hides the
   * closed ones, and something has to still be there to animate on the way out.
   */
  const level = (path: string, depth: number): ReactNode =>
    (loaded[path] ?? []).filter(visible).map((entry) => {
      const isRenaming = draft?.kind === "rename" && draft.path === entry.path;
      const Icon = entry.is_dir
        ? expanded.has(entry.path)
          ? FolderOpen
          : Folder
        : File;

      return (
        <div key={entry.path}>
          {isRenaming ? (
            draftRow(depth)
          ) : (
            <ContextMenu>
              <ContextMenuTrigger
                render={
                  <CompositeActionRow
                    accessibilityLabel={entry.name}
                    onSelect={() => {
                      setSelected(entry.path);
                      // A plain click opens a directory or *views* a file. It never edits —
                      // editing is a deliberate act, so it lives in the menu.
                      if (entry.is_dir) {
                        toggle(entry.path);
                      } else {
                        onOpen(entry.path);
                      }
                    }}
                    onContextMenu={() => setSelected(entry.path)}
                    className={cn(
                      "rounded-control focus-within:bg-accent gap-1 pr-1 transition-colors",
                      openPath === entry.path
                        ? "bg-accent"
                        : selected === entry.path
                          ? "bg-accent/70"
                          : "hover:bg-accent/50"
                    )}
                    style={{ paddingLeft: depth * 12 }}
                    contentClassName="flex items-center gap-1"
                    actions={
                      !entry.is_dir ? (
                        <TooltipButton
                          label={t("files.insert")}
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => onInsert(entry.path)}
                          className="text-muted-foreground hover:text-primary ml-auto hidden shrink-0 group-focus-within:inline-flex group-hover:inline-flex"
                        >
                          <AtSign className="size-3" />
                        </TooltipButton>
                      ) : null
                    }
                  >
                    <ChevronRight
                      className={cn(
                        "text-muted-foreground size-3 shrink-0 transition-transform",
                        !entry.is_dir && "opacity-0",
                        expanded.has(entry.path) && "rotate-90"
                      )}
                    />
                    <Icon className="text-muted-foreground size-3.5 shrink-0" />
                    <span className="text-metadata truncate py-1">
                      {entry.name}
                    </span>
                  </CompositeActionRow>
                }
              />
              {menuFor(entry)}
            </ContextMenu>
          )}

          {entry.is_dir && entry.path in loaded ? (
            <Branch open={expanded.has(entry.path)}>
              {level(entry.path, depth + 1)}
            </Branch>
          ) : null}

          {/* A new child appears indented under the folder it's going into. */}
          {draft && draft.kind !== "rename" && draft.parent === entry.path
            ? draftRow(depth + 1)
            : null}
        </div>
      );
    });

  const draftRow = (depth: number) => (
    <div
      className="flex items-center gap-1 py-0.5"
      style={{ paddingLeft: depth * 12 + 18 }}
    >
      {draft?.kind === "new-folder" ? (
        <Folder className="text-muted-foreground size-3.5 shrink-0" />
      ) : (
        <File className="text-muted-foreground size-3.5 shrink-0" />
      )}
      <Input
        ref={draftInput}
        className="text-metadata h-6 font-mono"
        value={draft?.value ?? ""}
        onChange={(e) =>
          setDraft((d) => (d ? { ...d, value: e.target.value } : d))
        }
        onBlur={() => void commitDraft()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            void commitDraft();
          } else if (e.key === "Escape") {
            setDraft(null);
          }
        }}
      />
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* The shared panel strip matches the viewer's file tabs across one continuous separator. */}
      <div className="h-panel-strip flex shrink-0 items-center gap-1 px-2">
        <Input
          className="text-metadata h-(--ds-control-mini)"
          placeholder={t("files.filter")}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <TooltipButton
          label={t("files.newFile")}
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          disabled={cwd == null || cwd === ""}
          onClick={() => setDraft({ kind: "new-file", parent: "", value: "" })}
        >
          <FilePlus className="size-3.5" />
        </TooltipButton>
        <TooltipButton
          label={t("files.newFolder")}
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          disabled={cwd == null || cwd === ""}
          onClick={() =>
            setDraft({ kind: "new-folder", parent: "", value: "" })
          }
        >
          <FolderPlus className="size-3.5" />
        </TooltipButton>
        <TooltipButton
          label={t("files.refresh")}
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          onClick={() => void reload()}
        >
          <RefreshCw className="size-3.5" />
        </TooltipButton>
      </div>
      <Separator />

      <ScrollArea className="min-h-0 flex-1">
        <div className="p-1">
          {draft && draft.kind !== "rename" && draft.parent === ""
            ? draftRow(0)
            : null}

          {error != null && error !== "" ? (
            <p className="text-callout text-destructive px-2 py-3">{error}</p>
          ) : roots.length === 0 && !draft ? (
            <p className="text-callout text-muted-foreground px-2 py-3">
              {cwd != null && cwd !== ""
                ? t("files.empty")
                : t("files.noProject")}
            </p>
          ) : (
            level("", 0)
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
