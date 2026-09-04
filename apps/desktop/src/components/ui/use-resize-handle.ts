import { useCallback, useEffect, useRef } from "react";
import type { KeyboardEventHandler, PointerEventHandler } from "react";

interface ResizeHandleOptions {
  axis: "x" | "y";
  direction?: 1 | -1;
  value: number;
  min: number;
  max: number;
  step?: number;
  /**
  Maps pointer coordinates directly to the controlled value (for normalized split ratios).
  */
  valueFromPointer?: (
    event: Pick<PointerEvent, "clientX" | "clientY">
  ) => number;
  /**
  Pixel handles use whole values; normalized handles opt out.
  */
  round?: boolean;
  disabled?: boolean;
  onStart?: () => void;
  onResize: (value: number) => void;
  onEnd?: () => void;
}

interface ActiveResize {
  axis: ResizeHandleOptions["axis"];
  direction: 1 | -1;
  pointerId: number;
  start: number;
  startValue: number;
}

function clamp(value: number, min: number, max: number, round = true) {
  const clamped = Math.min(max, Math.max(min, value));
  return round ? Math.round(clamped) : clamped;
}

function bodyClassName(axis: ResizeHandleOptions["axis"]) {
  return axis === "x" ? "resizing-h" : "resizing-v";
}

/**
 * Keep a splitter gesture on its native Pointer Events stream. Pointer capture makes the handle
 * receive the matching move, up, and cancel events even after the pointer leaves its hit area.
 */
export function useResizeHandle(options: ResizeHandleOptions) {
  const optionsReference = useRef(options);
  const activeReference = useRef<ActiveResize | null>(null);
  optionsReference.current = options;

  const finish = useCallback((element: HTMLElement, pointerId: number) => {
    const active = activeReference.current;
    if (!active || active.pointerId !== pointerId) {
      return;
    }

    activeReference.current = null;
    document.body.classList.remove(bodyClassName(active.axis));
    optionsReference.current.onEnd?.();
    if (element.hasPointerCapture(pointerId)) {
      element.releasePointerCapture(pointerId);
    }
  }, []);

  useEffect(() => () => {
									      const active = activeReference.current;
									      if (!active) return;
									      activeReference.current = null;
									      document.body.classList.remove(bodyClassName(active.axis));
									    }, []);

  const onPointerDown = useCallback<PointerEventHandler<HTMLElement>>(
    (event) => {
      if (
        event.button !== 0 ||
        activeReference.current ||
        optionsReference.current.disabled
      ) {
        return;
      }
      event.preventDefault();

      const { current } = optionsReference;
      activeReference.current = {
        axis: current.axis,
        direction: current.direction ?? 1,
        pointerId: event.pointerId,
        start: current.axis === "x" ? event.clientX : event.clientY,
        startValue: current.value,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      document.body.classList.add(bodyClassName(current.axis));
      current.onStart?.();
    },
    []
  );

  const onPointerMove = useCallback<PointerEventHandler<HTMLElement>>(
    (event) => {
      const active = activeReference.current;
      if (!active || active.pointerId !== event.pointerId) {
        return;
      }
      const current = active.axis === "x" ? event.clientX : event.clientY;
      const options = optionsReference.current;
      const next = options.valueFromPointer
        ? options.valueFromPointer(event)
        : active.startValue + (current - active.start) * active.direction;
      options.onResize(clamp(next, options.min, options.max, options.round));
    },
    []
  );

  const onKeyDown = useCallback<KeyboardEventHandler<HTMLElement>>((event) => {
    const { current } = optionsReference;
    if (current.disabled) {
      return;
    }
    const backward = current.axis === "x" ? "ArrowLeft" : "ArrowUp";
    const forward = current.axis === "x" ? "ArrowRight" : "ArrowDown";
    let next: number;

    switch (event.key) {
      case "Home": {
        next = current.min;
        break;
      }
      case "End": {
        next = current.max;
        break;
      }
      case backward:
      case forward: {
        const pointerDelta =
          event.key === backward ? -(current.step ?? 10) : (current.step ?? 10);
        next = current.value + pointerDelta * (current.direction ?? 1);

        break;
      }
      default: {
        return;
      }
    }

    event.preventDefault();
    current.onStart?.();
    current.onResize(clamp(next, current.min, current.max, current.round));
    current.onEnd?.();
  }, []);

  const onPointerUp = useCallback<PointerEventHandler<HTMLElement>>(
    (event) => {
      finish(event.currentTarget, event.pointerId);
    },
    [finish]
  );

  const onPointerCancel = useCallback<PointerEventHandler<HTMLElement>>(
    (event) => {
      finish(event.currentTarget, event.pointerId);
    },
    [finish]
  );

  const onLostPointerCapture = useCallback<PointerEventHandler<HTMLElement>>(
    (event) => {
      finish(event.currentTarget, event.pointerId);
    },
    [finish]
  );

  return {
    role: "separator" as const,
    tabIndex: options.disabled ? -1 : 0,
    "aria-disabled": options.disabled || undefined,
    "aria-orientation":
      options.axis === "x" ? ("vertical" as const) : ("horizontal" as const),
    "aria-valuemin": options.min,
    "aria-valuemax": options.max,
    "aria-valuenow": clamp(
      options.value,
      options.min,
      options.max,
      options.round
    ),
    onLostPointerCapture,
    onKeyDown,
    onPointerCancel,
    onPointerDown,
    onPointerMove,
    onPointerUp,
  };
}
