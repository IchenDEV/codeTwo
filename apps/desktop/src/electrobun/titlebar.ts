const dragRegionSelector = ".electrobun-webkit-app-region-drag";
const noDragRegionSelector = ".electrobun-webkit-app-region-no-drag";

function isTitlebarDragTarget(target: EventTarget | null): boolean {
  const element = target as Element | null;
  if (!element || typeof element.closest !== "function") {
    return false;
  }
  if (element.closest(noDragRegionSelector)) {
    return false;
  }
  return element.closest(dragRegionSelector) !== null;
}

export function installTitlebarDoubleClick(
  document: Document,
  performTitlebarAction: () => void
): () => void {
  const onDoubleClick = (event: MouseEvent) => {
    if (event.button !== 0 || !isTitlebarDragTarget(event.target)) {
      return;
    }
    event.preventDefault();
    performTitlebarAction();
  };

  document.addEventListener("dblclick", onDoubleClick);
  return () => {
    document.removeEventListener("dblclick", onDoubleClick);
  };
}
