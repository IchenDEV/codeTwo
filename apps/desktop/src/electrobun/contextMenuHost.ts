import type { ApplicationMenuItemConfig } from "electrobun/bun";

import type { NativeContextMenuAction, NativeContextMenuItem } from "./rpc";

const CONTEXT_MENU_ACTION = "codetwo-context-menu";

export function nativeContextMenuConfig(
  items: NativeContextMenuItem[],
  requestId: string
): ApplicationMenuItemConfig[] {
  return items.map((item) => {
    if (item.type === "separator") return { type: "separator" };

    return {
      type: "normal",
      label: item.label,
      action: CONTEXT_MENU_ACTION,
      data: { requestId, action: item.action },
      enabled: item.enabled,
      checked: item.checked,
      ...(item.submenu
        ? { submenu: nativeContextMenuConfig(item.submenu, requestId) }
        : {}),
    };
  });
}

export function nativeContextMenuAction(
  event: unknown
): NativeContextMenuAction | null {
  if (typeof event !== "object" || event === null) return null;
  const eventData = (event as { data?: unknown }).data;
  if (typeof eventData !== "object" || eventData === null) return null;

  const { action, data } = eventData as { action?: unknown; data?: unknown };
  if (
    action !== CONTEXT_MENU_ACTION ||
    typeof data !== "object" ||
    data === null
  )
    return null;

  const { requestId } = data as { requestId?: unknown };
  const selectedAction = (data as { action?: unknown }).action;
  if (typeof requestId !== "string" || typeof selectedAction !== "string")
    return null;
  return { requestId, action: selectedAction };
}
