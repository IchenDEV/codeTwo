import { type CSSProperties, type RefObject } from "react";

import { useResizeHandle } from "@/components/ui/use-resize-handle";

import { MIN_RATIO, type DividerRect } from "./paneLayout";

const percent = (value: number): string => `${value * 100}%`;

interface PaneDividerProps {
  divider: DividerRect;
  /** The tiling container the normalized rectangles are measured against. */
  containerRef: RefObject<HTMLElement | null>;
  onResize: (ratio: number) => void;
  className?: string;
}

/** Shared pointer-and-keyboard boundary for every tiled-pane host. */
export function PaneDivider({
  divider,
  containerRef,
  onResize,
  className = "group z-20",
}: PaneDividerProps) {
  const vertical = divider.direction === "row";
  const boundary = vertical
    ? divider.rect.x + divider.rect.w * divider.ratio
    : divider.rect.y + divider.rect.h * divider.ratio;
  const resizeHandle = useResizeHandle({
    axis: vertical ? "x" : "y",
    value: divider.ratio,
    min: MIN_RATIO,
    max: 1 - MIN_RATIO,
    step: 0.02,
    round: false,
    valueFromPointer: (event) => {
      const container = containerRef.current;
      if (!container) return divider.ratio;
      const bounds = container.getBoundingClientRect();
      if (bounds.width === 0 || bounds.height === 0) return divider.ratio;
      return vertical
        ? (event.clientX - bounds.left - divider.rect.x * bounds.width) /
            (divider.rect.w * bounds.width)
        : (event.clientY - bounds.top - divider.rect.y * bounds.height) /
            (divider.rect.h * bounds.height);
    },
    onResize,
  });

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
}
