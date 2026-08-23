import type { NativeContextMenuAction, NativeContextMenuItem } from "./rpc";
import { desktopShowContextMenu, isElectrobun, listenDesktop } from "./client";

type ActionHandler = (action: string) => void;

const pendingMenus = new Map<string, ActionHandler>();
let nextRequestId = 0;
let listening = false;

export const nativeContextMenusAvailable =
  isElectrobun && typeof navigator !== "undefined" && /Mac|Win/.test(navigator.platform);

function ensureActionListener(): void {
  if (listening) return;
  listening = true;
  listenDesktop<NativeContextMenuAction>("native-context-menu-action", ({ requestId, action }) => {
    const handler = pendingMenus.get(requestId);
    if (!handler) return;
    pendingMenus.delete(requestId);
    handler(action);
  });
}

export async function showNativeContextMenu(
  items: NativeContextMenuItem[],
  onAction: ActionHandler,
): Promise<void> {
  ensureActionListener();

  // A platform can only present one context menu at a time. Replacing stale callbacks also keeps
  // a dismissed menu from retaining the row it belonged to.
  pendingMenus.clear();
  const requestId = `context-menu-${Date.now()}-${nextRequestId++}`;
  pendingMenus.set(requestId, onAction);

  try {
    await desktopShowContextMenu({ requestId, items });
  } catch (error) {
    pendingMenus.delete(requestId);
    throw error;
  }
}
