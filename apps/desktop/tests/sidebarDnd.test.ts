import { describe, expect, test } from "bun:test";

import {
  sidebarBeforeIdAtFinalIndex,
  sidebarFinalizedDestination,
  sidebarProjectSectionFromGroup,
  sidebarRememberedDragTarget,
  sidebarTaskContainerCollisionPriority,
  sidebarTaskLocationFromGroup,
} from "../src/sidebar/sidebarDnd";

describe("sidebar dnd destination mapping", () => {
  test("uses the finalized sortable index when moving down or up", () => {
    const ids = ["a", "b", "c"];

    expect(sidebarBeforeIdAtFinalIndex(ids, "a", 2)).toBeNull();
    expect(sidebarBeforeIdAtFinalIndex(ids, "c", 0)).toBe("a");
    expect(sidebarBeforeIdAtFinalIndex(ids, "b", 1)).toBe("c");
  });

  test("decodes Project and Task destination groups without losing paths or Section ids", () => {
    expect(sidebarProjectSectionFromGroup("sidebar-projects:")).toBeNull();
    expect(
      sidebarProjectSectionFromGroup("sidebar-projects:work%3Aurgent")
    ).toBe("work:urgent");
    expect(
      sidebarTaskLocationFromGroup(
        "sidebar-tasks:work%3Aurgent:%2Ftmp%2Frepo%3Afeature"
      )
    ).toEqual({
      kind: "tasks",
      sectionId: "work:urgent",
      projectPath: "/tmp/repo:feature",
    });
  });

  test("maps finalized Section, Project, and Task destinations from dnd-kit", () => {
    const snapshot = (group: string, index: number) => ({
      group,
      initialGroup: "old-group",
      index,
      initialIndex: 0,
    });

    expect(
      sidebarFinalizedDestination(
        { kind: "section", id: "work" },
        snapshot("sidebar-sections", 2)
      )
    ).toEqual({ kind: "sections", index: 2 });
    expect(
      sidebarFinalizedDestination(
        { kind: "project", id: "/tmp/repo" },
        snapshot("sidebar-projects:work%3Aurgent", 1)
      )
    ).toEqual({ kind: "projects", sectionId: "work:urgent", index: 1 });
    expect(
      sidebarFinalizedDestination(
        { kind: "task", id: "task-1" },
        snapshot("sidebar-tasks::%2Ftmp%2Frepo", 3)
      )
    ).toEqual({
      kind: "tasks",
      sectionId: null,
      projectPath: "/tmp/repo",
      index: 3,
    });
  });

  test("keeps nonempty Task containers below nested Task rows", () => {
    expect(sidebarTaskContainerCollisionPriority(true)).toBeLessThan(2);
    expect(sidebarTaskContainerCollisionPriority(false)).toBeGreaterThan(2);
  });

  test("forgets the last destination after leaving or entering an incompatible target", () => {
    const source = { kind: "task", id: "task-1" } as const;
    const previous = {
      item: { kind: "task", id: "task-2" } as const,
      location: {
        kind: "tasks",
        sectionId: null,
        projectPath: "/tmp/repo",
      } as const,
    };

    expect(sidebarRememberedDragTarget(source, null, previous)).toBeNull();
    expect(
      sidebarRememberedDragTarget(
        source,
        {
          item: { kind: "project", id: "/tmp/other" },
          location: { kind: "projects", sectionId: null },
        },
        previous
      )
    ).toBeNull();
  });
});
