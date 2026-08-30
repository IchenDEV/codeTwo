import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from "react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { useT } from "@/i18n";

interface CapturedSelection {
  text: string;
  rect: DOMRect;
}

interface SelectionActionsProps {
  scopeRef: RefObject<HTMLElement | null>;
  onAdd: (text: string) => void;
  onDetails: (text: string) => void;
  onAskInSideChat: (text: string) => void;
}

interface SelectionToolbarProps {
  text: string;
  onAdd: (text: string) => void;
  onDetails: (text: string) => void;
  onAskInSideChat: (text: string) => void;
}

/** Presentational seam kept independent from Range positioning so its actions stay easy to test. */
export function SelectionToolbar({
  text,
  onAdd,
  onDetails,
  onAskInSideChat,
}: SelectionToolbarProps) {
  const t = useT();
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const [tabStop, setTabStop] = useState(0);

  const onToolbarKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const buttons = Array.from(
      toolbarRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [],
    );
    if (buttons.length === 0) return;

    const current = Math.max(0, buttons.indexOf(document.activeElement as HTMLButtonElement));
    let next: number | null = null;
    if (event.key === "ArrowRight") next = (current + 1) % buttons.length;
    else if (event.key === "ArrowLeft") next = (current - 1 + buttons.length) % buttons.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = buttons.length - 1;
    if (next === null) return;

    event.preventDefault();
    setTabStop(next);
    buttons[next]?.focus();
  };

  return (
    <div
      ref={toolbarRef}
      className="flex items-center gap-0"
      aria-label={t("selection.actions")}
      aria-orientation="horizontal"
      role="toolbar"
      onKeyDown={onToolbarKeyDown}
    >
      <Button
        type="button"
        variant="ghost"
        size="compact"
        tabIndex={tabStop === 0 ? 0 : -1}
        className="rounded-micro"
        onFocus={() => setTabStop(0)}
        onClick={() => onAdd(text)}
      >
        {t("selection.addToChat")}
      </Button>
      <Separator orientation="vertical" className="my-1" aria-hidden />
      <Button
        type="button"
        variant="ghost"
        size="compact"
        tabIndex={tabStop === 1 ? 0 : -1}
        className="rounded-micro"
        onFocus={() => setTabStop(1)}
        onClick={() => onDetails(text)}
      >
        {t("selection.moreDetails")}
      </Button>
      <Separator orientation="vertical" className="my-1" aria-hidden />
      <Button
        type="button"
        variant="ghost"
        size="compact"
        tabIndex={tabStop === 2 ? 0 : -1}
        className="rounded-micro"
        onFocus={() => setTabStop(2)}
        onClick={() => onAskInSideChat(text)}
      >
        {t("selection.askInSideChat")}
      </Button>
    </div>
  );
}

/** Read a non-empty selection only when it belongs to this transcript. */
function readSelection(scope: HTMLElement): CapturedSelection | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;

  const text = selection.toString().trim();
  if (!text) return null;

  const range = selection.getRangeAt(0);
  if (!scope.contains(range.commonAncestorContainer)) return null;

  const rect = range.getBoundingClientRect();
  if (rect.width <= 0 && rect.height <= 0) return null;
  return { text, rect };
}

/**
 * A native-feeling text-selection toolbar anchored to the browser Range itself. Base UI owns the
 * popup lifecycle, collision handling, outside press and Escape behavior; this component only
 * captures the selected text and exposes the three product actions.
 */
export function SelectionActions({
  scopeRef,
  onAdd,
  onDetails,
  onAskInSideChat,
}: SelectionActionsProps) {
  const [captured, setCaptured] = useState<CapturedSelection | null>(null);

  useEffect(() => {
    const scope = scopeRef.current;
    if (!scope) return;

    let timer = 0;
    const capture = () => {
      window.clearTimeout(timer);
      // Pointer-up lands before WebKit has always finalized the Range; one task is enough.
      timer = window.setTimeout(() => setCaptured(readSelection(scope)), 0);
    };
    const close = () => setCaptured(null);

    scope.addEventListener("pointerup", capture);
    // WKWebView can surface a native drag as legacy mouse events without a PointerEvent. The
    // timeout coalesces both paths when an OS release produces both events.
    scope.addEventListener("mouseup", capture);
    scope.addEventListener("keyup", capture);
    // WebKit also exposes selections created by native drag, keyboard shortcuts and
    // accessibility actions through the document-level selectionchange event. Those paths do
    // not consistently dispatch an ending pointer or mouse event to the transcript element.
    document.addEventListener("selectionchange", capture);
    scope.addEventListener("scroll", close, { passive: true });
    window.addEventListener("resize", close);
    return () => {
      window.clearTimeout(timer);
      scope.removeEventListener("pointerup", capture);
      scope.removeEventListener("mouseup", capture);
      scope.removeEventListener("keyup", capture);
      document.removeEventListener("selectionchange", capture);
      scope.removeEventListener("scroll", close);
      window.removeEventListener("resize", close);
    };
  }, [scopeRef]);

  const anchor = useMemo(
    () =>
      captured
        ? {
            getBoundingClientRect: () => captured.rect,
          }
        : null,
    [captured],
  );

  const run = (action: (text: string) => void) => {
    if (!captured) return;
    action(captured.text);
    window.getSelection()?.removeAllRanges();
    setCaptured(null);
  };

  return (
    <Popover
      open={captured !== null}
      onOpenChange={(open) => {
        if (!open) setCaptured(null);
      }}
    >
      {captured && anchor ? (
        <PopoverContent
          anchor={anchor}
          positionMethod="fixed"
          side="top"
          sideOffset={8}
          initialFocus={false}
          finalFocus={false}
          className="w-auto overflow-hidden p-1"
          onPointerDown={(event) => event.preventDefault()}
        >
          <SelectionToolbar
            text={captured.text}
            onAdd={() => run(onAdd)}
            onDetails={() => run(onDetails)}
            onAskInSideChat={() => run(onAskInSideChat)}
          />
        </PopoverContent>
      ) : null}
    </Popover>
  );
}
