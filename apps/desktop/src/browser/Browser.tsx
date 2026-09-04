import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { CompositeActionRow } from "@/components/business/composite-action-row";
import { Button } from "@/components/ui/button";
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
} from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { TooltipButton } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

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
  browserRegistryCreate,
  browserRegistrySnapshot,
  browserTakeControl,
  browserVisible,
  browserZoom,
  isDesktop,
  onBrowserLoad,
  onBrowserNav,
  onBrowserPopup,
  onBrowserRegistry,
  onBrowserTitle,
  openExternal,
} from "../bridge";
import type { Annotation } from "../bridge";
import { embeddedBrowserRenderer, registerBrowserWebview } from "../container";
import { useT } from "../i18n";
import { useToast } from "../ui/toast";
import {
  loadBrowserHistory,
  recentSitesForProject,
  recordBrowserVisit,
  removeBrowserVisit,
  saveBrowserHistory,
  updateBrowserVisitTitle,
} from "./history";
import type { BrowserHistoryState, StorageLike } from "./history";

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
  agentActive?: boolean;
  leaseSession?: string | null;
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
      set(
        document.body.classList.contains("resizing-h") ||
          document.body.classList.contains("resizing-v")
      );
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
    <Button
      type="button"
      variant="ghost"
      size="row"
      focusStyle="inset"
      onClick={onClick}
      className="gap-module-inset px-module-inset text-metadata w-full py-1.5"
    >
      <Icon className="text-muted-foreground size-3.5 shrink-0" />
      <span className="flex-1">{label}</span>
      {checked === true && <Check className="text-primary size-3.5 shrink-0" />}
    </Button>
  );
}

function BrowserWebview({
  label,
  url,
  visible,
}: {
  label: string;
  url: string;
  visible: boolean;
}) {
  const connect = (element: HTMLElement | null) =>
    registerBrowserWebview(label, element);
  return (
    <electrobun-webview
      ref={connect}
      src={url}
      renderer={embeddedBrowserRenderer}
      partition="persist:codetwo-browser"
      sandbox=""
      className={cn(
        "absolute inset-0 h-full! w-full! bg-transparent",
        !visible && "invisible"
      )}
    />
  );
}

/**
 * The built-in browser as browser, not just an iframe with an address bar: tabs along the top,
 * back/forward/reload, an overflow menu with the inspector, zoom and device widths — and the
 * annotate bar at the bottom, which is the part that makes it C2's browser rather than a
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
   *  child webview has no idea it is inside a collapsed box — it would keep painting over the app. */
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
  const hostRef = useRef<HTMLDivElement | null>(null);
  const dragging = useDragging();
  const [annotating, setAnnotating] = useState(false);
  const [pending, setPending] = useState(0);
  const [historyState, setHistoryState] = useState<BrowserHistoryState>(() =>
    loadBrowserHistory(
      typeof window === "undefined" ? null : localHistoryStorage()
    )
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

  const applyRegistry = (registry: import("../bridge").BrowserTab[]) => {
    const restored = registry
      .map((tab) => ({
        id: Number(tab.id.replace(/^browser-/, "")),
        url: tab.url,
        title: tab.title,
        agentActive: tab.agent_active,
        leaseSession: tab.lease_session,
      }))
      .filter((tab) => Number.isSafeInteger(tab.id) && tab.id > 0);
    if (restored.length === 0) return;
    const selected = registry.find((tab) => tab.active);
    const selectedId = selected
      ? Number(selected.id.replace(/^browser-/, ""))
      : restored[0].id;
    const selectedTab =
      restored.find((tab) => tab.id === selectedId) ?? restored[0];
    setTabs(restored);
    setActiveId(selectedTab.id);
    setAddr(selectedTab.url === BLANK ? "" : selectedTab.url);
  };

  useEffect(() => {
    void browserRegistrySnapshot().then(applyRegistry);
    const registration = onBrowserRegistry(applyRegistry);
    return () => void registration.then((unlisten) => unlisten());
  }, [applyRegistry]);

  useEffect(() => {
    // Another window or a previous mount may have written newer history. Re-read at the project
    // boundary rather than carrying one project's in-memory list into another.
    setHistoryState(loadBrowserHistory(localHistoryStorage()));
  }, [projectPath]);

  const updateHistory = (
    update: (current: BrowserHistoryState) => BrowserHistoryState
  ) => {
    const storage = localHistoryStorage();
    const current = loadBrowserHistory(storage);
    const next = update(current);
    saveBrowserHistory(storage, next);
    setHistoryState(next);
  };

  const patch = (id: number, f: (t: Tab) => Tab) =>
    setTabs((prev) => prev.map((x) => (x.id === id ? f(x) : x)));

  /** Where the native page belongs, in the window's own logical coordinates. */
  const rect = () => {
    const r = hostRef.current?.getBoundingClientRect();
    return r ? { x: r.left, y: r.top, width: r.width, height: r.height } : null;
  };

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
    for (const x of tabs)
      if (x.id !== activeId) void browserVisible(labelOf(x.id), false);
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
    void browserTakeControl(labelOf(tab.id));
    setActiveId(tab.id);
    setAddr(tab.url === BLANK ? "" : tab.url);
  };

  const openTab = (to: string) => {
    void browserRegistryCreate(to).then((created) => {
      const tab: Tab = {
        id: Number(created.id.replace(/^browser-/, "")),
        url: created.url,
        title: created.title,
        agentActive: created.agent_active,
        leaseSession: created.lease_session,
      };
      setTabs((prev) => [...prev.filter((entry) => entry.id !== tab.id), tab]);
      setActiveId(tab.id);
      setAddr(to === BLANK ? "" : to);
      if (to === BLANK) setTimeout(() => addrRef.current?.focus(), 0);
    });
  };

  const closeTab = (id: number) => {
    const left = tabs.filter((x) => x.id !== id);
    void browserClose(labelOf(id));
    setTabs(left);
    if (id === activeId && left.length > 0) selectTab(left.at(-1)!);
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
        if (project == null || project === "") return;
        const title =
          tabsRef.current.find((tab) => labelOf(tab.id) === label)?.title ??
          null;
        updateHistory((current) =>
          recordBrowserVisit(current, project, loadedUrl, title, Date.now())
        );
      }),
      onBrowserNav(({ label, url: to }) => {
        setTabs((prev) =>
          prev.map((x) => (labelOf(x.id) === label ? { ...x, url: to } : x))
        );
        if (label === labelOf(activeId)) {
          setAddr(to);
          onNavigate(to);
        }
      }),
      onBrowserTitle(({ label, title }) => {
        const tab = tabsRef.current.find(
          (entry) => labelOf(entry.id) === label
        );
        setTabs((prev) =>
          prev.map((x) => (labelOf(x.id) === label ? { ...x, title } : x))
        );
        const project = projectPathRef.current;
        if (project != null && project !== "" && tab) {
          updateHistory((current) =>
            updateBrowserVisitTitle(current, project, tab.url, title)
          );
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

  const zoomBy = (d: number) =>
    setZoom((z) => Math.min(2, Math.max(0.5, Math.round((z + d) * 10) / 10)));

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      {/* ---- tabs ------------------------------------------------------------------------- */}
      <div className="flex items-center gap-1 px-2 pt-1.5">
        {tabs.map((x) => {
          const name = x.url === BLANK ? null : x.title || hostOf(x.url);
          return (
            <CompositeActionRow
              key={x.id}
              accessibilityLabel={name ?? t("browser.newTab")}
              current={x.id === activeId}
              selected={x.id === activeId}
              onSelect={() => selectTab(x)}
              className={cn(
                "rounded-control text-callout focus-within:bg-accent max-w-44 min-w-0 gap-1.5 px-2 py-1 transition-colors",
                x.id === activeId
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-accent/50"
              )}
              contentClassName="flex items-center gap-1.5"
              actions={
                tabs.length > 1 ? (
                  <TooltipButton
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    label={t("browser.closeTab")}
                    className="hidden shrink-0 group-focus-within:inline-flex group-hover:inline-flex"
                    onClick={() => closeTab(x.id)}
                  >
                    <X className="size-3" />
                  </TooltipButton>
                ) : null
              }
            >
              <Globe className="size-3 shrink-0 opacity-60" />
              <span className="min-w-0 flex-1 truncate">
                {name ?? t("browser.newTab")}
              </span>
            </CompositeActionRow>
          );
        })}
        <TooltipButton
          variant="ghost"
          size="icon"
          className="text-muted-foreground size-6 shrink-0"
          label={t("browser.newTab")}
          onClick={() => openTab(BLANK)}
        >
          <Plus className="size-3.5" />
        </TooltipButton>
      </div>

      {/* ---- toolbar ---------------------------------------------------------------------- */}
      <div className="flex items-center gap-1 px-2 py-1.5">
        {/* Always enabled: the page owns its history and won't tell us how deep it is. */}
        <TooltipButton
          variant="ghost"
          size="icon"
          className="text-muted-foreground size-7 disabled:opacity-30"
          label={t("browser.back")}
          disabled={blank}
          onClick={() => void browserHistory(activeLabel, -1)}
        >
          <ArrowLeft className="size-3.5" />
        </TooltipButton>
        <TooltipButton
          variant="ghost"
          size="icon"
          className="text-muted-foreground size-7 disabled:opacity-30"
          label={t("browser.forward")}
          disabled={blank}
          onClick={() => void browserHistory(activeLabel, 1)}
        >
          <ArrowRight className="size-3.5" />
        </TooltipButton>
        <TooltipButton
          variant="ghost"
          size="icon"
          className="text-muted-foreground size-7 disabled:opacity-30"
          label={t("browser.reload")}
          disabled={blank}
          onClick={() => void browserReload(activeLabel)}
        >
          <RotateCw className="size-3.5" />
        </TooltipButton>

        <TooltipButton
          variant="ghost"
          size="icon"
          className={cn(
            "text-muted-foreground size-7 disabled:opacity-30",
            annotating && "bg-primary/15 text-primary hover:bg-primary/20"
          )}
          label={t("browser.annotateMode")}
          aria-pressed={annotating}
          disabled={blank}
          onClick={() => setAnnotating((v) => !v)}
        >
          <SquareDashedMousePointer className="size-3.5" />
        </TooltipButton>

        <Input
          ref={addrRef}
          size="compact"
          className="bg-fill-quiet text-metadata min-w-0 flex-1 focus:bg-transparent"
          value={addr}
          onChange={(e) => setAddr(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addr.trim() && go(addr)}
          placeholder={t("browser.urlPlaceholder")}
          spellCheck={false}
        />

        {active.agentActive === true && (
          <Button
            variant="outline"
            size="sm"
            className="text-callout h-(--ds-control-normal) gap-1.5 px-2"
            title="Stop the agent lease and take control of this tab"
            onClick={() => void browserTakeControl(activeLabel)}
          >
            <SquareDashedMousePointer className="size-3.5" />
            Take Control
          </Button>
        )}

        <Popover open={menuOpen} onOpenChange={setMenuOpen}>
          <PopoverTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground size-7"
                aria-label={t("browser.more")}
              >
                <MoreVertical className="size-3.5" />
              </Button>
            }
          />
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
                void navigator.clipboard
                  .writeText(active.url)
                  .then(() => toast(t("browser.copied")));
              })}
            />
            <div className="bg-border my-1 h-px" />
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
            <div className="text-metadata flex items-center gap-1 px-2.5 py-1.5">
              <span className="flex-1">{t("browser.zoom")}</span>
              <TooltipButton
                label={t("browser.zoomOut")}
                variant="outline"
                size="icon"
                className="size-5"
                onClick={() => zoomBy(-0.1)}
              >
                <Minus className="size-3" />
              </TooltipButton>
              <Button
                type="button"
                variant="ghost"
                size="compact"
                className="text-callout text-muted-foreground w-11 px-0 font-mono"
                aria-label={t("browser.zoomReset")}
                onClick={() => setZoom(1)}
              >
                {Math.round(zoom * 100)}%
              </Button>
              <TooltipButton
                label={t("browser.zoomIn")}
                variant="outline"
                size="icon"
                className="size-5"
                onClick={() => zoomBy(0.1)}
              >
                <Plus className="size-3" />
              </TooltipButton>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* ---- annotating strip ------------------------------------------------------------- */}
      {/* The whole annotate flow lives inside the page (the picker, the card, the style wells);
          this strip only says the mode is on and, once notes exist, offers the one action that
          matters — send them to the prompt. Nothing else, so the page keeps the room. */}
      {annotating && !blank && (
        <div className="border-primary/20 bg-primary/[0.06] flex h-8 items-center gap-2 border-y px-2.5">
          <span className="bg-primary size-1.5 shrink-0 rounded-full" />
          <span className="text-callout text-muted-foreground min-w-0 flex-1 truncate">
            {pending === 0
              ? t("browser.annotateHint")
              : t("browser.annotateCount").replace("{n}", String(pending))}
          </span>
          {pending > 0 && (
            <>
              <TooltipButton
                type="button"
                variant="ghost"
                size="icon-xs"
                className="text-muted-foreground hover:text-destructive shrink-0"
                label={t("browser.clearAnnotations")}
                onClick={() => void clearMarks()}
              >
                <Trash2 className="size-3.5" />
              </TooltipButton>
              <Button
                size="compact"
                className="px-module-inset text-callout"
                onClick={() => void annotate()}
              >
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
            <Button
              key={d.label}
              type="button"
              variant="selectable"
              size="compact"
              focusStyle="inset"
              data-selected={device === d.w ? "true" : "false"}
              onClick={() => setDevice(d.w)}
              className={cn(
                "text-callout h-auto px-2 py-0.5",
                device === d.w
                  ? "bg-accent text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {d.label}
            </Button>
          ))}
          {device != null && (
            <span className="text-metadata text-muted-foreground ml-auto font-mono">
              {device}px
            </span>
          )}
        </div>
      )}

      {/* ---- the page --------------------------------------------------------------------- */}
      {/* Electrobun keeps each sandboxed child webview aligned to its custom element. A device
          width narrows this container and the native page follows without accepting iframe CSP. */}
      <div
        className={cn(
          "relative min-h-0 flex-1",
          device != null && "bg-muted/40"
        )}
      >
        <div
          ref={hostRef}
          className={cn(
            "relative h-full",
            device != null && "ring-foreground/15 mx-auto shadow-lg ring-1"
          )}
          style={device == null ? undefined : { width: device }}
        >
          {isDesktop &&
            tabs
              .filter((tab) => tab.url !== BLANK)
              .map((tab) => (
                <BrowserWebview
                  key={tab.id}
                  label={labelOf(tab.id)}
                  url={tab.url}
                  visible={tab.id === activeId && showPage}
                />
              ))}
        </div>
        {blank && (
          // No webview for a blank tab: an empty native page paints a white sheet, which in dark
          // mode reads as a rendering bug rather than an empty tab.
          <div className="absolute inset-0 flex items-start justify-center overflow-y-auto px-6 pt-[14vh]">
            {recentSites.length > 0 ? (
              <div className="w-full max-w-md">
                <div className="mb-3 flex items-center gap-2">
                  <Globe className="text-muted-foreground size-4" />
                  <h3 className="text-body font-semibold">
                    {t("browser.recent")}
                  </h3>
                </div>
                <div className="space-y-1">
                  {recentSites.map((site) => (
                    <CompositeActionRow
                      key={site.url}
                      accessibilityLabel={
                        site.title != null && site.title !== ""
                          ? site.title
                          : (hostOf(site.url) ?? site.url)
                      }
                      onSelect={() => go(site.url)}
                      className="gap-module-inset rounded-control px-module-inset py-module-inset hover:bg-fill-hover min-w-0 transition-colors"
                      contentClassName="flex min-w-0 flex-1 flex-col"
                      actions={
                        <TooltipButton
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          className="text-muted-foreground hover:text-destructive opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                          label={t("browser.removeRecent")}
                          onClick={() => {
                            const project = projectPathRef.current;
                            if (project == null || project === "") return;
                            updateHistory((current) =>
                              removeBrowserVisit(current, project, site.url)
                            );
                          }}
                        >
                          <X className="size-3.5" />
                        </TooltipButton>
                      }
                    >
                      <span className="text-body block truncate font-medium">
                        {site.title != null && site.title !== ""
                          ? site.title
                          : (hostOf(site.url) ?? site.url)}
                      </span>
                      <span className="text-callout text-muted-foreground mt-0.5 flex min-w-0 items-center gap-2">
                        <span className="truncate font-mono">{site.url}</span>
                        <span
                          className="shrink-0"
                          title={new Date(
                            site.last_visited_at
                          ).toLocaleString()}
                        >
                          {visitAge(site.last_visited_at) ??
                            t("browser.justNow")}
                        </span>
                      </span>
                    </CompositeActionRow>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 pt-[8vh]">
                <Globe className="text-muted-foreground/40 size-8" />
                <p className="text-metadata text-muted-foreground">
                  {t("browser.urlPlaceholder")}
                </p>
              </div>
            )}
          </div>
        )}
        {!blank &&
          !isDesktop && (
            // The standalone Vite renderer has no native side. Say so rather than showing a void.
            <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
              <p className="text-metadata text-muted-foreground">
                {t("browser.desktopOnly")}
              </p>
            </div>
          )}
      </div>
    </div>
  );
}
