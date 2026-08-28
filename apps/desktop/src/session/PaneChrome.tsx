import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { PanelBottom, PanelRight, X } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";

import { MIN_RATIO, type DividerRect } from "./paneLayout";
import { TurnCard } from "./TurnCard";
import type { Turn } from "./turns";

const percent = (value: number): string => `${value * 100}%`;
const clampRatio = (ratio: number): number =>
  Math.min(1 - MIN_RATIO, Math.max(MIN_RATIO, ratio));

interface PaneToolbarProps {
  onSplitRight: () => void;
  onSplitDown: () => void;
  onClose: () => void;
  canClose: boolean;
  labels: { splitRight: string; splitDown: string; close: string };
}

/** The split / close controls shown on every tiled pane. */
export function PaneToolbar({
  onSplitRight,
  onSplitDown,
  onClose,
  canClose,
  labels,
}: PaneToolbarProps) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        title={labels.splitRight}
        aria-label={labels.splitRight}
        className="size-7 text-muted-foreground hover:text-muted-foreground"
        onClick={onSplitRight}
      >
        <PanelRight className="size-4" aria-hidden />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        title={labels.splitDown}
        aria-label={labels.splitDown}
        className="size-7 text-muted-foreground hover:text-muted-foreground"
        onClick={onSplitDown}
      >
        <PanelBottom className="size-4" aria-hidden />
      </Button>
      {canClose ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          title={labels.close}
          aria-label={labels.close}
          className="size-7 text-muted-foreground hover:text-muted-foreground"
          onClick={onClose}
        >
          <X className="size-4" aria-hidden />
        </Button>
      ) : null}
    </div>
  );
}

interface PanePreviewProps {
  title: string;
  running: boolean;
  turns: readonly Turn[];
  emptyLabel: string;
  toolbar: PaneToolbarProps;
}

/**
 * A non-focused pane: its live transcript, read-only. Turns still stream in through the
 * session-routed event handler, so this mirrors a background agent's progress. Pressing anywhere
 * focuses the pane (handled by the tiling host) — this component only renders.
 */
export function PanePreview({
  title,
  running,
  turns,
  emptyLabel,
  toolbar,
}: PanePreviewProps) {
  return (
    <div className="flex size-full flex-col bg-background">
      <header className="flex shrink-0 items-center gap-2 bg-fill-quiet px-3 py-2">
        {running ? (
          <span
            className="size-1.5 shrink-0 animate-pulse rounded-full bg-primary"
            aria-hidden
          />
        ) : null}
        <span className="min-w-0 flex-1 truncate text-fine font-medium">{title}</span>
        <PaneToolbar {...toolbar} />
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {turns.length === 0 ? (
          <p className="px-3 py-6 text-center text-fine text-muted-foreground">
            {emptyLabel}
          </p>
        ) : (
          <div className="mx-auto w-full max-w-3xl px-4 pb-6 pt-3">
            <ol className="m-0 list-none p-0">
              {turns.map((turn) => (
                <li key={turn.transcriptStartSeq ?? turn.id} className="transcript-turn">
                  <TurnCard turn={turn} />
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}

interface PaneDividerProps {
  divider: DividerRect;
  /** The tiling container the normalized rectangles are measured against. */
  containerRef: RefObject<HTMLElement | null>;
  onResize: (ratio: number) => void;
}

/** A draggable boundary between two panes; reports a new split ratio to the host. */
export function PaneDivider({ divider, containerRef, onResize }: PaneDividerProps) {
  const vertical = divider.direction === "row";
  const boundary = vertical
    ? divider.rect.x + divider.rect.w * divider.ratio
    : divider.rect.y + divider.rect.h * divider.ratio;

  const beginResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const container = containerRef.current;
    if (!container) return;
    const move = (moveEvent: PointerEvent) => {
      const bounds = container.getBoundingClientRect();
      if (bounds.width === 0 || bounds.height === 0) return;
      const ratio = vertical
        ? (moveEvent.clientX - bounds.left - divider.rect.x * bounds.width) /
          (divider.rect.w * bounds.width)
        : (moveEvent.clientY - bounds.top - divider.rect.y * bounds.height) /
          (divider.rect.h * bounds.height);
      onResize(clampRatio(ratio));
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
  };

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
      data-divider-id={divider.splitId}
      role="separator"
      aria-orientation={vertical ? "vertical" : "horizontal"}
      className="z-20"
      style={handleStyle}
      onPointerDown={beginResize}
    >
      <div className="bg-border transition-colors hover:bg-primary" style={lineStyle} />
    </div>
  );
}
