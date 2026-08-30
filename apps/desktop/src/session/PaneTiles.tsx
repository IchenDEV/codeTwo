import {
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";

import { cn } from "@/lib/utils";
import {
  computeDividers,
  computePaneRects,
  listPanes,
  type PaneLayout,
} from "./paneLayout";
import { PaneDivider } from "./PaneDivider";

const percent = (value: number): string => `${value * 100}%`;

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
      {dividers.map((divider) => (
        <PaneDivider
          key={divider.splitId}
          divider={divider}
          containerRef={containerRef}
          className="group z-10"
          onResize={(ratio) => onResizeSplit(divider.splitId, ratio)}
        />
      ))}
    </div>
  );
}
