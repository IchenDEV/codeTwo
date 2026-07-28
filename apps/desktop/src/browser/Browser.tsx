import { useRef, useState } from "react";
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
  Pencil,
  Plus,
  RotateCw,
  X,
} from "lucide-react";

import { openDevtools, openExternal } from "../bridge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useT } from "../i18n";
import { useToast } from "../ui/toast";
import { cn } from "@/lib/utils";

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
 * One open page. Navigation history is app-level — a cross-origin iframe won't let us read where
 * it went, so back/forward walk the URLs *we* navigated to, which is what the address bar showed.
 * `nonce` remounts the iframe: that's what reload means here.
 */
interface Tab {
  id: number;
  stack: string[];
  at: number;
  nonce: number;
}

const current = (t: Tab) => t.stack[t.at];

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
      className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[12.5px] transition-colors hover:bg-accent"
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
 * annotate bar at the bottom, which is the part that makes it codeTwo's browser rather than a
 * worse Safari: what you see feeds the prompt.
 */
export function BrowserPanel({
  url,
  onNavigate,
  onAnnotate,
}: {
  url: string;
  onNavigate: (u: string) => void;
  onAnnotate: (note: string) => void;
}) {
  const t = useT();
  const toast = useToast();
  const [tabs, setTabs] = useState<Tab[]>([{ id: 1, stack: [url], at: 0, nonce: 0 }]);
  const [activeId, setActiveId] = useState(1);
  const [nextId, setNextId] = useState(2);
  const [addr, setAddr] = useState(url === BLANK ? "" : url);
  const [note, setNote] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [device, setDevice] = useState<number | null>(null);
  const [deviceBar, setDeviceBar] = useState(false);
  const addrRef = useRef<HTMLInputElement | null>(null);

  const active = tabs.find((x) => x.id === activeId) ?? tabs[0];

  const patch = (id: number, f: (t: Tab) => Tab) =>
    setTabs((prev) => prev.map((x) => (x.id === id ? f(x) : x)));

  /** Address-bar navigation: everything forward of here is history that never happened. */
  const go = (raw: string) => {
    const u = normalizeUrl(raw);
    setAddr(u);
    patch(active.id, (x) => ({ ...x, stack: [...x.stack.slice(0, x.at + 1), u], at: x.at + 1 }));
    onNavigate(u);
  };

  const step = (delta: number) => {
    const at = active.at + delta;
    if (at < 0 || at >= active.stack.length) return;
    patch(active.id, (x) => ({ ...x, at }));
    setAddr(active.stack[at]);
    onNavigate(active.stack[at]);
  };

  const reload = () => patch(active.id, (x) => ({ ...x, nonce: x.nonce + 1 }));

  const selectTab = (tab: Tab) => {
    setActiveId(tab.id);
    setAddr(current(tab) === BLANK ? "" : current(tab));
  };

  const newTab = () => {
    const tab: Tab = { id: nextId, stack: [BLANK], at: 0, nonce: 0 };
    setTabs((prev) => [...prev, tab]);
    setActiveId(nextId);
    setNextId((n) => n + 1);
    setAddr("");
    setTimeout(() => addrRef.current?.focus(), 0);
  };

  const closeTab = (id: number) => {
    const left = tabs.filter((x) => x.id !== id);
    setTabs(left);
    if (id === activeId && left.length > 0) selectTab(left[left.length - 1]);
  };

  const annotate = () => {
    if (note.trim()) {
      onAnnotate(note.trim());
      setNote("");
    }
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
          const host = current(x) === BLANK ? null : hostOf(current(x));
          return (
            <div
              key={x.id}
              onClick={() => selectTab(x)}
              className={cn(
                "group flex min-w-0 max-w-44 cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-[11.5px] transition-colors",
                x.id === activeId
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-accent/50",
              )}
            >
              <Globe className="size-3 shrink-0 opacity-60" />
              <span className="min-w-0 flex-1 truncate">{host ?? t("browser.newTab")}</span>
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
          onClick={newTab}
        >
          <Plus className="size-3.5" />
        </Button>
      </div>

      {/* ---- toolbar ---------------------------------------------------------------------- */}
      <div className="flex items-center gap-1 px-2 py-1.5">
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground disabled:opacity-30"
          title={t("browser.back")}
          disabled={active.at === 0}
          onClick={() => step(-1)}
        >
          <ArrowLeft className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground disabled:opacity-30"
          title={t("browser.forward")}
          disabled={active.at >= active.stack.length - 1}
          onClick={() => step(1)}
        >
          <ArrowRight className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground"
          title={t("browser.reload")}
          onClick={reload}
        >
          <RotateCw className="size-3.5" />
        </Button>

        {/* A raw input: the shadcn one doesn't forward refs on React 18, and new-tab needs focus. */}
        <input
          ref={addrRef}
          className="h-7 min-w-0 flex-1 rounded-lg bg-foreground/[0.05] px-2.5 text-[12px] text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:bg-transparent focus:ring-2 focus:ring-ring/50"
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
            <MenuItem icon={RotateCw} label={t("browser.hardReload")} onClick={menu(reload)} />
            <MenuItem icon={Inspect} label={t("browser.devtools")} onClick={menu(() => void openDevtools())} />
            <MenuItem
              icon={ExternalLink}
              label={t("browser.openExternal")}
              onClick={menu(() => void openExternal(current(active)))}
            />
            <MenuItem
              icon={Copy}
              label={t("browser.copyUrl")}
              onClick={menu(() => {
                void navigator.clipboard.writeText(current(active)).then(() => toast(t("browser.copied")));
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
            <div className="flex items-center gap-1 px-2.5 py-1.5 text-[12.5px]">
              <span className="flex-1">{t("browser.zoom")}</span>
              <Button variant="outline" size="icon" className="size-5" onClick={() => zoomBy(-0.1)}>
                <Minus className="size-3" />
              </Button>
              <button
                className="w-11 text-center font-mono text-[11px] text-muted-foreground hover:text-foreground"
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

      {/* ---- device toolbar --------------------------------------------------------------- */}
      {deviceBar && (
        <div className="flex items-center gap-1 border-t px-2 py-1">
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
                "rounded-md px-2 py-0.5 text-[11px] transition-colors",
                device === d.w ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {d.label}
            </button>
          ))}
          {device && (
            <span className="ml-auto font-mono text-[10.5px] text-muted-foreground">{device}px</span>
          )}
        </div>
      )}

      {/* ---- the page --------------------------------------------------------------------- */}
      {/* Every tab's iframe stays mounted so switching doesn't reload the page — same policy as
          the terminals. Zoom is a compositor transform (the only kind a cross-origin iframe
          allows), with the box inflated to compensate. */}
      <div className={cn("min-h-0 flex-1 overflow-auto border-t", device && "bg-muted/40")}>
        <div className={cn("h-full", device && "mx-auto border-x bg-white")} style={device ? { width: device * zoom } : undefined}>
          <div
            style={{
              width: device ? device : `${100 / zoom}%`,
              height: `${100 / zoom}%`,
              transform: `scale(${zoom})`,
              transformOrigin: "top left",
            }}
          >
            {tabs.map((x) =>
              current(x) === BLANK ? (
                // No iframe for a blank tab: about:blank paints a white sheet, which in dark mode
                // reads as a rendering bug rather than an empty page.
                <div
                  key={`${x.id}:${x.nonce}`}
                  className="h-full w-full flex-col items-center justify-center gap-2"
                  style={{ display: x.id === activeId ? "flex" : "none" }}
                >
                  <Globe className="size-8 text-muted-foreground/40" />
                  <p className="text-[12px] text-muted-foreground">{t("browser.urlPlaceholder")}</p>
                </div>
              ) : (
                <iframe
                  key={`${x.id}:${x.nonce}`}
                  className="h-full w-full border-0 bg-white"
                  style={{ display: x.id === activeId ? "block" : "none" }}
                  src={current(x)}
                  title={`browser-tab-${x.id}`}
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                />
              ),
            )}
          </div>
        </div>
      </div>

      {/* ---- annotate → prompt ------------------------------------------------------------ */}
      <div className="flex items-center gap-2 border-t px-2 py-1.5">
        <Pencil className="size-3.5 shrink-0 text-primary" />
        <Input
          className="h-7 flex-1 text-[12px]"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && annotate()}
          placeholder={t("browser.annotatePlaceholder")}
        />
        <Button size="sm" className="h-7 text-[12px]" onClick={annotate}>
          {t("browser.addToPrompt")}
        </Button>
      </div>
    </div>
  );
}
