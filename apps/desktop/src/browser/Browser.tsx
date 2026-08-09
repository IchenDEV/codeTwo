import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  ExternalLink,
  Globe,
  Inspect,
  Minus,
  MonitorSmartphone,
  MoreVertical,
  Plus,
  RotateCw,
  SquareDashedMousePointer,
  Trash2,
  X,
} from "lucide-react";

import {
  browserAnnotate,
  browserAnnotationCount,
  browserAnnotations,
  browserAnnotationsClear,
  browserBounds,
  browserClose,
  browserCloseAll,
  browserDevtools,
  browserHistory,
  browserNavigate,
  browserOpen,
  browserReload,
  browserVisible,
  browserZoom,
  isDesktop,
  onBrowserLoad,
  onBrowserNav,
  onBrowserPopup,
  onBrowserTitle,
  openExternal,
  type Annotation,
} from "../bridge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useT } from "../i18n";
import { useToast } from "../ui/toast";
import { cn } from "@/lib/utils";
import {
  loadBrowserHistory,
  recentSitesForProject,
  recordBrowserVisit,
  removeBrowserVisit,
  saveBrowserHistory,
  updateBrowserVisitTitle,
  type BrowserHistoryState,
  type StorageLike,
} from "./history";

const BLANK = "about:blank";

/** "3000" → localhost:3000, "localhost:1420" → http, everything else defaults to https. */
function normalizeUrl(u: string): string {
  const s = u.trim();
  if (/^\d+$/.test(s)) return `http://localhost:${s}`;
  if (/^https?:\/\//.test(s)) return s;
  if (/^(localhost|127\.|0\.0\.0\.0)/.test(s)) return `http://${s}`;
  return `https://${s}`;
}

function hostOf(u: string): string | null {
  try {
    const h = new URL(u).host;
    return h || null;
  } catch {
    return null;
  }
}

/**
 * One open page, backed by a native child webview labelled `browser-<id>`.
 *
 * There is no history stack here any more. The webview owns its own — a link click inside the page
 * is a navigation we never asked for — so back and forward are `history.go()` in the page, and `url`
 * is whatever the webview last told us it is.
 */
interface Tab {
  id: number;
  url: string;
  title: string;
}

const labelOf = (id: number) => `browser-${id}`;

function visitAge(at: number, now = Date.now()): string | null {
  const minutes = Math.max(0, Math.floor((now - at) / 60_000));
  if (minutes < 1) return null;
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function localHistoryStorage(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** True while a dock or split drag is live (the class the drag handlers put on `<body>`).
 *
 *  The DOM equivalent was `pointer-events: none` on the iframe. A native webview has no such switch:
 *  the moment the pointer crosses into it, the app's own webview stops seeing `mousemove` and the
 *  drag dies halfway. So the page gets out of the way for the length of the drag. */
function useDragging(): boolean {
  const [dragging, set] = useState(false);
  useEffect(() => {
    const read = () =>
      set(document.body.classList.contains("resizing-h") || document.body.classList.contains("resizing-v"));
    read();
    const mo = new MutationObserver(read);
    mo.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);
  return dragging;
}

/** A menu row. The popover-of-buttons shape, styled like a native context menu. */
function MenuItem({
  icon: Icon,
  label,
  onClick,
  checked,
}: {
  icon: typeof Globe;
  label: string;
  onClick: () => void;
  checked?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-hint transition-colors hover:bg-accent/50"
    >
      <Icon className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="flex-1">{label}</span>
      {checked && <Check className="size-3.5 shrink-0 text-primary" />}
    </button>
  );
}

/**
 * The built-in browser as browser, not just an iframe with an address bar: tabs along the top,
 * back/forward/reload, an overflow menu with the inspector, zoom and device widths — and the
 * annotate bar at the bottom, which is the part that makes it Code2's browser rather than a
 * worse Safari: what you see feeds the prompt.
 *
 * The page itself is a native webview floating over `hostRef`, because an iframe cannot browse:
 * `X-Frame-Options: DENY` and `frame-ancestors` are honoured, and most of the web — github.com and
 * google.com included — comes back blank. Two consequences the code below spends its time on: the
 * page area's geometry has to be pushed to the native side whenever it changes, and the page is
 * *above* the DOM, so anything we want to draw over it means hiding it first.
 */
export function BrowserPanel({
  url,
  projectPath,
  visible,
  onNavigate,
  onAnnotate,
}: {
  url: string;
  /** Logical source project. Worktree sessions keep browser history with their source project. */
  projectPath: string | null;
  /** The dock's open state. It closes by sweeping its width to zero without unmounting, and a
   *  native view has no idea it is inside a collapsed box — it would keep painting over the app. */
  visible: boolean;
  onNavigate: (u: string) => void;
  /** Everything the user marked up on the page, one entry per annotated element. */
  onAnnotate: (notes: Annotation[]) => void;
}) {
  const t = useT();
  const toast = useToast();
  const [tabs, setTabs] = useState<Tab[]>([{ id: 1, url, title: "" }]);
  const [activeId, setActiveId] = useState(1);
  const [addr, setAddr] = useState(url === BLANK ? "" : url);
  const [menuOpen, setMenuOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [device, setDevice] = useState<number | null>(null);
  const [deviceBar, setDeviceBar] = useState(false);
  const addrRef = useRef<HTMLInputElement | null>(null);
  const nextId = useRef(1);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const dragging = useDragging();
  const [annotating, setAnnotating] = useState(false);
  const [pending, setPending] = useState(0);
  const [historyState, setHistoryState] = useState<BrowserHistoryState>(() =>
    loadBrowserHistory(typeof window === "undefined" ? null : localHistoryStorage()),
  );

  const active = tabs.find((x) => x.id === activeId) ?? tabs[0];
  const activeLabel = labelOf(active.id);
  const blank = active.url === BLANK;
  // A native view can't be layered under a popover, and can't let a drag pass through it either, so
  // the page steps aside for both.
  const showPage = visible && !blank && !menuOpen && !dragging;
  const recentSites = recentSitesForProject(historyState, projectPath);
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const projectPathRef = useRef(projectPath);
  projectPathRef.current = projectPath;
  const annotatingRef = useRef(annotating);
  annotatingRef.current = annotating;

  useEffect(() => {
    // Another window or a previous mount may have written newer history. Re-read at the project
    // boundary rather than carrying one project's in-memory list into another.
    setHistoryState(loadBrowserHistory(localHistoryStorage()));
  }, [projectPath]);

  const updateHistory = useCallback(
    (update: (current: BrowserHistoryState) => BrowserHistoryState) => {
      const storage = localHistoryStorage();
      const current = loadBrowserHistory(storage);
      const next = update(current);
      saveBrowserHistory(storage, next);
      setHistoryState(next);
    },
    [],
  );

  const patch = (id: number, f: (t: Tab) => Tab) =>
    setTabs((prev) => prev.map((x) => (x.id === id ? f(x) : x)));

  /** Where the native page belongs, in the window's own logical coordinates. */
  const rect = useCallback(() => {
    const r = hostRef.current?.getBoundingClientRect();
    return r ? { x: r.left, y: r.top, width: r.width, height: r.height } : null;
  }, []);

  /* Create/move/show the active tab's webview. This runs on every layout-affecting change, and
     `browser_open` is idempotent, so it doubles as the "keep it pinned to the placeholder" path. */
  useLayoutEffect(() => {
    const r = rect();
    if (!r) return;
    if (!showPage) {
      void browserVisible(activeLabel, false);
      return;
    }
    void browserOpen(activeLabel, active.url, r);
  }, [activeLabel, active.url, showPage, device, rect]);

  /* Hide every other tab's page: they stay alive (and keep their scroll position) but must not
     paint over the one in front. */
  useEffect(() => {
    for (const x of tabs) if (x.id !== activeId) void browserVisible(labelOf(x.id), false);
  }, [tabs, activeId]);

  /* The dock is resizable and the window is not, so a size change of the placeholder is the common
     case; a window resize moves it without resizing it, which the listener covers. */
  useEffect(() => {
    const sync = () => {
      const r = rect();
      if (r && showPage) void browserBounds(activeLabel, r);
    };
    const ro = new ResizeObserver(sync);
    if (hostRef.current) ro.observe(hostRef.current);
    window.addEventListener("resize", sync);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", sync);
    };
  }, [activeLabel, showPage, rect]);

  useEffect(() => {
    void browserZoom(activeLabel, zoom);
  }, [activeLabel, zoom]);

  /* Element picking follows the toggle, the active tab, and — via `browser-load` — every fresh
     document, since a new page comes with a new, disarmed annotator. */
  useEffect(() => {
    if (blank) return;
    void browserAnnotate(activeLabel, annotating);
  }, [activeLabel, annotating, blank]);

  /* The badge. The page can't call out to us, so the count is polled — cheaply, and only while
     the annotator is actually armed. */
  useEffect(() => {
    if (!annotating) {
      setPending(0);
      return;
    }
    let alive = true;
    const tick = async () => {
      const n = await browserAnnotationCount(activeLabel);
      if (alive) setPending(n);
    };
    void tick();
    const id = setInterval(() => void tick(), 700);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [annotating, activeLabel]);

  /* Unmounting the panel — switching dock surfaces, closing the dock — takes the pages with it.
     Nothing else can: a native webview outlives React and would keep painting over the app. */
  useEffect(() => () => void browserCloseAll(), []);

  /** Address-bar navigation. */
  const go = (raw: string) => {
    const u = normalizeUrl(raw);
    setAddr(u);
    patch(active.id, (x) => ({ ...x, url: u }));
    if (!blank) void browserNavigate(activeLabel, u);
    onNavigate(u);
  };

  const selectTab = (tab: Tab) => {
    setActiveId(tab.id);
    setAddr(tab.url === BLANK ? "" : tab.url);
  };

  const openTab = (to: string) => {
    // A ref, not state: popups arrive through an event subscription that deliberately doesn't
    // re-run every render, and a captured `nextId` would hand two tabs the same webview label.
    const tab: Tab = { id: ++nextId.current, url: to, title: "" };
    setTabs((prev) => [...prev, tab]);
    setActiveId(tab.id);
    setAddr(to === BLANK ? "" : to);
    if (to === BLANK) setTimeout(() => addrRef.current?.focus(), 0);
  };

  const closeTab = (id: number) => {
    const left = tabs.filter((x) => x.id !== id);
    void browserClose(labelOf(id));
    setTabs(left);
    if (id === activeId && left.length > 0) selectTab(left[left.length - 1]);
  };

  /* The page navigating itself is the normal case once you can actually browse: links, redirects,
     form posts. The address bar follows the page rather than the other way round. */
  useEffect(() => {
    const un = [
      onBrowserLoad(({ label, url: loadedUrl }) => {
        if (label === labelOf(activeId) && annotatingRef.current) {
          void browserAnnotate(label, true);
        }
        const project = projectPathRef.current;
        if (!project) return;
        const title = tabsRef.current.find((tab) => labelOf(tab.id) === label)?.title ?? null;
        updateHistory((current) =>
          recordBrowserVisit(current, project, loadedUrl, title, Date.now()),
        );
      }),
      onBrowserNav(({ label, url: to }) => {
        setTabs((prev) => prev.map((x) => (labelOf(x.id) === label ? { ...x, url: to } : x)));
        if (label === labelOf(activeId)) {
          setAddr(to);
          onNavigate(to);
        }
      }),
      onBrowserTitle(({ label, title }) => {
        const tab = tabsRef.current.find((entry) => labelOf(entry.id) === label);
        setTabs((prev) => prev.map((x) => (labelOf(x.id) === label ? { ...x, title } : x)));
        const project = projectPathRef.current;
        if (project && tab) {
          updateHistory((current) => updateBrowserVisitTitle(current, project, tab.url, title));
        }
      }),
      onBrowserPopup(({ url: to }) => openTab(to)),
    ];
    return () => {
      for (const p of un) void p.then((f) => f());
    };
    // `openTab` and `onNavigate` are re-made every render; re-subscribing on each one would drop
    // events. The identity that matters here is which tab is in front.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, updateHistory]);

  /** Hand the page's markup to the prompt, then clear it — sent notes are done, not pending. */
  const annotate = async () => {
    const marks = await browserAnnotations(activeLabel, active.url);
    if (marks.length === 0) return;
    onAnnotate(marks);
    await browserAnnotationsClear(activeLabel);
    setPending(0);
  };

  const clearMarks = async () => {
    await browserAnnotationsClear(activeLabel);
    setPending(0);
  };

  const menu = (act: () => void) => () => {
    setMenuOpen(false);
    act();
  };

  const zoomBy = (d: number) => setZoom((z) => Math.min(2, Math.max(0.5, Math.round((z + d) * 10) / 10)));

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      {/* ---- tabs ------------------------------------------------------------------------- */}
      <div className="flex items-center gap-1 px-2 pt-1.5">
        {tabs.map((x) => {
          const name = x.url === BLANK ? null : x.title || hostOf(x.url);
          return (
            <div
              key={x.id}
              onClick={() => selectTab(x)}
              className={cn(
                "group flex min-w-0 max-w-44 cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-fine transition-colors",
                x.id === activeId
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-accent/50",
              )}
            >
              <Globe className="size-3 shrink-0 opacity-60" />
              <span className="min-w-0 flex-1 truncate">{name ?? t("browser.newTab")}</span>
              {tabs.length > 1 && (
                <button
                  title={t("browser.closeTab")}
                  className="hidden shrink-0 rounded p-px hover:text-foreground group-hover:block"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(x.id);
                  }}
                >
                  <X className="size-3" />
                </button>
              )}
            </div>
          );
        })}
        <Button
          variant="ghost"
          size="icon"
          className="size-6 shrink-0 text-muted-foreground"
          title={t("browser.newTab")}
          onClick={() => openTab(BLANK)}
        >
          <Plus className="size-3.5" />
        </Button>
      </div>

      {/* ---- toolbar ---------------------------------------------------------------------- */}
      <div className="flex items-center gap-1 px-2 py-1.5">
        {/* Always enabled: the page owns its history and won't tell us how deep it is. */}
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground disabled:opacity-30"
          title={t("browser.back")}
          disabled={blank}
          onClick={() => void browserHistory(activeLabel, -1)}
        >
          <ArrowLeft className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground disabled:opacity-30"
          title={t("browser.forward")}
          disabled={blank}
          onClick={() => void browserHistory(activeLabel, 1)}
        >
          <ArrowRight className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground disabled:opacity-30"
          title={t("browser.reload")}
          disabled={blank}
          onClick={() => void browserReload(activeLabel)}
        >
          <RotateCw className="size-3.5" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "size-7 text-muted-foreground disabled:opacity-30",
            annotating && "bg-primary/15 text-primary hover:bg-primary/20",
          )}
          title={t("browser.annotateMode")}
          disabled={blank}
          onClick={() => setAnnotating((v) => !v)}
        >
          <SquareDashedMousePointer className="size-3.5" />
        </Button>

        {/* A raw input: the shadcn one doesn't forward refs on React 18, and new-tab needs focus. */}
        <input
          ref={addrRef}
          className="h-7 min-w-0 flex-1 rounded-lg bg-fill-quiet px-2.5 text-hint text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:bg-transparent focus:ring-2 focus:ring-ring/50"
          value={addr}
          onChange={(e) => setAddr(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addr.trim() && go(addr)}
          placeholder={t("browser.urlPlaceholder")}
          spellCheck={false}
        />

        <Popover open={menuOpen} onOpenChange={setMenuOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground"
              title={t("browser.more")}
            >
              <MoreVertical className="size-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-60 p-1">
            <MenuItem
              icon={RotateCw}
              label={t("browser.hardReload")}
              onClick={menu(() => void browserReload(activeLabel))}
            />
            <MenuItem
              icon={Inspect}
              label={t("browser.devtools")}
              onClick={menu(() => void browserDevtools(activeLabel))}
            />
            <MenuItem
              icon={ExternalLink}
              label={t("browser.openExternal")}
              onClick={menu(() => void openExternal(active.url))}
            />
            <MenuItem
              icon={Copy}
              label={t("browser.copyUrl")}
              onClick={menu(() => {
                void navigator.clipboard.writeText(active.url).then(() => toast(t("browser.copied")));
              })}
            />
            <div className="my-1 h-px bg-border" />
            <MenuItem
              icon={MonitorSmartphone}
              label={t("browser.deviceToolbar")}
              checked={deviceBar}
              onClick={() => {
                setDeviceBar((v) => {
                  if (v) setDevice(null);
                  return !v;
                });
              }}
            />
            <div className="flex items-center gap-1 px-2.5 py-1.5 text-hint">
              <span className="flex-1">{t("browser.zoom")}</span>
              <Button variant="outline" size="icon" className="size-5" onClick={() => zoomBy(-0.1)}>
                <Minus className="size-3" />
              </Button>
              <button
                className="w-11 text-center font-mono text-fine text-muted-foreground hover:text-foreground"
                title="100%"
                onClick={() => setZoom(1)}
              >
                {Math.round(zoom * 100)}%
              </button>
              <Button variant="outline" size="icon" className="size-5" onClick={() => zoomBy(0.1)}>
                <Plus className="size-3" />
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* ---- annotating strip ------------------------------------------------------------- */}
      {/* The whole annotate flow lives inside the page (the picker, the card, the style wells);
          this strip only says the mode is on and, once notes exist, offers the one action that
          matters — send them to the prompt. Nothing else, so the page keeps the room. */}
      {annotating && !blank && (
        <div className="flex h-8 items-center gap-2 border-y border-primary/20 bg-primary/[0.06] px-2.5">
          <span className="size-1.5 shrink-0 rounded-full bg-primary" />
          <span className="min-w-0 flex-1 truncate text-fine text-muted-foreground">
            {pending === 0
              ? t("browser.annotateHint")
              : t("browser.annotateCount").replace("{n}", String(pending))}
          </span>
          {pending > 0 && (
            <>
              <button
                className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-destructive"
                title={t("browser.clearAnnotations")}
                onClick={() => void clearMarks()}
              >
                <Trash2 className="size-3.5" />
              </button>
              <Button size="sm" className="h-6 px-2.5 text-fine" onClick={() => void annotate()}>
                {t("browser.addToPrompt")}
              </Button>
            </>
          )}
        </div>
      )}

      {/* ---- device toolbar --------------------------------------------------------------- */}
      {deviceBar && (
        <div className="flex items-center gap-1 px-2 py-1">
          {(
            [
              { w: null, label: t("browser.responsive") },
              { w: 375, label: t("browser.mobile") },
              { w: 768, label: t("browser.tablet") },
            ] as { w: number | null; label: string }[]
          ).map((d) => (
            <button
              key={d.label}
              onClick={() => setDevice(d.w)}
              className={cn(
                "rounded-md px-2 py-0.5 text-fine transition-colors",
                device === d.w ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {d.label}
            </button>
          ))}
          {device && (
            <span className="ml-auto font-mono text-cap text-muted-foreground">{device}px</span>
          )}
        </div>
      )}

      {/* ---- the page --------------------------------------------------------------------- */}
      {/* `hostRef` is a hole in the layout, not a container: it holds no page, it only says where
          the native webview goes. A device width narrows the hole and the page follows. */}
      <div className={cn("relative min-h-0 flex-1", device && "bg-muted/40")}>
        <div
          ref={hostRef}
          className={cn("h-full", device && "mx-auto shadow-lg ring-1 ring-foreground/15")}
          style={device ? { width: device } : undefined}
        />
        {blank && (
          // No webview for a blank tab: an empty native page paints a white sheet, which in dark
          // mode reads as a rendering bug rather than an empty tab.
          <div className="absolute inset-0 flex items-start justify-center overflow-y-auto px-6 pt-[14vh]">
            {recentSites.length > 0 ? (
              <div className="w-full max-w-md">
                <div className="mb-3 flex items-center gap-2">
                  <Globe className="size-4 text-muted-foreground" />
                  <h3 className="text-ui font-semibold">{t("browser.recent")}</h3>
                </div>
                <div className="space-y-1">
                  {recentSites.map((site) => (
                    <div
                      key={site.url}
                      className="group flex min-w-0 items-center gap-2 rounded-lg px-2 py-2 transition-colors hover:bg-accent/50"
                    >
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        title={site.url}
                        onClick={() => go(site.url)}
                      >
                        <span className="block truncate text-ui font-medium">
                          {site.title || hostOf(site.url) || site.url}
                        </span>
                        <span className="mt-0.5 flex min-w-0 items-center gap-2 text-fine text-muted-foreground">
                          <span className="truncate font-mono">{site.url}</span>
                          <span
                            className="shrink-0"
                            title={new Date(site.last_visited_at).toLocaleString()}
                          >
                            {visitAge(site.last_visited_at) ?? t("browser.justNow")}
                          </span>
                        </span>
                      </button>
                      <button
                        type="button"
                        className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
                        aria-label={t("browser.removeRecent")}
                        title={t("browser.removeRecent")}
                        onClick={() => {
                          const project = projectPathRef.current;
                          if (!project) return;
                          updateHistory((current) => removeBrowserVisit(current, project, site.url));
                        }}
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 pt-[8vh]">
                <Globe className="size-8 text-muted-foreground/40" />
                <p className="text-hint text-muted-foreground">{t("browser.urlPlaceholder")}</p>
              </div>
            )}
          </div>
        )}
        {!blank && !isDesktop && (
          // `bun run dev` in a real browser has no native side. Say so rather than showing a void.
          <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
            <p className="text-hint text-muted-foreground">{t("browser.desktopOnly")}</p>
          </div>
        )}
      </div>

    </div>
  );
}
