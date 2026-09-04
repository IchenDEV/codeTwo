import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Activity,
  FolderTree,
  GitBranch,
  Globe,
  MessageSquare,
  TerminalIcon,
  X,
} from "@/components/ui/icons";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useResizeHandle } from "@/components/ui/use-resize-handle";
import { cn } from "@/lib/utils";

import { useT } from "../i18n";
import type { StringKey } from "../i18n/strings";

export type DockSurface =
  | "trajectory"
  | "terminal"
  | "browser"
  | "side-chat"
  | "files"
  | "git";
/**
"home" is the dock open with nothing chosen yet — the surface picker.
*/
export type DockTab = DockSurface | "home";
export type DockContentMap = Partial<Record<DockSurface, ReactNode>>;

/**
The picker's cards, in the order a coding session tends to want them.
*/
interface DockSurfaceDefinition {
  id: DockSurface;
  icon: typeof Globe;
  titleKey: StringKey;
  descKey: StringKey;
}

interface DockProps {
  /**
  Whether the dock is expanded. It stays mounted while closed so shells survive.
  */
  readonly open: boolean;
  /**
  null while closed; the last surface stays rendered underneath the collapse animation.
  */
  readonly tab: DockTab | null;
  readonly onTab: (surface: DockSurface) => void;
  readonly onClose: () => void;
  readonly width: number;
  readonly onWidth: (width: number) => void;
  /**
  Inline shell width that must remain beside the document while the dock is open.
  */
  readonly reservedWidth?: number;
  readonly autoTab?: DockSurface | null;
  /**
  Disabled surfaces are neither advertised nor mounted.
  */
  readonly availableSurfaces?: DockSurface[];
  /**
  Content is inert until its matching surface is enabled and mounted by the container.
  */
  readonly content?: DockContentMap;
}

const SURFACES: DockSurfaceDefinition[] = [
  {
    descKey: "dock.trajectoryDesc",
    icon: Activity,
    id: "trajectory",
    titleKey: "trajectory.label",
  },
  {
    descKey: "dock.browserDesc",
    icon: Globe,
    id: "browser",
    titleKey: "dock.browser",
  },
  {
    descKey: "dock.terminalDesc",
    icon: TerminalIcon,
    id: "terminal",
    titleKey: "dock.terminal",
  },
  {
    descKey: "sideChat.temporary",
    icon: MessageSquare,
    id: "side-chat",
    titleKey: "sideChat.title",
  },
  {
    descKey: "dock.filesDesc",
    icon: FolderTree,
    id: "files",
    titleKey: "dock.files",
  },
  { descKey: "dock.gitDesc", icon: GitBranch, id: "git", titleKey: "dock.git" },
];

export const dockMinWidth = 300;
export const dockMainMinWidth = 620;

export function dockMaxWidth(viewportWidth: number, reservedWidth = 0): number {
  return Math.max(
    dockMinWidth,
    viewportWidth - reservedWidth - dockMainMinWidth
  );
}

export function shouldOverlayRailForWorkspace(
  viewportWidth: number,
  railWidth: number
): boolean {
  return viewportWidth < railWidth + dockMainMinWidth;
}

export function shouldOverlayRailForDock(
  viewportWidth: number,
  railWidth: number
): boolean {
  return viewportWidth < railWidth + dockMinWidth + dockMainMinWidth;
}

export function Dock({
  open,
  tab,
  onTab,
  onClose,
  width,
  onWidth,
  reservedWidth = 0,
  autoTab,
  availableSurfaces = ["trajectory", "browser", "terminal", "files", "git"],
  content = {},
}: DockProps) {
  const t = useT();

  // What the panel shows: the live tab, or — while collapsing — whatever was open last, so the
  // content doesn't vanish mid-animation.
  const availableSurfaceSet = new Set(availableSurfaces);
  const visibleSurfaces = SURFACES.filter(({ id }) =>
    availableSurfaceSet.has(id)
  );
  const [fallbackTab, setFallbackTab] = useState<DockTab>("home");
  if (tab != null && tab !== fallbackTab) {
    setFallbackTab(tab);
  }
  const requested = tab ?? fallbackTab;
  const shown =
    requested === "home" || availableSurfaceSet.has(requested)
      ? requested
      : "home";

  // `invisible` only after the collapse has finished: a zero-width element still paints its
  // module shadow as a hairline at the window edge, and hiding it any earlier would cut the
  // animation off — the exact stiffness this rework removes.
  const [gone, setGone] = useState(!open);
  useEffect(() => {
    if (open) {
      const id = window.setTimeout(() => setGone(false), 0);
      return () => window.clearTimeout(id);
    }
    const id = window.setTimeout(() => setGone(true), 340);
    return () => window.clearTimeout(id);
  }, [open]);

  // Never let the dock squeeze the document below a usable measure. Persist the preferred width,
  // but clamp only what is applied so it returns in full on a larger window.
  const [maxSize, setMaxSize] = useState(() =>
    dockMaxWidth(
      typeof window === "undefined" ? 1280 : window.innerWidth,
      reservedWidth
    )
  );
  useEffect(() => {
    const measure = () => {
      setMaxSize(dockMaxWidth(window.innerWidth, reservedWidth));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [reservedWidth]);
  const applied = Math.min(width, maxSize);

  // A drag must track the pointer 1:1. The open/close width transition below would ease every
  // intermediate width instead, so the edge lags the cursor and then keeps travelling after the
  // mouse stops — and because the inner column is pinned to the new width immediately, the content
  // slides the *other* way inside the lagging panel. Dropping the transition class for the duration
  // of the drag is the fix; a CSS override can't do it, since Tailwind's utility layer wins over
  // anything we write in the components layer regardless of specificity.
  const [dragging, setDragging] = useState(false);

  const resizeHandle = useResizeHandle({
    axis: "x",
    direction: -1,
    disabled: !open,
    max: maxSize,
    min: dockMinWidth,
    onEnd: () => {
      setDragging(false);
      window.dispatchEvent(new Event("resize"));
    },
    onResize: onWidth,
    onStart: () => {
      setDragging(true);
    },
    value: applied,
  });

  const renderSurfaceCard = ({
    id,
    icon: Icon,
    titleKey,
    descKey,
  }: DockSurfaceDefinition) => (
    <Button
      key={id}
      type="button"
      variant="ghost"
      size="row"
      focusStyle="inset"
      aria-label={t(titleKey)}
      onClick={() => onTab(id)}
      className="dock-surface-card gap-module-inset rounded-module bg-card items-start p-3"
    >
      <Icon className="text-muted-foreground size-4" />
      <span>
        <span className="text-body block font-semibold">{t(titleKey)}</span>
        <span className="text-callout text-muted-foreground mt-0.5 block">
          {t(descKey)}
        </span>
      </span>
    </Button>
  );

  return (
    <aside
      data-dock-placement="right"
      aria-hidden={!open}
      onTransitionEnd={(e) => {
        // Terminals and iframes fit themselves to their box — refit once the sweep lands.
        if (e.target === e.currentTarget && e.propertyName === "width") {
          window.dispatchEvent(new Event("resize"));
        }
      }}
      className={cn(
        "glass-panel dock-panel dock-panel-side relative flex shrink-0 flex-col overflow-hidden border-l",
        // The open/close sweep. Animating the real width moves the document column in the same
        // motion — the old mount-time slide left the layout to snap, which read as an animation
        // cut off halfway. It belongs to open/close only: while the grip is held, the width is the
        // pointer's to set directly.
        dragging && "dock-panel-dragging",
        gone && "invisible"
      )}
      style={{ width: open ? applied : 0 }}
    >
      <div
        data-dock-resize="horizontal"
        className="dock-grip"
        aria-label={t("dock.resize")}
        title={t("dock.resize")}
        {...resizeHandle}
      />

      {/* Pin the animated dimension so panel content does not reflow while it sweeps. */}
      <div className="flex min-h-0 flex-1 flex-col" style={{ width: applied }}>
        {shown === "home" ? (
          <>
            {/* The fixed shell titlebar keeps this empty state on the workspace and rail baseline. */}
            <div
              data-dock-titlebar
              className="window-titlebar electrobun-webkit-app-region-drag flex items-center gap-1 px-3"
            >
              <div className="electrobun-webkit-app-region-drag flex-1" />
              <Button
                variant="ghost"
                size="compact"
                className="w-(--ds-control-normal) px-0"
                onClick={onClose}
                title={t("dock.close")}
              >
                <X className="size-3.5" />
              </Button>
            </div>
            <div className="dock-surface-picker flex min-h-0 flex-1 items-start justify-center overflow-y-auto">
              <div className="animate-rise-in w-full max-w-[420px]">
                <h2 className="text-heading text-center font-semibold">
                  {t("dock.openSurface")}
                </h2>
                <p className="text-hint text-muted-foreground mt-1 text-center">
                  {t("dock.openSurfaceHint")}
                </p>
                <div className="dock-surface-grid">
                  {visibleSurfaces.map(renderSurfaceCard)}
                </div>
              </div>
            </div>
          </>
        ) : (
          <Tabs
            value={shown}
            onValueChange={(v) => onTab(v as DockSurface)}
            className="flex min-h-0 flex-1 flex-col gap-0"
          >
            {/* The shared 46px height matches the main header, so this tab row and the breadcrumb
            share one vertical centre and one continuous bottom border. It drags the window for the
            same reason: the overlay title bar leaves nothing else to grab. */}
            <div
              data-dock-titlebar
              className="window-titlebar electrobun-webkit-app-region-drag flex items-center gap-1 px-3"
            >
              <TabsList variant="toolbar">
                {visibleSurfaces.map(({ id, icon: Icon, titleKey }) => (
                  <TabsTrigger
                    key={id}
                    value={id}
                    title={
                      autoTab === id
                        ? `${t(titleKey)} · ${t("dockFollow.auto")}`
                        : t(titleKey)
                    }
                  >
                    <Icon className="size-3.5" />
                    <span className="dock-tab-label">{t(titleKey)}</span>
                    {autoTab === id && (
                      <span className="bg-primary size-1.5 animate-pulse rounded-full" />
                    )}
                  </TabsTrigger>
                ))}
              </TabsList>
              <div className="electrobun-webkit-app-region-drag flex-1" />
              <Button
                variant="ghost"
                size="compact"
                className="w-(--ds-control-normal) px-0"
                onClick={onClose}
                title={t("dock.close")}
              >
                <X className="size-3.5" />
              </Button>
            </div>

            {visibleSurfaces.map(({ id }) => (
              <TabsContent
                key={id}
                value={id}
                className="m-0 flex min-h-0 flex-1"
              >
                {content[id]}
              </TabsContent>
            ))}
          </Tabs>
        )}
      </div>
    </aside>
  );
}
