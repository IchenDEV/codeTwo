import { useCallback, useEffect, useRef, useState } from "react";
import {
  CornerUpLeft,
  FileText,
  FolderTree,
  GitBranch,
  Globe,
  Plus,
  TerminalIcon,
  X,
} from "lucide-react";
import { BrowserPanel } from "../browser/Browser";
import { TerminalPanel } from "../terminal/Terminal";
import { FilePanel } from "../files/FilePanel";
import { FileViewer, type FileRevealTarget } from "../files/FileViewer";
import { dirtyKey, useDirtyPaths } from "../files/dirty";
import { onPtyTitle, ptyDump, ptyKill, type Annotation, type GitStatus } from "../bridge";
import { GitHubPullRequestPanel } from "../git/GitHubPullRequestPanel";
import type { StringKey } from "../i18n/strings";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useT } from "../i18n";
import { cn } from "@/lib/utils";

export type DockSurface = "terminal" | "browser" | "files" | "git";
/** "home" is the dock open with nothing chosen yet — the surface picker. */
export type DockTab = DockSurface | "home";

/** The picker's cards, in the order a coding session tends to want them. */
const SURFACES: { id: DockSurface; icon: typeof Globe; titleKey: StringKey; descKey: StringKey }[] = [
  { id: "browser", icon: Globe, titleKey: "dock.browser", descKey: "dock.browserDesc" },
  { id: "terminal", icon: TerminalIcon, titleKey: "dock.terminal", descKey: "dock.terminalDesc" },
  { id: "files", icon: FolderTree, titleKey: "dock.files", descKey: "dock.filesDesc" },
  { id: "git", icon: GitBranch, titleKey: "dock.git", descKey: "dock.gitDesc" },
];

/**
 * A terminal's identity, and the reason its state survives a remount: the core keys terminals by
 * this string, so the same session, slot, and mode always reach the same emulator. `tmux` is part
 * of it because toggling the checkbox means "a different kind of terminal", not "reconfigure this
 * one" — the emulator it names is already running a shell.
 */
function termId(sessionKey: string, slot: number, tmux: boolean): string {
  return `${sessionKey}-${slot}${tmux ? "-tmux" : ""}`;
}

/** Shell titles are usually a path or a `user@host:/long/path`; the tail is the part that says
 *  where you are. Falls back to the slot number until the shell tells us anything. */
function tabLabel(title: string | undefined, slot: number): string {
  if (!title) return String(slot);
  return title.split("/").filter(Boolean).pop() ?? title;
}

/** The right-side work dock shared by terminal, browser, files, and source control. */
export function Dock({
  open,
  tab,
  onTab,
  onClose,
  cwd,
  projectPath,
  sessionKey,
  git,
  onRefreshGit,
  onOpenSourceControl,
  browserUrl,
  onNavigate,
  onAnnotate,
  onInsertFile,
  onOpenFile,
  onSendText,
  openFiles,
  activeFile,
  fileReveal,
  onActiveFile,
  onCloseFile,
  width,
  onWidth,
  autoTab,
  highlightFile,
  availableSurfaces = ["browser", "terminal", "files", "git"],
}: {
  /** Whether the dock is expanded. It stays mounted while closed so shells survive and the
      collapse can actually animate — unmounting was why closing used to just blink away. */
  open: boolean;
  /** null while closed; the last surface stays rendered underneath the collapse animation. */
  tab: DockTab | null;
  onTab: (t: DockSurface) => void;
  onClose: () => void;
  cwd: string | null;
  /** Source project identity; distinct from `cwd` for isolated worktree sessions. */
  projectPath: string | null;
  sessionKey: string;
  git: GitStatus | null;
  onRefreshGit: () => void;
  onOpenSourceControl: () => void;
  browserUrl: string;
  onNavigate: (u: string) => void;
  onAnnotate: (notes: Annotation[]) => void;
  /** Drops an `@` mention into the prompt document. */
  onInsertFile: (path: string) => void;
  /** Opens a file as a tab in this panel's viewer. */
  onOpenFile: (path: string) => void;
  /** Appends a block to the prompt document — used to hand terminal output to the agent. */
  onSendText: (text: string) => void;
  /** The viewer's open tabs, in open order, and which one is showing. */
  openFiles: string[];
  activeFile: string | null;
  fileReveal: FileRevealTarget | null;
  onActiveFile: (path: string) => void;
  onCloseFile: (path: string) => void;
  /** Dock width in px — dragged by the left-edge grip, persisted by the caller. */
  width: number;
  onWidth: (n: number) => void;
  /** R10 dock follow: the surface the agent is working on right now — its tab gets a subtle
      primary pulse, never a forced switch. */
  autoTab?: DockSurface | null;
  /** The file the agent last touched, marked in the files tree while nothing is open. */
  highlightFile?: string | null;
  /** Component policy gate. Disabled surfaces are neither advertised nor mounted. */
  availableSurfaces?: DockSurface[];
}) {
  const t = useT();
  const dirtyPaths = useDirtyPaths();
  const [terms, setTerms] = useState<number[]>([1]);
  const [activeTerm, setActiveTerm] = useState(1);
  const [nextTerm, setNextTerm] = useState(2);
  const [tmux, setTmux] = useState(false);
  // What each shell calls itself (OSC 0/2) or where it is (OSC 7). A running command is a far
  // better tab label than an ordinal, and the shell hands it to us for nothing.
  const [termTitles, setTermTitles] = useState<Record<string, string>>({});

  useEffect(() => {
    let stop: (() => void) | null = null;
    setTermTitles({});
    void (async () => {
      stop = await onPtyTitle(({ id, title, project_path }) => {
        if (project_path !== projectPath) return;
        setTermTitles((v) => ({ ...v, [id]: title }));
      });
    })();
    return () => stop?.();
  }, [projectPath]);

  const activeTermId = termId(sessionKey, activeTerm, tmux);

  /** Hand the visible terminal's scrollback to the agent. */
  const sendTerminalToAgent = useCallback(async () => {
    const text = (await ptyDump(activeTermId, true)).trimEnd();
    if (text) onSendText(text);
  }, [activeTermId, onSendText]);

  // What the panel shows: the live tab, or — while collapsing — whatever was open last, so the
  // content doesn't vanish mid-animation.
  const availableSurfaceSet = new Set(availableSurfaces);
  const visibleSurfaces = SURFACES.filter(({ id }) => availableSurfaceSet.has(id));
  const lastTab = useRef<DockTab>("home");
  if (tab) lastTab.current = tab;
  const requested = tab ?? lastTab.current;
  const shown = requested === "home" || availableSurfaceSet.has(requested) ? requested : "home";

  // `invisible` only after the collapse has finished: a zero-width element still paints its
  // module shadow as a hairline at the window edge, and hiding it any earlier would cut the
  // animation off — the exact stiffness this rework removes.
  const [gone, setGone] = useState(!open);
  useEffect(() => {
    if (open) {
      setGone(false);
      return;
    }
    const id = window.setTimeout(() => setGone(true), 340);
    return () => window.clearTimeout(id);
  }, [open]);

  // Never let the dock squeeze the document below a usable measure. Persist the preferred width,
  // but clamp only what is applied so it returns in full on a larger window.
  const maxForPlacement = useCallback(
    () => Math.max(300, window.innerWidth - 620),
    [],
  );
  const [maxSize, setMaxSize] = useState(maxForPlacement);
  useEffect(() => {
    const measure = () => setMaxSize(maxForPlacement());
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [maxForPlacement]);
  const applied = Math.min(width, maxSize);

  // A drag must track the pointer 1:1. The open/close width transition below would ease every
  // intermediate width instead, so the edge lags the cursor and then keeps travelling after the
  // mouse stops — and because the inner column is pinned to the new width immediately, the content
  // slides the *other* way inside the lagging panel. Dropping the transition class for the duration
  // of the drag is the fix; a CSS override can't do it, since Tailwind's utility layer wins over
  // anything we write in the components layer regardless of specificity.
  const [dragging, setDragging] = useState(false);

  const startDrag = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startPointer = e.clientX;
      const startSize = applied;
      const onMove = (ev: MouseEvent) => {
        const pointer = ev.clientX;
        const next = Math.round(
          Math.min(
            maxForPlacement(),
            Math.max(300, startSize + (startPointer - pointer)),
          ),
        );
        onWidth(next);
      };
      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        document.body.classList.remove("resizing-h");
        setDragging(false);
        window.dispatchEvent(new Event("resize"));
      };
      document.body.classList.add("resizing-h");
      setDragging(true);
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [applied, maxForPlacement, onWidth],
  );

  return (
    <aside
      data-dock-placement="right"
      aria-hidden={!open}
      onTransitionEnd={(e) => {
        // Terminals and iframes fit themselves to their box — refit once the sweep lands.
        if (
          e.target === e.currentTarget &&
          e.propertyName === "width"
        )
          window.dispatchEvent(new Event("resize"));
      }}
      className={cn(
        "glass-panel dock-panel dock-panel-side relative flex shrink-0 flex-col overflow-hidden border-l",
        // The open/close sweep. Animating the real width moves the document column in the same
        // motion — the old mount-time slide left the layout to snap, which read as an animation
        // cut off halfway. It belongs to open/close only: while the grip is held, the width is the
        // pointer's to set directly.
        dragging && "dock-panel-dragging",
        gone && "invisible",
      )}
      style={{ width: open ? applied : 0 }}
    >
      <div
        data-dock-resize="horizontal"
        className="dock-grip"
        onMouseDown={startDrag}
        title={t("dock.resize")}
      />

      {/* Pin the animated dimension so panel content does not reflow while it sweeps. */}
      <div
        className="flex min-h-0 flex-1 flex-col"
        style={{ width: applied }}
      >
        {shown === "home" ? (
        <>
          {/* Same 48px bar as the surface header below; the shared 28px control plus 10px block
              insets keep the border on the same line even though this row only holds Close. */}
          <div
            data-dock-titlebar
            className="electrobun-webkit-app-region-drag flex items-center gap-1 border-b px-3 py-2.5"
          >
            <div className="electrobun-webkit-app-region-drag flex-1" />
            <Button variant="ghost" size="compact" className="w-(--ds-control-normal) px-0" onClick={onClose} title={t("dock.close")}>
              <X className="size-3.5" />
            </Button>
          </div>
          <div className="flex min-h-0 flex-1 items-start justify-center overflow-y-auto p-6 pt-[18vh]">
            <div className="animate-rise-in w-full max-w-[420px]">
              <h2 className="text-center text-heading font-semibold">{t("dock.openSurface")}</h2>
              <p className="mt-1 text-center text-hint text-muted-foreground">
                {t("dock.openSurfaceHint")}
              </p>
              <div className="mt-6 grid grid-cols-2 gap-3">
                {visibleSurfaces.map(({ id, icon: Icon, titleKey, descKey }) => (
                  <button
                    key={id}
                    onClick={() => onTab(id)}
                    className="flex flex-col items-start gap-2.5 rounded-xl bg-card/60 p-4 text-left ring-1 ring-foreground/10 transition-[background-color,box-shadow] hover:bg-accent/50 hover:ring-primary/40"
                  >
                    <Icon className="size-5 text-muted-foreground" />
                    <span>
                      <span className="block text-ui font-semibold">{t(titleKey)}</span>
                      <span className="mt-0.5 block text-fine leading-relaxed text-muted-foreground">
                        {t(descKey)}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      ) : (
      <Tabs value={shown} onValueChange={(v) => onTab(v as DockSurface)} className="flex min-h-0 flex-1 flex-col gap-0">
        {/* The explicit 48px height matches the main header, so this tab row and the breadcrumb
            share one vertical centre and one continuous bottom border. It drags the window for the
            same reason: the overlay title bar leaves nothing else to grab. */}
        <div
          data-dock-titlebar
          className="electrobun-webkit-app-region-drag flex items-center gap-1 border-b px-3 py-2.5"
        >
          <TabsList variant="toolbar">
            {visibleSurfaces.map(({ id, icon: Icon, titleKey }) => (
              <TabsTrigger
                key={id}
                value={id}
                title={autoTab === id ? `${t(titleKey)} · ${t("dockFollow.auto")}` : t(titleKey)}
              >
                <Icon className="size-3.5" />
                <span className="dock-tab-label">{t(titleKey)}</span>
                {autoTab === id && (
                  <span className="size-1.5 animate-pulse rounded-full bg-primary" />
                )}
              </TabsTrigger>
            ))}
          </TabsList>
          <div className="electrobun-webkit-app-region-drag flex-1" />
          <Button variant="ghost" size="compact" className="w-(--ds-control-normal) px-0" onClick={onClose} title={t("dock.close")}>
            <X className="size-3.5" />
          </Button>
        </div>

        {/* Terminal — all instances stay mounted so switching tabs doesn't kill a shell. The strip
            is the same h-9 bordered bar as the files tabs; the emulator below follows the app's
            scheme, so no dark slab and no frame around it. */}
        {availableSurfaceSet.has("terminal") && <TabsContent value="terminal" className="m-0 flex min-h-0 flex-1 flex-col">
          <div className="flex h-9 shrink-0 items-center gap-0.5 overflow-x-auto border-b px-2">
            {terms.map((n) => (
              <button
                key={n}
                title={termTitles[termId(sessionKey, n, tmux)] || undefined}
                onClick={() => {
                  setActiveTerm(n);
                  setTimeout(() => window.dispatchEvent(new Event("resize")), 0);
                }}
                className={cn(
                  "group relative flex h-full max-w-40 shrink-0 items-center gap-1.5 px-2.5 text-hint transition-colors",
                  n === activeTerm ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span className="truncate">{tabLabel(termTitles[termId(sessionKey, n, tmux)], n)}</span>
                {terms.length > 1 && (
                  <X
                    className="size-3 shrink-0 opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      const left = terms.filter((x) => x !== n);
                      setTerms(left);
                      if (activeTerm === n && left[0]) setActiveTerm(left[0]);
                      // Closing a tab is the one action that ends a terminal — remounting the panel
                      // deliberately doesn't. Both modes go, since the tmux checkbox picks between
                      // two separate terminals in this slot.
                      void ptyKill(termId(sessionKey, n, false));
                      void ptyKill(termId(sessionKey, n, true));
                    }}
                  />
                )}
                {n === activeTerm && (
                  <span className="absolute inset-x-1.5 -bottom-px h-0.5 rounded-full bg-primary" />
                )}
              </button>
            ))}
            <button
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              title={t("dock.newTerminal")}
              onClick={() => {
                setTerms((v) => [...v, nextTerm]);
                setActiveTerm(nextTerm);
                setNextTerm((n) => n + 1);
              }}
            >
              <Plus className="size-3" />
            </button>
            <div className="min-w-0 flex-1" />
            <button
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              title={t("dock.sendTerminal")}
              onClick={() => void sendTerminalToAgent()}
            >
              <CornerUpLeft className="size-3" />
            </button>
            <label className="flex shrink-0 cursor-pointer items-center gap-1.5 px-1 text-fine text-muted-foreground">
              <Checkbox
                checked={tmux}
                onCheckedChange={(v) => setTmux(v === true)}
                className="size-3.5"
              />
              {t("dock.tmux")}
            </label>
          </div>
          {terms.map((n) => (
            <div key={n} className="min-h-0 flex-1" style={{ display: n === activeTerm ? "flex" : "none" }}>
              <TerminalPanel
                id={termId(sessionKey, n, tmux)}
                cwd={cwd}
                projectPath={projectPath}
                tmux={tmux}
              />
            </div>
          ))}
        </TabsContent>}

        {availableSurfaceSet.has("browser") && <TabsContent value="browser" className="m-0 flex min-h-0 flex-1">
          <BrowserPanel
            url={browserUrl}
            projectPath={projectPath}
            visible={open}
            onNavigate={onNavigate}
            onAnnotate={onAnnotate}
          />
        </TabsContent>}

        {/* Files, reference-style: tabs over the viewer, and the tree in its own column on the
            far right with the search box on top. */}
        {availableSurfaceSet.has("files") && <TabsContent value="files" className="m-0 flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col">
            {/* One tab per open file. Active gets the primary underline. h-9 matches the tree's
                search row on the other side of the border, so the two strips read as one bar. */}
            <div className="flex h-9 shrink-0 items-center gap-0.5 overflow-x-auto border-b px-2">
              {openFiles.map((p) => {
                const name = p.split("/").pop() ?? p;
                const active = p === activeFile;
                return (
                  <button
                    key={p}
                    onClick={() => onActiveFile(p)}
                    title={p}
                    className={cn(
                      "group relative flex h-full max-w-48 shrink-0 items-center gap-1.5 px-2.5 text-hint transition-colors",
                      active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <FileText className="size-3.5 shrink-0" />
                    <span className="truncate">{name}</span>
                    {cwd && dirtyPaths.has(dirtyKey(cwd, p)) && (
                      <span className="size-1.5 shrink-0 rounded-full bg-warning" />
                    )}
                    <X
                      className="size-3 shrink-0 opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        onCloseFile(p);
                      }}
                    />
                    {active && (
                      <span className="absolute inset-x-1.5 -bottom-px h-0.5 rounded-full bg-primary" />
                    )}
                  </button>
                );
              })}
            </div>

            {activeFile && cwd ? (
              <FileViewer
                key={activeFile}
                cwd={cwd}
                path={activeFile}
                onInsert={onInsertFile}
                onOpen={onOpenFile}
                onComment={onSendText}
                reveal={fileReveal}
              />
            ) : (
              <div className="flex min-h-0 flex-1 items-center justify-center p-6">
                <p className="text-center text-hint leading-relaxed text-muted-foreground">
                  {t("files.noneOpen")}
                </p>
              </div>
            )}
          </div>

          <div className="flex w-60 shrink-0 flex-col border-l">
            {/* R10: while no file is open in the viewer, mark the file the agent last touched —
                the tree's existing openPath mechanism, not a forced reveal. */}
            <FilePanel
              cwd={cwd}
              onInsert={onInsertFile}
              onOpen={onOpenFile}
              openPath={activeFile ?? highlightFile ?? null}
            />
          </div>
        </TabsContent>}

        {availableSurfaceSet.has("git") && <TabsContent value="git" className="m-0 min-h-0 flex-1">
          <ScrollArea className="h-full">
            <div className="space-y-2.5 p-4 text-hint">
              {git?.is_repo ? (
                <>
                  <GitHubPullRequestPanel
                    key={`${cwd ?? "."}:${git.branch}`}
                    cwd={cwd ?? "."}
                    branch={git.branch}
                    onRefreshGit={onRefreshGit}
                  />

                  <section className="space-y-2.5 pt-3" aria-label={t("dock.workingTree")}>
                    <div className="flex items-center gap-2">
                      <GitBranch className="size-3.5" />
                      <h3 className="text-ui font-semibold">{t("dock.workingTree")}</h3>
                      <span className="min-w-0 truncate font-mono text-cap text-muted-foreground">
                        {git.branch || "?"}
                      </span>
                      {git.ahead > 0 && <span className="text-primary">↑{git.ahead}</span>}
                      {git.behind > 0 && <span className="text-primary">↓{git.behind}</span>}
                    </div>

                    {git.files.length === 0 ? (
                      <p className="text-muted-foreground">{t("rail.clean")}</p>
                    ) : (
                      <div className="space-y-0.5">
                        {git.files.map((f) => (
                          <div key={f.path} className="flex items-center gap-2">
                            <span
                              className={cn(
                                "inline-flex size-4 shrink-0 items-center justify-center rounded text-cap font-bold",
                                f.staged ? "bg-success/15 text-success" : "bg-warning/15 text-warning",
                              )}
                              title={f.state}
                            >
                              {f.state.charAt(0).toUpperCase()}
                            </span>
                            <span className="truncate font-mono text-fine text-muted-foreground">{f.path}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    <Button size="sm" className="w-full" onClick={onOpenSourceControl}>
                      {t("dock.reviewCommit")}
                    </Button>
                  </section>
                </>
              ) : (
                <p className="text-muted-foreground">{t("rail.notARepo")}</p>
              )}
            </div>
          </ScrollArea>
        </TabsContent>}
      </Tabs>
      )}
      </div>
    </aside>
  );
}
