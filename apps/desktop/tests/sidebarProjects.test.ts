import { describe, expect, test } from "bun:test";

import {
  rootProjectOrderKey,
  sidebarProjectsStorageKey,
  loadSidebarProjects,
  moveSidebarProject,
  releaseSidebarSectionProjects,
  saveSidebarProjects,
  setSidebarProjectCollapsed,
  sortSidebarProjects,
} from "../src/sidebar/sidebarProjects";

describe("sidebar Project organization", () => {
  test("moves Projects into user Sections and persists their order and fold", () => {
    let state = loadSidebarProjects(null);
    state = moveSidebarProject(state, "/two", "work", null, []);
    state = moveSidebarProject(state, "/one", "work", "/two", ["/two"]);
    state = setSidebarProjectCollapsed(state, "/one", true);

    expect(state.assignments).toEqual({ "/one": "work", "/two": "work" });
    expect(state.order.work).toEqual(["/one", "/two"]);
    expect(state.collapsed).toEqual({ "/one": true });

    const values = new Map<string, string>();
    saveSidebarProjects(
      { setItem: (key, value) => values.set(key, value) },
      state
    );
    expect(values.has(sidebarProjectsStorageKey)).toBe(true);
    expect(
      loadSidebarProjects({ getItem: (key) => values.get(key) ?? null })
    ).toEqual(state);
  });

  test("releases Projects in order when their Section is deleted", () => {
    let state = loadSidebarProjects(null);
    state = moveSidebarProject(state, "/root", null, null, []);
    state = moveSidebarProject(state, "/two", "work", null, []);
    state = moveSidebarProject(state, "/one", "work", "/two", ["/two"]);
    state = releaseSidebarSectionProjects(state, "work");

    expect(state.assignments).toEqual({});
    expect(state.order[rootProjectOrderKey]).toEqual(["/root", "/one", "/two"]);
    expect(state.order.work).toBeUndefined();
    expect(
      sortSidebarProjects(
        [
          { path: "/new" },
          { path: "/two" },
          { path: "/root" },
          { path: "/one" },
        ],
        state.order[rootProjectOrderKey]
      ).map((project) => project.path)
    ).toEqual(["/new", "/root", "/one", "/two"]);
  });
});
