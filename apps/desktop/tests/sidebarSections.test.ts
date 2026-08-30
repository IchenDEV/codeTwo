import { describe, expect, test } from "bun:test";

import {
  SIDEBAR_SECTIONS_STORAGE_KEY,
  assignTaskSection,
  createSidebarTaskSection,
  deleteSidebarTaskSection,
  loadSidebarTaskSections,
  renameSidebarTaskSection,
  saveSidebarTaskSections,
  setSidebarTaskSectionCollapsed,
} from "../src/sidebar/sidebarSections";

describe("sidebar Task Sections", () => {
  test("fails closed on malformed or unsupported persisted state", () => {
    const malformed = { getItem: () => "{" };
    const unsupported = { getItem: () => JSON.stringify({ version: 2, sections: [] }) };

    expect(loadSidebarTaskSections(malformed)).toEqual({
      version: 1,
      sections: [],
      assignments: {},
    });
    expect(loadSidebarTaskSections(unsupported)).toEqual({
      version: 1,
      sections: [],
      assignments: {},
    });
  });

  test("creates, assigns, folds, renames, persists, and deletes without deleting Tasks", () => {
    let state = loadSidebarTaskSections(null);
    state = createSidebarTaskSection(state, "  Work  ", "work", "task-1");
    state = assignTaskSection(state, "task-2", "work");
    state = setSidebarTaskSectionCollapsed(state, "work", true);
    state = renameSidebarTaskSection(state, "work", "Deep work");

    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    saveSidebarTaskSections(storage, state);

    expect(values.has(SIDEBAR_SECTIONS_STORAGE_KEY)).toBe(true);
    expect(loadSidebarTaskSections(storage)).toEqual({
      version: 1,
      sections: [{ id: "work", name: "Deep work", collapsed: true }],
      assignments: { "task-1": "work", "task-2": "work" },
    });

    const deleted = deleteSidebarTaskSection(state, "work");
    expect(deleted.sections).toEqual([]);
    expect(deleted.assignments).toEqual({});
  });

  test("deduplicates names and ignores assignments to missing Sections", () => {
    let state = createSidebarTaskSection(loadSidebarTaskSections(null), "Work", "work");
    state = createSidebarTaskSection(state, "work", "duplicate", "task-1");
    expect(state.sections).toHaveLength(1);
    expect(state.assignments).toEqual({ "task-1": "work" });
    expect(assignTaskSection(state, "task-2", "missing")).toBe(state);
  });
});
