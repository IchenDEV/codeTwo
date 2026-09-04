import type { ApplicationMenuItemConfig } from "electrobun/bun";

/**
 * WKWebView relies on native responder roles for standard editing shortcuts on macOS.
 * Keeping the roles in the application menu lets the focused editor own undo/cut/copy/paste.
 */
export function macOSApplicationMenu(): ApplicationMenuItemConfig[] {
  return [
    {
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "showAll" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "pasteAndMatchStyle" },
        { role: "delete" },
        { role: "selectAll" },
      ],
    },
  ];
}
