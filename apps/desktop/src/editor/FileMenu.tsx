import { useEffect, useRef, type ReactNode } from "react";
import {
  FileCode,
  FileImage,
  FileJson,
  FileText,
  FileType,
  MessageSquare,
  Package,
  type LucideIcon,
} from "lucide-react";
import type { SuggestionMenuProps } from "@blocknote/react";

import { useT } from "../i18n";
import { cn } from "@/lib/utils";

/** One workspace file, split for display. The core ranks these; this only draws them. */
export interface FileItem {
  kind: "file";
  path: string;
  /** `src/session/` — dimmed, so the eye lands on the name. Empty at the workspace root. */
  dir: string;
  name: string;
  /** Where the query matched `name`, for highlighting. Null when it matched only the directory. */
  hit: [number, number] | null;
}

/** One past chat, offered for `@`-mentioning its transcript as context. */
export interface ChatItem {
  kind: "chat";
  id: string;
  title: string;
  /** `created_at` in ms — drawn as a short date so same-titled chats stay tellable apart. */
  when: number;
}

/** One stored scene artifact, offered for `@`-mentioning its content as context (R4). */
export interface ArtifactAtItem {
  kind: "artifact";
  recordId: number;
  title: string;
  /** Declared scene-artifact kind ("plan", "report", …) — drawn as the row's right-hand hint. */
  artifactKind: string;
  version: number;
}

/** Everything the `@` picker can insert: chats, then artifacts, then workspace files. */
export type AtItem = ChatItem | ArtifactAtItem | FileItem;

const BY_EXTENSION: Record<string, LucideIcon> = {
  ts: FileCode, tsx: FileCode, js: FileCode, jsx: FileCode, rs: FileCode, py: FileCode,
  go: FileCode, rb: FileCode, sh: FileCode, css: FileCode, html: FileCode, swift: FileCode,
  json: FileJson, lock: FileJson,
  toml: FileType, yaml: FileType, yml: FileType, plist: FileType, conf: FileType, ini: FileType,
  png: FileImage, jpg: FileImage, jpeg: FileImage, gif: FileImage, svg: FileImage,
  webp: FileImage, ico: FileImage, icns: FileImage,
};

/** A page icon on every row says only "this is a file", which the user already knows. */
function iconFor(name: string): LucideIcon {
  const dot = name.lastIndexOf(".");
  return (dot > 0 && BY_EXTENSION[name.slice(dot + 1).toLowerCase()]) || FileText;
}

/** Split a name around the matched span so the middle can be emphasised. */
function parts(item: FileItem): [string, string, string] {
  if (!item.hit) return [item.name, "", ""];
  const [from, to] = item.hit;
  return [item.name.slice(0, from), item.name.slice(from, to), item.name.slice(to)];
}

function itemKey(item: AtItem): string {
  if (item.kind === "chat") return item.id;
  if (item.kind === "artifact") return `artifact-${item.recordId}`;
  return item.path;
}

/** Muted group label — only drawn when the list actually mixes chats and files. */
function GroupLabel({ children }: { children: ReactNode }) {
  return (
    <p className="px-2 pb-0.5 pt-1.5 text-cap text-muted-foreground first:pt-1">{children}</p>
  );
}

/**
 * The `@` picker.
 *
 * BlockNote's stock menu renders one generic page glyph and one full path per row, at a row height
 * built for a handful of block types. Pointed at a workspace it becomes a wall: a dozen files on
 * screen, every row identically iconed, and the part that distinguishes them — the file's own name —
 * buried at the end of a path. This trades the glyph for the file's kind, puts the name first with
 * its directory trailing in muted text, marks what the query matched, and packs the rows tight
 * enough to show a useful number of them at once.
 *
 * Past chats sit above the files under their own label: mentioning one inlines its transcript, the
 * way mentioning a file inlines its contents.
 */
export function FileMenu({ items, loadingState, selectedIndex, onItemClick }: SuggestionMenuProps<AtItem>) {
  const t = useT();
  const listRef = useRef<HTMLDivElement | null>(null);

  // Arrow keys are the controller's; it moves `selectedIndex` without knowing this list scrolls.
  // Rows are found by index attribute — group labels between them would break child-position math.
  useEffect(() => {
    if (selectedIndex === undefined) return;
    listRef.current
      ?.querySelector(`[data-row="${selectedIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  if (loadingState === "loading-initial") {
    return (
      <div className="glass-raised w-[26rem] rounded-lg p-3 text-fine text-muted-foreground shadow-lg ring-1 ring-foreground/10">
        {t("files.searching")}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="glass-raised w-[26rem] rounded-lg p-3 text-fine text-muted-foreground shadow-lg ring-1 ring-foreground/10">
        {t("files.noMatches")}
      </div>
    );
  }

  const hasChats = items.some((i) => i.kind === "chat");
  const firstFile = items.findIndex((i) => i.kind === "file");
  const firstArtifact = items.findIndex((i) => i.kind === "artifact");

  return (
    <div
      ref={listRef}
      className="glass-raised max-h-72 w-[26rem] overflow-y-auto rounded-lg p-1 shadow-lg ring-1 ring-foreground/10"
    >
      {items.map((item, i) => {
        const row =
          item.kind === "artifact" ? (
            <button
              key={`artifact-${item.recordId}`}
              data-row={i}
              onClick={() => onItemClick?.(item)}
              className={cn(
                "flex w-full items-baseline gap-2 rounded-(--ds-radius-micro) px-2 py-1 text-left transition-colors",
                i === selectedIndex ? "bg-accent" : "hover:bg-accent/50",
              )}
            >
              <Package className="size-3.5 shrink-0 self-center text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-ui">{item.title}</span>
              <span className="shrink-0 text-fine text-muted-foreground/70">
                {item.artifactKind} · v{item.version}
              </span>
            </button>
          ) : item.kind === "chat" ? (
            <button
              key={item.id}
              data-row={i}
              onClick={() => onItemClick?.(item)}
              className={cn(
                "flex w-full items-baseline gap-2 rounded-md px-2 py-1 text-left transition-colors",
                i === selectedIndex ? "bg-accent" : "hover:bg-accent/50",
              )}
            >
              <MessageSquare className="size-3.5 shrink-0 self-center text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-ui">{item.title}</span>
              <span className="shrink-0 text-fine text-muted-foreground/70">
                {new Date(item.when).toLocaleDateString()}
              </span>
            </button>
          ) : (
            (() => {
              const Icon = iconFor(item.name);
              const [before, match, after] = parts(item);
              return (
                <button
                  key={item.path}
                  data-row={i}
                  onClick={() => onItemClick?.(item)}
                  className={cn(
                    "flex w-full items-baseline gap-2 rounded-md px-2 py-1 text-left transition-colors",
                    i === selectedIndex ? "bg-accent" : "hover:bg-accent/50",
                  )}
                >
                  <Icon className="size-3.5 shrink-0 self-center text-muted-foreground" />
                  <span className="shrink-0 truncate text-ui">
                    {before}
                    <span className="text-primary">{match}</span>
                    {after}
                  </span>
                  {item.dir && (
                    <span className="min-w-0 flex-1 truncate text-right text-fine text-muted-foreground/70">
                      {item.dir}
                    </span>
                  )}
                </button>
              );
            })()
          );
        // Labels only when both kinds show — a pure file list needs no "Files" caption.
        if (hasChats && i === 0) {
          return (
            <div key={`chats-${itemKey(item)}`}>
              <GroupLabel>{t("files.chatsGroup")}</GroupLabel>
              {row}
            </div>
          );
        }
        if (i === firstArtifact && (hasChats || firstFile >= 0)) {
          return (
            <div key={`artifacts-${itemKey(item)}`}>
              <GroupLabel>{t("files.artifactsGroup")}</GroupLabel>
              {row}
            </div>
          );
        }
        if (hasChats && i === firstFile) {
          return (
            <div key={`files-${itemKey(item)}`}>
              <GroupLabel>{t("files.filesGroup")}</GroupLabel>
              {row}
            </div>
          );
        }
        return row;
      })}
    </div>
  );
}
