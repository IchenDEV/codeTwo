import {
  useRef,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import { cn } from "@/lib/utils";
import {
  computeDividers,
  computePaneRects,
  listPanes,
  MIN_RATIO,
  type DividerRect,
  type PaneLayout,
} from "./paneLayout";

const percent = (value: number): string => `${value * 100}%`;
const clampRatio = (ratio: number): number =>
  Math.min(1 - MIN_RATIO, Math.max(MIN_RATIO, ratio));

export interface PaneTilesProps {
  layout: PaneLayout;
  /** Renders a leaf's content. Called once per pane; the node is kept mounted across relayouts. */
  renderPane: (paneId: string, focused: boolean) => ReactNode;
  onFocusPane: (paneId: string) => void;
  onResizeSplit: (splitId: string, ratio: number) => void;
  className?: string;
}

/**
 * Renders a tiling workspace from a {@link PaneLayout}. Every pane is absolutely positioned from
 * its normalized rectangle and keyed by paneId, so splitting, closing, focusing or resizing never
 * moves a pane within the React tree — its composer/editor instance (and unsaved draft) survives a
 * relayout. Dragging a divider reports a new ratio; the parent owns the layout state.
 */
export function PaneTiles({
  layout,
  renderPane,
  onFocusPane,
  onResizeSplit,
  className,
}: PaneTilesProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const paneIds = listPanes(layout.root);
  const rects = computePaneRects(layout.root);
  const dividers = computeDividers(layout.root);
  // A lone pane fills the workspace, so a focus ring would just outline the whole column; only
  // show it once tiling actually splits the space.
  const multiPane = paneIds.length > 1;

  const beginResize =
    (divider: DividerRect) => (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      const container = containerRef.current;
      if (!container) return;
      const move = (moveEvent: PointerEvent) => {
        const bounds = container.getBoundingClientRect();
        if (bounds.width === 0 || bounds.height === 0) return;
        const ratio =
          divider.direction === "row"
            ? (moveEvent.clientX - bounds.left - divider.rect.x * bounds.width) /
              (divider.rect.w * bounds.width)
            : (moveEvent.clientY - bounds.top - divider.rect.y * bounds.height) /
              (divider.rect.h * bounds.height);
        onResizeSplit(divider.splitId, clampRatio(ratio));
      };
      const end = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", end);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", end);
    };

  return (
    <div
      ref={containerRef}
      className={cn("relative min-h-0 min-w-0 flex-1", className)}
    >
      {paneIds.map((paneId) => {
        const rect = rects.get(paneId);
        if (!rect) return null;
        const focused = paneId === layout.focused;
        const style: CSSProperties = {
          position: "absolute",
          left: percent(rect.x),
          top: percent(rect.y),
          width: percent(rect.w),
          height: percent(rect.h),
        };
        return (
          <div
            key={paneId}
            data-pane-id={paneId}
            data-focused={focused || undefined}
            className={cn(
              "overflow-hidden",
              focused && multiPane && "outline outline-1 -outline-offset-1 outline-ring",
            )}
            style={style}
            // Focus on press so a click's action targets the pane it lands in.
            onMouseDownCapture={focused ? undefined : () => onFocusPane(paneId)}
          >
            {renderPane(paneId, focused)}
          </div>
        );
      })}
      {dividers.map((divider) => {
        const vertical = divider.direction === "row";
        const boundary = vertical
          ? divider.rect.x + divider.rect.w * divider.ratio
          : divider.rect.y + divider.rect.h * divider.ratio;
        const handleStyle: CSSProperties = vertical
          ? {
              position: "absolute",
              left: percent(boundary),
              top: percent(divider.rect.y),
              height: percent(divider.rect.h),
              width: 8,
              transform: "translateX(-50%)",
              cursor: "col-resize",
              touchAction: "none",
            }
          : {
              position: "absolute",
              top: percent(boundary),
              left: percent(divider.rect.x),
              width: percent(divider.rect.w),
              height: 8,
              transform: "translateY(-50%)",
              cursor: "row-resize",
              touchAction: "none",
            };
        const lineStyle: CSSProperties = vertical
          ? {
              position: "absolute",
              left: "50%",
              top: 0,
              bottom: 0,
              width: 1,
              transform: "translateX(-50%)",
            }
          : {
              position: "absolute",
              top: "50%",
              left: 0,
              right: 0,
              height: 1,
              transform: "translateY(-50%)",
            };
        return (
          <div
            key={divider.splitId}
            data-divider-id={divider.splitId}
            role="separator"
            aria-orientation={vertical ? "vertical" : "horizontal"}
            className="z-10"
            style={handleStyle}
            onPointerDown={beginResize(divider)}
          >
            <div className="bg-border transition-colors hover:bg-primary" style={lineStyle} />
          </div>
        );
      })}
    </div>
  );
}
