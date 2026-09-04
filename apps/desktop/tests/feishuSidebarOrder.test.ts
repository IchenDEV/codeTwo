import { describe, expect, test } from "bun:test";

import {
  FEISHU_SIDEBAR_ORDER_KEY,
  loadFeishuSidebarOrder,
  moveFeishuResource,
  moveFeishuSection,
  saveFeishuSidebarOrder,
  sortFeishuResources,
} from "../src/feishu/sidebarOrder";

describe("Feishu sidebar ordering", () => {
  test("moves semantic Sections and resources independently", () => {
    let state = loadFeishuSidebarOrder(null);
    state = moveFeishuSection(state, "documents", "messages");
    state = moveFeishuResource(state, "messages", "chat-b", "chat-a", [
      "chat-a",
      "chat-b",
    ]);

    expect(state.sectionOrder).toEqual(["documents", "messages", "bases"]);
    expect(state.resourceOrder.messages).toEqual(["chat-b", "chat-a"]);
    expect(
      sortFeishuResources(
        [{ id: "new-chat" }, { id: "chat-a" }, { id: "chat-b" }],
        state.resourceOrder.messages
      ).map((resource) => resource.id)
    ).toEqual(["new-chat", "chat-b", "chat-a"]);
  });

  test("persists a validated order and restores missing built-in Sections", () => {
    const values = new Map<string, string>();
    saveFeishuSidebarOrder(
      {
        setItem: (key, value) => values.set(key, value),
      },
      {
        version: 1,
        sectionOrder: ["bases", "messages", "documents"],
        resourceOrder: { messages: ["chat-a"], documents: [], bases: [] },
      }
    );

    expect(values.has(FEISHU_SIDEBAR_ORDER_KEY)).toBe(true);
    expect(
      loadFeishuSidebarOrder({ getItem: (key) => values.get(key) ?? null })
        .sectionOrder
    ).toEqual(["bases", "messages", "documents"]);

    values.set(
      FEISHU_SIDEBAR_ORDER_KEY,
      JSON.stringify({
        version: 1,
        sectionOrder: ["documents"],
        resourceOrder: {},
      })
    );
    expect(
      loadFeishuSidebarOrder({ getItem: (key) => values.get(key) ?? null })
        .sectionOrder
    ).toEqual(["documents", "messages", "bases"]);
  });
});
