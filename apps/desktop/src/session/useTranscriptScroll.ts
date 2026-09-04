import { useLayoutEffect, useRef, useState } from "react";
import { isTranscriptNearEnd, scrollTopAfterPrepend } from "./transcriptScroll";
import type {
  KeyboardEventHandler,
  MutableRefObject,
  PointerEventHandler,
  UIEventHandler,
} from "react";

import type { TranscriptScrollAnchor } from "./transcriptScroll";
import type { Turn } from "./turns";

export interface TranscriptScrollController {
  viewportRef: MutableRefObject<HTMLElement | null>;
  showJumpToLatest: boolean;
  onScroll: UIEventHandler<HTMLElement>;
  onPointerDownCapture: PointerEventHandler<HTMLElement>;
  onKeyDownCapture: KeyboardEventHandler<HTMLElement>;
  jumpToLatest: () => void;
  capturePrependAnchor: () => TranscriptScrollAnchor | null;
  prepareForPrepend: (anchor: TranscriptScrollAnchor | null) => void;
}

function prefersReducedMotion(): boolean {
  return (
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
  );
}

export function useTranscriptScroll(
  sessionId: string | null,
  turns: readonly Turn[]
): TranscriptScrollController {
  const viewportReference = useRef<HTMLElement | null>(null);
  const followingReference = useRef(true);
  const pendingPrependReference = useRef<TranscriptScrollAnchor | null>(null);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);

  const syncJumpVisibility = (element: HTMLElement | null) => {
    const isVisible = element ? !isTranscriptNearEnd(element) : false;
    setShowJumpToLatest((current) =>
      current === isVisible ? current : isVisible
    );
  };

  useLayoutEffect(() => {
    followingReference.current = true;
    pendingPrependReference.current = null;
    setShowJumpToLatest(false);
  }, [sessionId]);

  useLayoutEffect(() => {
    const anchor = pendingPrependReference.current;
    if (anchor) {
      pendingPrependReference.current = null;
      const element = anchor.element.isConnected
        ? anchor.element
        : viewportReference.current;
      if (element) {
        element.scrollTop = scrollTopAfterPrepend(anchor, element.scrollHeight);
        followingReference.current = isTranscriptNearEnd(element);
        syncJumpVisibility(element);
      }
      return;
    }

    const element = viewportReference.current;
    if (!element) {
      return;
    }
    if (followingReference.current) {
      // Streaming can update many times a second. Assigning scrollTop avoids stacking smooth-scroll
      // animations and batches the read/write inside the post-render layout phase.
      element.scrollTop = element.scrollHeight;
      setShowJumpToLatest(false);
    } else {
      syncJumpVisibility(element);
    }
  }, [syncJumpVisibility, turns]);

  const onScroll: UIEventHandler<HTMLElement> = (event) => {
    const isFollowing = isTranscriptNearEnd(event.currentTarget);
    followingReference.current = isFollowing;
    setShowJumpToLatest((current) =>
      current === !isFollowing ? current : !isFollowing
    );
  };

  const pauseFollowing = () => {
    followingReference.current = false;
  };

  const onKeyDownCapture: KeyboardEventHandler<HTMLElement> = (event) => {
    if (["ArrowUp", "Home", "PageUp"].includes(event.key)) {
      followingReference.current = false;
    }
  };

  const jumpToLatest = () => {
    followingReference.current = true;
    setShowJumpToLatest(false);
    viewportReference.current?.scrollTo({
      behavior: prefersReducedMotion() ? "auto" : "smooth",
      top: viewportReference.current.scrollHeight,
    });
  };

  const capturePrependAnchor = (): TranscriptScrollAnchor | null => {
    const element = viewportReference.current;
    if (!element) {
      return null;
    }
    return {
      element,
      scrollHeight: element.scrollHeight,
      scrollTop: element.scrollTop,
    };
  };

  const prepareForPrepend = (anchor: TranscriptScrollAnchor | null) => {
    pendingPrependReference.current = anchor;
  };

  return {
    capturePrependAnchor,
    jumpToLatest,
    onKeyDownCapture,
    onPointerDownCapture: pauseFollowing,
    onScroll,
    prepareForPrepend,
    showJumpToLatest,
    viewportRef: viewportReference,
  };
}
