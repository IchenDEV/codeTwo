import { useCallback, useEffect, useRef } from "react";

/** Distance that separates a click from a pan, mirroring the card drag activation threshold. */
const PAN_ACTIVATION_DISTANCE = 5;

/**
 * Elements whose press must not start a board pan: they own their own pointer semantics (drag
 * cards, links, form controls, menus). Kept broad on purpose; `data-board-pan-exempt` is the
 * explicit opt-out.
 */
const PAN_BLOCKING_SELECTOR = [
  "[data-task-card]",
  "[data-no-board-pan]",
  "a",
  "button",
  "input",
  "textarea",
  "select",
  "option",
  "label",
  "summary",
  "[role='button']",
  "[role='link']",
  "[role='menuitem']",
  "[role='option']",
  "[role='checkbox']",
  "[role='radio']",
  "[role='tab']",
  "[role='switch']",
  "[contenteditable='true']",
].join(", ");

/** True when a press starting on `target` belongs to a card or control instead of the board pan. */
export function boardPanBlocked(target: Element | null): boolean {
  return target != null && target.closest(PAN_BLOCKING_SELECTOR) !== null;
}

/**
 * Blank-area left-drag panning for the board's horizontal scroller (Trello/Linear pattern). The
 * gesture is mouse-only and starts only on empty board background; card drags stay with dnd-kit
 * because every card root carries `data-task-card`. Touch and pen scrolling remain browser-owned.
 *
 * The pointer is captured on `pointerdown` so the gesture survives leaving the board, text
 * selection is suppressed for its duration, and cleanup runs on release, cancel, capture loss and
 * window blur — a lost release can never leave the board stuck in a panning state.
 */
export function useBoardDragPan<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const activeRef = useRef(false);
  const startXRef = useRef(0);
  const lastXRef = useRef(0);

  const reset = useCallback(() => {
    const element = ref.current;
    if (element && pointerIdRef.current !== null) {
      try {
        element.releasePointerCapture(pointerIdRef.current);
      } catch {
        /* capture already released */
      }
    }
    pointerIdRef.current = null;
    activeRef.current = false;
    if (element) {
      element.style.removeProperty("cursor");
      element.style.removeProperty("user-select");
      element.style.removeProperty("-webkit-user-select");
    }
  }, []);

  const onPointerDown = useCallback((event: React.PointerEvent<T>) => {
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    const element = ref.current;
    if (!element) return;
    const target = event.target instanceof Element ? event.target : null;
    if (boardPanBlocked(target)) return;

    pointerIdRef.current = event.pointerId;
    activeRef.current = false;
    startXRef.current = event.clientX;
    lastXRef.current = event.clientX;
    element.style.userSelect = "none";
    element.style.setProperty("-webkit-user-select", "none");
    try {
      element.setPointerCapture(event.pointerId);
    } catch {
      /* capture unsupported; per-move button checks and window blur still end the gesture */
    }
    event.preventDefault();
  }, []);

  const onPointerMove = useCallback(
    (event: React.PointerEvent<T>) => {
      if (
        pointerIdRef.current === null ||
        event.pointerId !== pointerIdRef.current
      )
        return;
      const element = ref.current;
      if (!element) return;
      if ((event.buttons & 1) === 0) {
        reset();
        return;
      }
      if (!activeRef.current) {
        if (
          Math.abs(event.clientX - startXRef.current) < PAN_ACTIVATION_DISTANCE
        )
          return;
        activeRef.current = true;
        element.style.cursor = "grabbing";
      }
      const delta = event.clientX - lastXRef.current;
      lastXRef.current = event.clientX;
      const maxScroll = element.scrollWidth - element.clientWidth;
      element.scrollLeft = Math.min(
        Math.max(element.scrollLeft - delta, 0),
        Math.max(maxScroll, 0)
      );
      event.preventDefault();
    },
    [reset]
  );

  const onPointerUp = useCallback(
    (event: React.PointerEvent<T>) => {
      if (event.pointerId !== pointerIdRef.current) return;
      reset();
    },
    [reset]
  );

  // Safari/Firefox can still start a selection or native drag while the gesture is pending.
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const veto = (event: Event) => {
      if (pointerIdRef.current !== null) event.preventDefault();
    };
    element.addEventListener("selectstart", veto);
    element.addEventListener("dragstart", veto);
    return () => {
      element.removeEventListener("selectstart", veto);
      element.removeEventListener("dragstart", veto);
    };
  }, []);

  useEffect(() => {
    window.addEventListener("blur", reset);
    return () => window.removeEventListener("blur", reset);
  }, [reset]);

  return {
    ref,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel: onPointerUp,
    onLostPointerCapture: onPointerUp,
  };
}
