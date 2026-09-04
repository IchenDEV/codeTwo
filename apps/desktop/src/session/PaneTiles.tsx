import { useRef } from "react";
import type { CSSProperties, ReactNode } from "react";

import { cn } from "@/lib/utils";
import { computeDividers, computePaneRects, listPanes } from "./paneLayout";
import type { PaneLayout } from "./paneLayout";
import { PaneDivider } from "./PaneDivider";

const percent = (value: number): string => `${value * 100}%`;

export interface PaneTilesProps {
  readonly layout: PaneLayout;
  /**
  Renders a leaf's content. Called once per pane; the node is kept mounted across relayouts.
  */
  readonly renderPane: (paneId: string, isFocused: boolean) => ReactNode;
  readonly onFocusPane: (paneId: string) => void;
  readonly onResizeSplit: (splitId: string, ratio: number) => void;
  readonly className?: string;
}

/**
 * Renders a tiling workspace from a {@link PaneLayout}. Every pane is absolutely positioned from
 * its normalized rectangle and keyed by paneId, so splitting, closing, focusing or resizing never
 * moves a pane within the React tree — its composer/editor instance (and unsaved draft) survives a
 * relayout. Dragging a divider reports a new ratio; the parent owns the layout state.
 */
export const PaneTiles = ({
  layout,
  renderPane,
  onFocusPane,
  onResizeSplit,
  className,
}: PaneTilesProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const paneIds = listPanes(layout.root);
  const rects = computePaneRects(layout.root);
  const dividers = computeDividers(layout.root);
  // A lone pane fills the workspace, so a focus ring would just outline the whole column; only
  // show it once tiling actually splits the space.
  const isMultiPane = paneIds.length > 1;

  return (
    <div
      ref={containerRef}
      className={cn("relative min-h-0 min-w-0 flex-1", className)}
    >
      {paneIds.map((paneId) => {
        const rect = rects.get(paneId);
        if (!rect) {
          return null;
        }
        const isFocused = paneId === layout.focused;
        const style: CSSProperties = {
          height: percent(rect.h),
          left: percent(rect.x),
          position: "absolute",
          top: percent(rect.y),
          width: percent(rect.w),
        };
        return (
          <div
            key={paneId}
            data-pane-id={paneId}
            data-focused={isFocused || undefined}
            className={cn(
              "overflow-hidden",
              isFocused &&
                isMultiPane &&
                "outline-ring outline outline-1 -outline-offset-1"
            )}
            style={style}
            // Focus on press so a click's action targets the pane it lands in.
            onMouseDownCapture={
              isFocused ? undefined : () => onFocusPane(paneId)
            }
          >
            {renderPane(paneId, isFocused)}
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
};
