const dragRegionSelector = ".electrobun-webkit-app-region-drag";
const noDragRegionSelector = ".electrobun-webkit-app-region-no-drag";

function isTitlebarDragTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest(noDragRegionSelector)) return false;
  return target.closest(dragRegionSelector) !== null;
}

export function installTitlebarDoubleClick(
  document: Document,
  performTitlebarAction: () => void
): () => void {
  const onDoubleClick = (event: MouseEvent) => {
    if (event.button !== 0 || !isTitlebarDragTarget(event.target)) return;
    event.preventDefault();
    performTitlebarAction();
  };

  document.addEventListener("dblclick", onDoubleClick);
  return () => document.removeEventListener("dblclick", onDoubleClick);
}
