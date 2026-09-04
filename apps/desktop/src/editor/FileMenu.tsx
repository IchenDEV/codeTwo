import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import {
  FileCode,
  FileImage,
  FileJson,
  FileText,
  FileType,
  MessageSquare,
  Package,
} from "@/components/ui/icons";
import type { HugeIcon } from "@/components/ui/icons";
import type { SuggestionMenuProps } from "@blocknote/react";

import { useT } from "../i18n";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
One workspace file, split for display. The core ranks these; this only draws them.
*/
export interface FileItem {
  kind: "file";
  path: string;
  /**
  `src/session/` — dimmed, so the eye lands on the name. Empty at the workspace root.
  */
  dir: string;
  name: string;
  /**
  Where the query matched `name`, for highlighting. Null when it matched only the directory.
  */
  hit: [number, number] | null;
}

/**
One past chat, offered for `@`-mentioning its transcript as context.
*/
export interface ChatItem {
  kind: "chat";
  id: string;
  title: string;
  /**
  `created_at` in ms — drawn as a short date so same-titled chats stay tellable apart.
  */
  when: number;
}

/**
One stored scene artifact, offered for `@`-mentioning its content as context (R4).
*/
export interface ArtifactAtItem {
  kind: "artifact";
  recordId: number;
  title: string;
  /**
  Declared scene-artifact kind ("plan", "report", …) — drawn as the row's right-hand hint.
  */
  artifactKind: string;
  version: number;
}

/**
Everything the `@` picker can insert: chats, then artifacts, then workspace files.
*/
export type AtItem = ChatItem | ArtifactAtItem | FileItem;

const byExtension: Record<string, HugeIcon> = {
  conf: FileType,
  css: FileCode,
  gif: FileImage,
  go: FileCode,
  html: FileCode,
  icns: FileImage,
  ico: FileImage,
  ini: FileType,
  jpeg: FileImage,
  jpg: FileImage,
  js: FileCode,
  json: FileJson,
  jsx: FileCode,
  lock: FileJson,
  plist: FileType,
  png: FileImage,
  py: FileCode,
  rb: FileCode,
  rs: FileCode,
  sh: FileCode,
  svg: FileImage,
  swift: FileCode,
  toml: FileType,
  ts: FileCode,
  tsx: FileCode,
  webp: FileImage,
  yaml: FileType,
  yml: FileType,
};

function iconFor(name: string): HugeIcon {
  const dot = name.lastIndexOf(".");
  return (
    (dot > 0 && byExtension[name.slice(dot + 1).toLowerCase()]) || FileText
  );
}

function parts(item: FileItem): [string, string, string] {
  if (!item.hit) {
    return [item.name, "", ""];
  }
  const [from, to] = item.hit;
  return [
    item.name.slice(0, from),
    item.name.slice(from, to),
    item.name.slice(to),
  ];
}

function itemKey(item: AtItem): string {
  if (item.kind === "chat") {
    return item.id;
  }
  if (item.kind === "artifact") {
    return `artifact-${item.recordId}`;
  }
  return item.path;
}

/**
Muted group label — only drawn when the list actually mixes chats and files.
*/
const GroupLabel = ({ children }: { readonly children: ReactNode }) => (
  <p className="text-metadata text-muted-foreground px-2 pt-1.5 pb-0.5 first:pt-1">
    {children}
  </p>
);

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
export const FileMenu = ({
  items,
  loadingState,
  selectedIndex,
  onItemClick,
}: SuggestionMenuProps<AtItem>) => {
  const t = useT();
  const listRef = useRef<HTMLDivElement | null>(null);

  // Arrow keys are the controller's; it moves `selectedIndex` without knowing this list scrolls.
  // Rows are found by index attribute — group labels between them would break child-position math.
  useEffect(() => {
    if (selectedIndex === undefined) {
      return;
    }
    listRef.current
      ?.querySelector(`[data-row="${selectedIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  if (loadingState === "loading-initial") {
    return (
      <div className="raised-material w-menu-wide rounded-module text-callout text-muted-foreground shadow-menu p-3">
        {t("files.searching")}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="raised-material w-menu-wide rounded-module text-callout text-muted-foreground shadow-menu p-3">
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
      className="raised-material w-menu-wide rounded-menu p-menu shadow-menu max-h-72 overflow-y-auto"
    >
      {items.map((item, i) => {
        const row =
          item.kind === "artifact" ? (
            <Button
              key={`artifact-${item.recordId}`}
              type="button"
              variant="selectable"
              size="row"
              focusStyle="inset"
              data-selected={i === selectedIndex ? "true" : "false"}
              data-row={i}
              onClick={() => onItemClick?.(item)}
              className={cn(
                "w-full items-baseline gap-2 px-2 py-1",
                i === selectedIndex ? "bg-accent" : "hover:bg-accent/50"
              )}
            >
              <Package className="text-muted-foreground size-3.5 shrink-0 self-center" />
              <span className="text-body min-w-0 flex-1 truncate">
                {item.title}
              </span>
              <span className="text-callout text-muted-foreground/70 shrink-0">
                {item.artifactKind} · v{item.version}
              </span>
            </Button>
          ) : item.kind === "chat" ? (
            <Button
              key={item.id}
              type="button"
              variant="selectable"
              size="row"
              focusStyle="inset"
              data-selected={i === selectedIndex ? "true" : "false"}
              data-row={i}
              onClick={() => onItemClick?.(item)}
              className={cn(
                "w-full items-baseline gap-2 px-2 py-1",
                i === selectedIndex ? "bg-accent" : "hover:bg-accent/50"
              )}
            >
              <MessageSquare className="text-muted-foreground size-3.5 shrink-0 self-center" />
              <span className="text-body min-w-0 flex-1 truncate">
                {item.title}
              </span>
              <span className="text-callout text-muted-foreground/70 shrink-0">
                {new Date(item.when).toLocaleDateString()}
              </span>
            </Button>
          ) : (
            (() => {
              const Icon = iconFor(item.name);
              const [before, match, after] = parts(item);
              return (
                <Button
                  key={item.path}
                  type="button"
                  variant="selectable"
                  size="row"
                  focusStyle="inset"
                  data-selected={i === selectedIndex ? "true" : "false"}
                  data-row={i}
                  onClick={() => onItemClick?.(item)}
                  className={cn(
                    "w-full items-baseline gap-2 px-2 py-1",
                    i === selectedIndex ? "bg-accent" : "hover:bg-accent/50"
                  )}
                >
                  <Icon className="text-muted-foreground size-3.5 shrink-0 self-center" />
                  <span className="text-body shrink-0 truncate">
                    {before}
                    <span className="text-primary">{match}</span>
                    {after}
                  </span>
                  {item.dir ? (
                    <span className="text-callout text-muted-foreground/70 min-w-0 flex-1 truncate text-right">
                      {item.dir}
                    </span>
                  ) : null}
                </Button>
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
};
