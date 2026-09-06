const dragRegionSelector = ".electrobun-webkit-app-region-drag";
const noDragRegionSelector = ".electrobun-webkit-app-region-no-drag";

function isTitlebarDragTarget(target: EventTarget | null): boolean {
  // Duck-type `closest` so happy-dom / iframe Elements still match; `instanceof
  // Element` fails across JS realms even when the node is a real Element.
  if (target == null) return false;
  const closest = Reflect.get(target, "closest");
  if (typeof closest !== "function") return false;
  const lookup = (selector: string): unknown =>
    Reflect.apply(closest, target, [selector]);
  if (lookup(noDragRegionSelector) != null) return false;
  return lookup(dragRegionSelector) != null;
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
