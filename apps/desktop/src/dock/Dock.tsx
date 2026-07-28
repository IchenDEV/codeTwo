import { useCallback, useEffect, useState } from "react";
import { FolderTree, GitBranch, Globe, Maximize2, Minimize2, Plus, TerminalIcon, X } from "lucide-react";
import { BrowserPanel } from "../browser/Browser";
import { TerminalPanel } from "../terminal/Terminal";
import { FilePanel } from "../files/FilePanel";
import type { GitStatus } from "../bridge";
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
 * A side dock rather than stacked bottom panels: the terminal, browser, and git status sit beside
 * the document instead of eating its vertical space, and only one is visible at a time. Opened
 * without a surface it shows a picker — four cards that say what each surface is for — instead of
 * guessing which one you wanted.
 */
export function Dock({
  tab,
  onTab,
  onClose,
  cwd,
  sessionKey,
  git,
  onRefreshGit,
  onOpenSourceControl,
  browserUrl,
  onNavigate,
  onAnnotate,
  onInsertFile,
  onOpenFile,
  openFile,
  width,
  onWidth,
}: {
  tab: DockTab;
  onTab: (t: DockSurface) => void;
  onClose: () => void;
  cwd: string | null;
  sessionKey: string;
  git: GitStatus | null;
  onRefreshGit: () => void;
  onOpenSourceControl: () => void;
  browserUrl: string;
  onNavigate: (u: string) => void;
  onAnnotate: (note: string) => void;
  /** Drops an `@` mention into the prompt document. */
  onInsertFile: (path: string) => void;
  /** Shows a file in the built-in viewer. */
  onOpenFile: (path: string) => void;
  /** Which file the viewer has open, so the tree can mark it. */
  openFile: string | null;
  /** Dock width in px — dragged by the left-edge grip, persisted by the caller. */
  width: number;
  onWidth: (n: number) => void;
}) {
  const t = useT();
  const [terms, setTerms] = useState<number[]>([1]);
  const [activeTerm, setActiveTerm] = useState(1);
  const [nextTerm, setNextTerm] = useState(2);
  const [tmux, setTmux] = useState(false);

  // Never let the dock squeeze the document column below a usable measure. This is applied on every
  // render, not just while dragging: a width saved on a wide display would otherwise come back on a
  // laptop screen and leave the document a sliver. The preferred width is kept, only the *applied*
  // one is clamped, so it returns in full on a big window.
  const [maxWidth, setMaxWidth] = useState(() => Math.max(300, window.innerWidth - 620));
  useEffect(() => {
    const measure = () => setMaxWidth(Math.max(300, window.innerWidth - 620));
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  const applied = Math.min(width, maxWidth);

  // T3-style widen/restore: one click to take all the room the document can spare, one to give it
  // back. The pre-max width is remembered so restore means *your* width, not a default.
  const [preMax, setPreMax] = useState<number | null>(null);
  const maximized = applied >= maxWidth - 4;
  const toggleMax = () => {
    if (maximized) onWidth(Math.min(preMax ?? 440, maxWidth));
    else {
      setPreMax(applied);
      onWidth(maxWidth);
    }
    setTimeout(() => window.dispatchEvent(new Event("resize")), 0);
  };

  const maxButton = (
    <Button
      variant="ghost"
      size="icon"
      className="size-6"
      onClick={toggleMax}
      title={maximized ? t("dock.restore") : t("dock.maximize")}
    >
      {maximized ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
    </Button>
  );

  const startDrag = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startW = applied;
      const onMove = (ev: MouseEvent) => {
        const max = Math.max(300, window.innerWidth - 620);
        onWidth(Math.round(Math.min(max, Math.max(300, startW + (startX - ev.clientX)))));
      };
      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        document.body.classList.remove("resizing-h");
        window.dispatchEvent(new Event("resize"));
      };
      document.body.classList.add("resizing-h");
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [applied, onWidth],
  );

  return (
    <aside
      className="glass-panel animate-slide-in-right relative flex min-w-[300px] shrink-0 flex-col border-l"
      style={{ width: applied }}
    >
      <div className="dock-grip" onMouseDown={startDrag} title={t("dock.resize")} />

      {tab === "home" ? (
        <>
          {/* Same titlebar inset and drag behaviour as the surface header below. */}
          <div data-tauri-drag-region className="flex items-center gap-1 px-3 pb-2.5 pt-7">
            <div data-tauri-drag-region className="flex-1" />
            {maxButton}
            <Button variant="ghost" size="icon" className="size-6" onClick={onClose} title={t("dock.close")}>
              <X className="size-3.5" />
            </Button>
          </div>
          <div className="flex min-h-0 flex-1 items-start justify-center overflow-y-auto p-6 pt-[18vh]">
            <div className="animate-rise-in w-full max-w-[420px]">
              <h2 className="text-center text-[17px] font-semibold">{t("dock.openSurface")}</h2>
              <p className="mt-1 text-center text-[12px] text-muted-foreground">
                {t("dock.openSurfaceHint")}
              </p>
              <div className="mt-6 grid grid-cols-2 gap-3">
                {SURFACES.map(({ id, icon: Icon, titleKey, descKey }) => (
                  <button
                    key={id}
                    onClick={() => onTab(id)}
                    className="flex flex-col items-start gap-2.5 rounded-xl border bg-card/40 p-4 text-left transition-colors hover:border-primary/40 hover:bg-accent"
                  >
                    <Icon className="size-5 text-muted-foreground" />
                    <span>
                      <span className="block text-[13px] font-semibold">{t(titleKey)}</span>
                      <span className="mt-0.5 block text-[11.5px] leading-relaxed text-muted-foreground">
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
      <Tabs value={tab} onValueChange={(v) => onTab(v as DockSurface)} className="flex min-h-0 flex-1 flex-col gap-0">
        {/* pt-7 matches the main header's titlebar inset so the two rows line up, and it drags the
            window for the same reason: the overlay title bar leaves nothing else to grab. */}
        {/* Frameless tab pills rather than the boxed segmented control — the dock's chrome should
            weigh less than what's inside it. */}
        <div data-tauri-drag-region className="flex items-center gap-1 border-b px-3 pb-2 pt-7">
          <TabsList className="h-7 gap-0.5 bg-transparent p-0">
            {SURFACES.map(({ id, icon: Icon, titleKey }) => (
              <TabsTrigger
                key={id}
                value={id}
                className="gap-1.5 rounded-md px-2 text-xs text-muted-foreground shadow-none data-[state=active]:bg-accent data-[state=active]:shadow-none dark:data-[state=active]:border-transparent dark:data-[state=active]:bg-accent"
              >
                <Icon className="size-3.5" /> {t(titleKey)}
              </TabsTrigger>
            ))}
          </TabsList>
          <div data-tauri-drag-region className="flex-1" />
          {maxButton}
          <Button variant="ghost" size="icon" className="size-6" onClick={onClose} title={t("dock.close")}>
            <X className="size-3.5" />
          </Button>
        </div>

        {/* Terminal — all instances stay mounted so switching tabs doesn't kill a shell. */}
        <TabsContent value="terminal" className="m-0 flex min-h-0 flex-1 flex-col bg-terminal p-1.5">
          <div className="flex items-center gap-1 pb-1.5">
            {terms.map((n) => (
              <button
                key={n}
                onClick={() => {
                  setActiveTerm(n);
                  setTimeout(() => window.dispatchEvent(new Event("resize")), 0);
                }}
                className={cn(
                  "flex items-center gap-1 rounded px-2 py-0.5 text-[11px]",
                  n === activeTerm ? "bg-primary text-primary-foreground" : "bg-white/10 text-white/70",
                )}
              >
                {n}
                {terms.length > 1 && (
                  <X
                    className="size-3"
                    onClick={(e) => {
                      e.stopPropagation();
                      const left = terms.filter((x) => x !== n);
                      setTerms(left);
                      if (activeTerm === n && left[0]) setActiveTerm(left[0]);
                    }}
                  />
                )}
              </button>
            ))}
            <button
              className="rounded bg-white/10 px-1.5 py-0.5 text-white/70"
              title={t("dock.newTerminal")}
              onClick={() => {
                setTerms((v) => [...v, nextTerm]);
                setActiveTerm(nextTerm);
                setNextTerm((n) => n + 1);
              }}
            >
              <Plus className="size-3" />
            </button>
            <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-[11px] text-white/60">
              <Checkbox
                checked={tmux}
                onCheckedChange={(v) => setTmux(v === true)}
                className="size-3.5 border-white/30"
              />
              tmux
            </label>
          </div>
          {terms.map((n) => (
            <div key={n} className="min-h-0 flex-1" style={{ display: n === activeTerm ? "flex" : "none" }}>
              <TerminalPanel cwd={cwd} tmux={tmux} sessionKey={`${sessionKey}-${n}`} />
            </div>
          ))}
        </TabsContent>

        <TabsContent value="browser" className="m-0 flex min-h-0 flex-1">
          <BrowserPanel url={browserUrl} onNavigate={onNavigate} onAnnotate={onAnnotate} />
        </TabsContent>

        <TabsContent value="files" className="m-0 flex min-h-0 flex-1">
          <FilePanel cwd={cwd} onInsert={onInsertFile} onOpen={onOpenFile} openPath={openFile} />
        </TabsContent>

        <TabsContent value="git" className="m-0 min-h-0 flex-1">
          <ScrollArea className="h-full">
            <div className="space-y-2.5 p-4 text-xs">
              {git?.is_repo ? (
                <>
                  <div className="flex items-center gap-2">
                    <GitBranch className="size-3.5" />
                    <span className="text-[13px] font-semibold">{git.branch || "?"}</span>
                    {git.ahead > 0 && <span className="text-primary">↑{git.ahead}</span>}
                    {git.behind > 0 && <span className="text-primary">↓{git.behind}</span>}
                    <Button variant="ghost" size="sm" className="ml-auto h-6 text-[11px]" onClick={onRefreshGit}>
                      {t("dock.refresh")}
                    </Button>
                  </div>

                  {git.files.length === 0 ? (
                    <p className="text-muted-foreground">{t("rail.clean")}</p>
                  ) : (
                    <div className="space-y-0.5">
                      {git.files.map((f) => (
                        <div key={f.path} className="flex items-center gap-2">
                          <span
                            className={cn(
                              "inline-flex size-4 shrink-0 items-center justify-center rounded text-[9px] font-bold",
                              f.staged ? "bg-success/15 text-success" : "bg-warning/15 text-warning",
                            )}
                            title={f.state}
                          >
                            {f.state.charAt(0).toUpperCase()}
                          </span>
                          <span className="truncate font-mono text-[11px] text-muted-foreground">{f.path}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <Button size="sm" className="w-full" onClick={onOpenSourceControl}>
                    {t("dock.reviewCommit")}
                  </Button>
                </>
              ) : (
                <p className="text-muted-foreground">{t("rail.notARepo")}</p>
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
      )}
    </aside>
  );
}
