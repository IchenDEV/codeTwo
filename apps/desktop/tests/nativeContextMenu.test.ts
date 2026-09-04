import { describe, expect, test } from "bun:test";

import {
  nativeContextMenuAction,
  nativeContextMenuConfig,
} from "../src/electrobun/contextMenuHost";

describe("native context menu bridge", () => {
  test("serializes actions and nested items without exposing arbitrary host actions", () => {
    expect(
      nativeContextMenuConfig(
        [
          { type: "item", label: "Rename", action: "rename" },
          { type: "separator" },
          {
            type: "item",
            label: "Copy",
            action: "copy",
            submenu: [
              { type: "item", label: "Session ID", action: "copy-session-id" },
            ],
          },
        ],
        "request-1"
      )
    ).toEqual([
      {
        type: "normal",
        label: "Rename",
        action: "codetwo-context-menu",
        data: { requestId: "request-1", action: "rename" },
        enabled: undefined,
        checked: undefined,
      },
      { type: "separator" },
      {
        type: "normal",
        label: "Copy",
        action: "codetwo-context-menu",
        data: { requestId: "request-1", action: "copy" },
        enabled: undefined,
        checked: undefined,
        submenu: [
          {
            type: "normal",
            label: "Session ID",
            action: "codetwo-context-menu",
            data: { requestId: "request-1", action: "copy-session-id" },
            enabled: undefined,
            checked: undefined,
          },
        ],
      },
    ]);
  });

  test("accepts only CodeTwo context-menu callbacks with a complete payload", () => {
    expect(
      nativeContextMenuAction({
        data: {
          action: "codetwo-context-menu",
          data: { requestId: "request-2", action: "archive" },
        },
      })
    ).toEqual({ requestId: "request-2", action: "archive" });
    expect(
      nativeContextMenuAction({ data: { action: "other", data: {} } })
    ).toBeNull();
    expect(
      nativeContextMenuAction({
        data: { action: "codetwo-context-menu", data: {} },
      })
    ).toBeNull();
  });
});
