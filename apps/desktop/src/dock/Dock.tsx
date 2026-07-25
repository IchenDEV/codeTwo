import { useCallback, useEffect, useState } from "react";
import { GitBranch, Globe, Plus, TerminalIcon, X } from "lucide-react";
import { BrowserPanel } from "../browser/Browser";
import { TerminalPanel } from "../terminal/Terminal";
import type { GitStatus } from "../bridge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useT } from "../i18n";
import { cn } from "@/lib/utils";

export type DockTab = "terminal" | "browser" | "git";

/**
 * A side dock rather than stacked bottom panels: the terminal, browser, and git status sit beside
 * the document instead of eating its vertical space, and only one is visible at a time.
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
  width,
  onWidth,
}: {
  tab: DockTab;
  onTab: (t: DockTab) => void;
  onClose: () => void;
  cwd: string | null;
  sessionKey: string;
  git: GitStatus | null;
  onRefreshGit: () => void;
  onOpenSourceControl: () => void;
  browserUrl: string;
  onNavigate: (u: string) => void;
  onAnnotate: (note: string) => void;
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

      <Tabs value={tab} onValueChange={(v) => onTab(v as DockTab)} className="flex min-h-0 flex-1 flex-col gap-0">
        {/* pt-7 matches the main header's titlebar inset so the two rows line up, and it drags the
            window for the same reason: the overlay title bar leaves nothing else to grab. */}
        <div data-tauri-drag-region className="flex items-center gap-2 border-b px-3 pb-2.5 pt-7">
          <TabsList className="h-7">
            <TabsTrigger value="terminal" className="gap-1.5 text-xs">
              <TerminalIcon className="size-3.5" /> {t("dock.terminal")}
            </TabsTrigger>
            <TabsTrigger value="browser" className="gap-1.5 text-xs">
              <Globe className="size-3.5" /> {t("dock.browser")}
            </TabsTrigger>
            <TabsTrigger value="git" className="gap-1.5 text-xs">
              <GitBranch className="size-3.5" /> {t("dock.git")}
            </TabsTrigger>
          </TabsList>
          <Button variant="ghost" size="icon" className="ml-auto size-6" onClick={onClose} title={t("dock.close")}>
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
    </aside>
  );
}
