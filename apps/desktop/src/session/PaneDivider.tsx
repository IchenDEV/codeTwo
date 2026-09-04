import type { CSSProperties, RefObject } from "react";

import { useResizeHandle } from "@/components/ui/use-resize-handle";
import { minRatio } from "./paneLayout";
import type { DividerRect } from "./paneLayout";

const percent = (value: number): string => `${value * 100}%`;

interface PaneDividerProps {
  readonly divider: DividerRect;
  /**
  The tiling container the normalized rectangles are measured against.
  */
  readonly containerRef: RefObject<HTMLElement | null>;
  readonly onResize: (ratio: number) => void;
  readonly className?: string;
}

/**
Shared pointer-and-keyboard boundary for every tiled-pane host.
*/
export const PaneDivider = ({
  divider,
  containerRef,
  onResize,
  className = "group z-20",
}: PaneDividerProps) => {
  const isVertical = divider.direction === "row";
  const boundary = isVertical
    ? divider.rect.x + divider.rect.w * divider.ratio
    : divider.rect.y + divider.rect.h * divider.ratio;
  const resizeHandle = useResizeHandle({
    axis: isVertical ? "x" : "y",
    max: 1 - minRatio,
    min: minRatio,
    onResize,
    round: false,
    step: 0.02,
    value: divider.ratio,
    valueFromPointer: (event) => {
      const container = containerRef.current;
      if (!container) {
        return divider.ratio;
      }
      const bounds = container.getBoundingClientRect();
      if (bounds.width === 0 || bounds.height === 0) {
        return divider.ratio;
      }
      return isVertical
        ? (event.clientX - bounds.left - divider.rect.x * bounds.width) /
            (divider.rect.w * bounds.width)
        : (event.clientY - bounds.top - divider.rect.y * bounds.height) /
            (divider.rect.h * bounds.height);
    },
  });

  const handleStyle: CSSProperties = isVertical
    ? {
        cursor: "col-resize",
        height: percent(divider.rect.h),
        left: percent(boundary),
        position: "absolute",
        top: percent(divider.rect.y),
        touchAction: "none",
        transform: "translateX(-50%)",
        width: 8,
      }
    : {
        cursor: "row-resize",
        height: 8,
        left: percent(divider.rect.x),
        position: "absolute",
        top: percent(boundary),
        touchAction: "none",
        transform: "translateY(-50%)",
        width: percent(divider.rect.w),
      };
  const lineStyle: CSSProperties = isVertical
    ? {
        bottom: 0,
        left: "50%",
        position: "absolute",
        top: 0,
        transform: "translateX(-50%)",
        width: 1,
      }
    : {
        height: 1,
        left: 0,
        position: "absolute",
        right: 0,
        top: "50%",
        transform: "translateY(-50%)",
      };

  return (
    <div
      {...resizeHandle}
      data-divider-id={divider.splitId}
      aria-label="Resize panes"
      aria-valuetext={`${Math.round(divider.ratio * 100)}%`}
      className={className}
      style={handleStyle}
    >
      <div
        className="bg-border group-hover:bg-primary group-focus-visible:bg-primary transition-colors"
        style={lineStyle}
      />
    </div>
  );
};
