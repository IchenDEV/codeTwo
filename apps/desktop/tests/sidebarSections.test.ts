import { describe, expect, test } from "bun:test";

import {
  LEGACY_SIDEBAR_SECTIONS_STORAGE_KEY,
  SIDEBAR_SECTIONS_STORAGE_KEY,
  UNSECTIONED_TASK_ORDER_KEY,
  assignTaskSection,
  createSidebarTaskSection,
  deleteSidebarTaskSection,
  loadSidebarTaskSections,
  moveSidebarTask,
  moveSidebarTaskSection,
  renameSidebarTaskSection,
  saveSidebarTaskSections,
  setSidebarTaskSectionCollapsed,
  sortSidebarTasks,
} from "../src/sidebar/sidebarSections";

describe("sidebar Task Sections", () => {
  test("fails closed on malformed or unsupported persisted state", () => {
    const malformed = { getItem: () => "{" };
    const unsupported = {
      getItem: () => JSON.stringify({ version: 99, sections: [] }),
    };

    expect(loadSidebarTaskSections(malformed)).toEqual({
      version: 2,
      sections: [],
      assignments: {},
      taskOrder: {},
    });
    expect(loadSidebarTaskSections(unsupported)).toEqual({
      version: 2,
      sections: [],
      assignments: {},
      taskOrder: {},
    });
  });

  test("migrates v1 Sections without inventing a fixed Highlight group", () => {
    const values = new Map<string, string>([
      [
        LEGACY_SIDEBAR_SECTIONS_STORAGE_KEY,
        JSON.stringify({
          version: 1,
          sections: [{ id: "highlight", name: "Highlight", collapsed: false }],
          assignments: { "task-1": "highlight" },
        }),
      ],
    ]);

    expect(
      loadSidebarTaskSections({ getItem: (key) => values.get(key) ?? null })
    ).toEqual({
      version: 2,
      sections: [{ id: "highlight", name: "Highlight", collapsed: false }],
      assignments: { "task-1": "highlight" },
      taskOrder: {},
    });
  });

  test("creates, assigns, folds, renames, persists, and deletes without deleting Tasks", () => {
    let state = loadSidebarTaskSections(null);
    state = createSidebarTaskSection(state, "  Work  ", "work", "task-1");
    state = assignTaskSection(state, "task-2", "work");
    state = setSidebarTaskSectionCollapsed(state, "work", true);
    state = renameSidebarTaskSection(state, "work", "Deep work");
    state = moveSidebarTask(state, "task-2", "work", "task-1", [
      "task-1",
      "task-2",
    ]);

    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    saveSidebarTaskSections(storage, state);

    expect(values.has(SIDEBAR_SECTIONS_STORAGE_KEY)).toBe(true);
    expect(loadSidebarTaskSections(storage)).toEqual({
      version: 2,
      sections: [{ id: "work", name: "Deep work", collapsed: true }],
      assignments: { "task-1": "work", "task-2": "work" },
      taskOrder: { work: ["task-2", "task-1"] },
    });

    const deleted = deleteSidebarTaskSection(state, "work");
    expect(deleted.sections).toEqual([]);
    expect(deleted.assignments).toEqual({});
    expect(deleted.taskOrder[UNSECTIONED_TASK_ORDER_KEY]).toEqual([
      "task-2",
      "task-1",
    ]);
  });

  test("reorders Sections and Tasks while preserving recency for new Tasks", () => {
    let state = createSidebarTaskSection(
      loadSidebarTaskSections(null),
      "One",
      "one"
    );
    state = createSidebarTaskSection(state, "Two", "two");
    state = moveSidebarTaskSection(state, "two", "one");
    expect(state.sections.map((section) => section.id)).toEqual(["two", "one"]);

    state = moveSidebarTask(state, "older", null, "newer", ["newer", "older"]);
    expect(state.taskOrder[UNSECTIONED_TASK_ORDER_KEY]).toEqual([
      "older",
      "newer",
    ]);
    expect(
      sortSidebarTasks(
        [{ id: "brand-new" }, { id: "newer" }, { id: "older" }],
        state.taskOrder[UNSECTIONED_TASK_ORDER_KEY]
      ).map((task) => task.id)
    ).toEqual(["brand-new", "older", "newer"]);

    state = moveSidebarTask(state, "older", "one", null, []);
    expect(state.assignments.older).toBe("one");
    expect(state.taskOrder[UNSECTIONED_TASK_ORDER_KEY]).toEqual(["newer"]);
    expect(state.taskOrder.one).toEqual(["older"]);
  });

  test("deduplicates names and ignores assignments to missing Sections", () => {
    let state = createSidebarTaskSection(
      loadSidebarTaskSections(null),
      "Work",
      "work"
    );
    state = createSidebarTaskSection(state, "work", "duplicate", "task-1");
    expect(state.sections).toHaveLength(1);
    expect(state.assignments).toEqual({ "task-1": "work" });
    expect(assignTaskSection(state, "task-2", "missing")).toBe(state);
  });
});
