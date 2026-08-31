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
  type PaneEdge,
  type PaneLayout,
  type PaneNode,
} from "./paneLayout";
import { PaneDivider } from "./PaneDivider";

const percent = (value: number): string => `${value * 100}%`;

function paneEntranceEdge(node: PaneNode, paneId: string): PaneEdge | null {
  if (node.kind === "leaf") return null;
  if (node.a.kind === "leaf" && node.a.id === paneId) {
    return node.direction === "row" ? "left" : "top";
  }
  if (node.b.kind === "leaf" && node.b.id === paneId) {
    return node.direction === "row" ? "right" : "bottom";
  }
  return paneEntranceEdge(node.a, paneId) ?? paneEntranceEdge(node.b, paneId);
}

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
  const knownPaneIdsRef = useRef(new Set(paneIds));
  const entranceEdgesRef = useRef(new Map<string, PaneEdge>());
  const currentPaneIds = new Set(paneIds);
  for (const paneId of paneIds) {
    if (knownPaneIdsRef.current.has(paneId)) continue;
    const edge = paneEntranceEdge(layout.root, paneId);
    if (edge) entranceEdgesRef.current.set(paneId, edge);
  }
  for (const paneId of entranceEdgesRef.current.keys()) {
    if (!currentPaneIds.has(paneId)) entranceEdgesRef.current.delete(paneId);
  }
  knownPaneIdsRef.current = currentPaneIds;
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
        const entranceEdge = entranceEdgesRef.current.get(paneId);
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
            data-pane-entrance={entranceEdge}
            className={cn(
              "overflow-hidden",
              entranceEdge && "pane-tile-enter",
              entranceEdge && `pane-tile-enter-${entranceEdge}`,
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
