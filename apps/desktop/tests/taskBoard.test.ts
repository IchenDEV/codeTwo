import { describe, expect, test } from "bun:test";

import {
  corruptBoardWarning,
  defaultTasks,
  loadBoardWarning,
  PRIORITIES,
  saveBoardWarning,
  taskboardSnapshotVersion,
  taskboardStorageKey,
  taskPriorities,
  taskBoardLanes,
  taskStatuses,
  associateTaskPullRequest,
  associateTaskSession,
  boardLabels,
  boardReducer,
  countTasksByStatus,
  createBoardTask,
  createInitialTaskBoardState,
  filterBoardTasks,
  loadBoardSnapshot,
  githubPullRequestIdentity,
  parseBoardSnapshot,
  saveBoardSnapshot,
  seedTasks,
  sortBoardTasks,
  taskBoardLane,
  taskForPullRequest,
  taskForSession,
  unlinkTaskPullRequest,
} from "../src/taskboard/taskBoard";
import type {
  BoardFilters,
  BoardTask,
  GitHubPullRequestReference,
  StorageLike,
  TaskBoardState,
  TaskPriority,
  TaskStatus,
} from "../src/taskboard/taskBoard";

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const baseTime = Date.UTC(2026, 7, 13, 10);

function task(
  id: string,
  status: TaskStatus = "todo",
  order = 0,
  overrides: Partial<BoardTask> = {}
): BoardTask {
  return {
    id,
    title: `Task ${id}`,
    description: `Description ${id}`,
    status,
    priority: "none",
    labels: [],
    order,
    createdAt: baseTime,
    updatedAt: baseTime,
    sessionIds: [],
    pullRequest: null,
    pullRequestLinkRevision: 0,
    ...overrides,
  };
}

function pullRequest(
  number = 7,
  repository = "acme/repo"
): GitHubPullRequestReference {
  return {
    provider: "github",
    host: "github.com",
    repository,
    number,
    url: `https://github.com/${repository}/pull/${number}`,
  };
}

function state(
  tasks: BoardTask[],
  warning: string | null = null
): TaskBoardState {
  return { tasks, warning };
}

function idsForStatus(board: TaskBoardState, status: TaskStatus): string[] {
  return sortBoardTasks(board.tasks)
    .filter((item) => item.status === status)
    .map((item) => item.id);
}

describe("task board model constants and creation", () => {
  test("exposes the complete status and priority wire values", () => {
    expect(taskStatuses).toEqual(["todo", "in_progress", "in_review", "done"]);
    expect(taskBoardLanes).toEqual(["queue", "running", "needs_you", "done"]);
    expect(taskPriorities).toEqual(["none", "low", "medium", "high", "urgent"]);
    expect(PRIORITIES).toBe(taskPriorities);
    expect(taskboardStorageKey).toBe("codetwo.taskboard.v1");
  });

  test("returns deterministic, realistic Chinese seed tasks as fresh objects", () => {
    const first = seedTasks();
    const second = seedTasks();

    expect(first).toEqual(second);
    expect(first).toEqual(defaultTasks);
    expect(first).not.toBe(second);
    expect(first[0]).not.toBe(second[0]);
    expect(first[0]?.labels).not.toBe(second[0]?.labels);
    expect(first.some((item) => /[\u3400-\u9fff]/u.test(item.title))).toBe(
      true
    );
    expect(new Set(first.map((item) => item.status))).toEqual(
      new Set(taskStatuses)
    );
    expect(first).toHaveLength(9);
    expect(countTasksByStatus(first)).toEqual({
      todo: 3,
      in_progress: 2,
      in_review: 2,
      done: 2,
    });
    expect(first.every((item) => item.sessionIds.length === 0)).toBe(true);

    first[0]!.title = "mutated";
    first[0]!.labels.push("mutated");
    expect(seedTasks()).toEqual(second);
  });

  test("creates a complete normalized task with injectable identity and time", () => {
    const created = createBoardTask(
      {
        title: "  修复筛选交互  ",
        description: "  保留任务顺序  ",
        status: "in_progress",
        priority: "high",
        labels: [" 前端 ", "", "前端", "体验"],
        sessionIds: [" session-7 ", "session-7", " session-8 "],
      },
      { id: " task-7 ", now: baseTime }
    );

    expect(created).toEqual({
      id: "task-7",
      title: "修复筛选交互",
      description: "保留任务顺序",
      status: "in_progress",
      priority: "high",
      labels: ["前端", "体验"],
      order: 0,
      createdAt: baseTime,
      updatedAt: baseTime,
      sessionIds: ["session-7", "session-8"],
      pullRequest: null,
      pullRequestLinkRevision: 0,
    });
  });

  test("adds durable sessions to a task history and starts todo work", () => {
    const tasks = [
      task("tracked", "todo", 0, { sessionIds: ["session-1"] }),
      task("previous-owner", "in_progress", 0, { sessionIds: ["session-2"] }),
    ];
    const associated = associateTaskSession(
      tasks,
      "tracked",
      "session-2",
      baseTime + 1
    );

    expect(associated?.[0]).toMatchObject({
      status: "in_progress",
      updatedAt: baseTime + 1,
      sessionIds: ["session-1", "session-2"],
    });
    expect(taskForSession(associated ?? [], "session-2")?.id).toBe("tracked");
    expect(associated?.[1]?.sessionIds).toEqual([]);
    expect(associateTaskSession(tasks, "missing", "session-2")).toBeNull();
    expect(tasks[0]?.sessionIds).toEqual(["session-1"]);
  });

  test("links one pull request to one task and rejects stale unlink actions", () => {
    const reference = pullRequest();
    const tasks = [
      task("target"),
      task("previous", "in_review", 0, {
        pullRequest: reference,
        pullRequestLinkRevision: 3,
      }),
    ];
    const linked = associateTaskPullRequest(
      tasks,
      "target",
      reference,
      baseTime + 1
    )!;

    expect(taskForPullRequest(linked, reference)?.id).toBe("target");
    expect(linked[0]).toMatchObject({
      status: "todo",
      pullRequest: reference,
      pullRequestLinkRevision: 1,
    });
    expect(linked[1]).toMatchObject({
      pullRequest: null,
      pullRequestLinkRevision: 4,
    });
    expect(
      unlinkTaskPullRequest(
        linked,
        "target",
        githubPullRequestIdentity(reference),
        0
      )
    ).toBeNull();
    const unlinked = unlinkTaskPullRequest(
      linked,
      "target",
      githubPullRequestIdentity(reference),
      1,
      baseTime + 2
    );
    expect(unlinked?.[0]).toMatchObject({
      pullRequest: null,
      pullRequestLinkRevision: 2,
      updatedAt: baseTime + 2,
    });
    expect(tasks[0]?.pullRequest).toBeNull();
  });
});

describe("task board projection helpers", () => {
  const tasks: BoardTask[] = [
    task("third", "todo", 2, {
      title: "Publish API reference",
      description: "Examples for external users",
      priority: "medium",
      labels: ["Docs", "Public"],
    }),
    task("review", "in_review", 0, {
      title: "检查发布清单",
      description: "Review accessibility",
      priority: "high",
      labels: ["QA"],
      pullRequest: pullRequest(42, "acme/accessibility"),
      pullRequestLinkRevision: 1,
    }),
    task("first", "todo", 0, {
      title: "Design Search",
      description: "Build the command palette",
      priority: "urgent",
      labels: ["UI", "Public"],
    }),
    task("equal-a", "todo", 1, { labels: ["UI"] }),
    task("equal-b", "todo", 1, { labels: ["Backend"] }),
    task("done", "done", 0),
  ];

  test("projects durable task stages with live session activity", () => {
    expect(taskBoardLane(task("queued", "todo"), "running")).toBe("queue");
    expect(taskBoardLane(task("active", "in_progress"), "running")).toBe(
      "running"
    );
    expect(
      taskBoardLane(task("waiting", "in_progress"), "awaiting_input")
    ).toBe("needs_you");
    expect(taskBoardLane(task("failed", "in_progress"), "failed")).toBe(
      "needs_you"
    );
    expect(taskBoardLane(task("paused", "in_progress"), "idle")).toBe("queue");
    expect(taskBoardLane(task("review", "in_review"), "running")).toBe(
      "needs_you"
    );
    expect(taskBoardLane(task("done", "done"), "failed")).toBe("done");
  });

  test("sorts by column and order without mutating, with stable equal-order tasks", () => {
    const original = [...tasks];
    expect(sortBoardTasks(tasks).map((item) => item.id)).toEqual([
      "first",
      "equal-a",
      "equal-b",
      "third",
      "review",
      "done",
    ]);
    expect(tasks).toEqual(original);
  });

  test("searches id, title, description, and labels case-insensitively", () => {
    const filters = (query: string): BoardFilters => {
      return {
        query,
        priorities: [],
        labels: [],
      };
    };
    expect(
      filterBoardTasks(tasks, filters("THIRD")).map((item) => item.id)
    ).toEqual(["third"]);
    expect(
      filterBoardTasks(tasks, filters("design search")).map((item) => item.id)
    ).toEqual(["first"]);
    expect(
      filterBoardTasks(tasks, filters("accessibility")).map((item) => item.id)
    ).toEqual(["review"]);
    expect(
      filterBoardTasks(tasks, filters("backend")).map((item) => item.id)
    ).toEqual(["equal-b"]);
    expect(
      filterBoardTasks(tasks, filters("acme/accessibility #42")).map(
        (item) => item.id
      )
    ).toEqual(["review"]);
  });

  test("combines query and facets while OR-ing values within each facet", () => {
    const filtered = filterBoardTasks(tasks, {
      query: "public",
      priorities: ["urgent", "medium"],
      labels: ["UI", "Docs"],
    });
    expect(filtered.map((item) => item.id)).toEqual(["third", "first"]);

    const noMatches = filterBoardTasks(tasks, {
      query: "public",
      priorities: ["low"],
      labels: [],
    });
    expect(noMatches).toEqual([]);
  });

  test("filtering preserves the caller's ordering", () => {
    expect(
      filterBoardTasks(tasks, {
        query: "",
        priorities: [],
        labels: ["Public"],
      }).map((item) => item.id)
    ).toEqual(["third", "first"]);
  });

  test("collects unique labels in first-seen order and counts every status", () => {
    expect(boardLabels(tasks)).toEqual([
      "Docs",
      "Public",
      "QA",
      "UI",
      "Backend",
    ]);
    expect(countTasksByStatus(tasks)).toEqual({
      todo: 4,
      in_progress: 0,
      in_review: 1,
      done: 1,
    });
  });
});

describe("task board persistence", () => {
  test("seeds only when the versioned key is missing", () => {
    const storage = new MemoryStorage();
    const loaded = loadBoardSnapshot(storage);
    expect(loaded).toEqual(createInitialTaskBoardState());
    expect(loaded.tasks).not.toBe(defaultTasks);
  });

  test("round-trips a snapshot and preserves an explicitly saved empty board", () => {
    const storage = new MemoryStorage();
    expect(saveBoardSnapshot([], storage)).toEqual({ ok: true });
    expect(JSON.parse(storage.values.get(taskboardStorageKey)!)).toEqual({
      version: taskboardSnapshotVersion,
      tasks: [],
    });
    expect(loadBoardSnapshot(storage)).toEqual({ tasks: [], warning: null });

    const savedTasks = [
      task("saved", "in_progress", 3, {
        labels: ["本地"],
        pullRequest: pullRequest(),
        pullRequestLinkRevision: 2,
      }),
    ];
    expect(
      saveBoardSnapshot(state(savedTasks, "transient warning"), storage)
    ).toEqual({ ok: true });
    expect(loadBoardSnapshot(storage)).toEqual({
      tasks: savedTasks,
      warning: null,
    });
  });

  test("warns and safely restores seeds for invalid JSON, versions, task shapes, and duplicate IDs", () => {
    const malformedTask = task("bad");
    const corruptValues: string[] = [
      "{ definitely not json",
      JSON.stringify({ version: 99, tasks: [] }),
      JSON.stringify({
        version: taskboardSnapshotVersion,
        tasks: [{ ...malformedTask, status: "blocked" }],
      }),
      JSON.stringify({
        version: taskboardSnapshotVersion,
        tasks: [malformedTask, malformedTask],
      }),
      JSON.stringify({
        version: taskboardSnapshotVersion,
        tasks: [
          {
            ...malformedTask,
            pullRequest: { ...pullRequest(), host: "github.example" },
            pullRequestLinkRevision: 1,
          },
        ],
      }),
      JSON.stringify({
        version: taskboardSnapshotVersion,
        tasks: [
          {
            ...malformedTask,
            pullRequest: {
              ...pullRequest(),
              repository: "acme/repo?tab=files",
              url: "https://github.com/acme/repo?tab=files/pull/7",
            },
            pullRequestLinkRevision: 1,
          },
        ],
      }),
    ];

    for (const raw of corruptValues) {
      const loaded = parseBoardSnapshot(raw);
      expect(loaded.warning).toBe(corruptBoardWarning);
      expect(loaded.tasks).toEqual(seedTasks());
    }
  });

  test("normalizes safe persisted strings without mutating an explicit empty label set", () => {
    const rawTask = task(" normalized ", "todo", 0, {
      title: " Normalized title ",
      labels: [" UI ", "UI", ""],
      sessionIds: [" session-1 ", "session-1", " session-2 "],
    });
    const loaded = parseBoardSnapshot(
      JSON.stringify({ version: taskboardSnapshotVersion, tasks: [rawTask] })
    );
    expect(loaded).toEqual({
      warning: null,
      tasks: [
        {
          ...rawTask,
          id: "normalized",
          title: "Normalized title",
          labels: ["UI"],
          sessionIds: ["session-1", "session-2"],
        },
      ],
    });
  });

  test("migrates the v1 single-session shape without losing its association", () => {
    const legacy = task("legacy");
    const { sessionIds: _sessionIds, ...legacyTask } = legacy;
    const loaded = parseBoardSnapshot(
      JSON.stringify({
        version: 1,
        tasks: [{ ...legacyTask, linkedSessionId: " session-old " }],
      })
    );

    expect(loaded.warning).toBeNull();
    expect(loaded.tasks[0]?.sessionIds).toEqual(["session-old"]);
    expect(loaded.tasks[0]?.pullRequest).toBeNull();
    expect(loaded.tasks[0]?.pullRequestLinkRevision).toBe(0);
  });

  test("migrates v2 tasks and repairs duplicate pull request ownership deterministically", () => {
    const v2 = task("v2");
    const {
      pullRequest: _pullRequest,
      pullRequestLinkRevision: _pullRequestLinkRevision,
      ...v2Task
    } = v2;
    const migrated = parseBoardSnapshot(
      JSON.stringify({ version: 2, tasks: [v2Task] })
    );
    expect(migrated.warning).toBeNull();
    expect(migrated.tasks[0]).toMatchObject({
      pullRequest: null,
      pullRequestLinkRevision: 0,
    });

    const reference = pullRequest();
    const repaired = parseBoardSnapshot(
      JSON.stringify({
        version: taskboardSnapshotVersion,
        tasks: [
          task("first-owner", "todo", 0, {
            pullRequest: reference,
            pullRequestLinkRevision: 1,
          }),
          task("duplicate-owner", "todo", 1, {
            pullRequest: reference,
            pullRequestLinkRevision: 4,
          }),
        ],
      })
    );
    expect(repaired.warning).toBeNull();
    expect(repaired.tasks[0]?.pullRequest).toEqual(reference);
    expect(repaired.tasks[1]).toMatchObject({
      pullRequest: null,
      pullRequestLinkRevision: 5,
    });
  });

  test("reports storage read failures with a warning instead of throwing", () => {
    const storage: StorageLike = {
      getItem: () => {
        throw new Error("storage denied");
      },
      setItem: () => undefined,
    };
    const loaded = loadBoardSnapshot(storage);
    expect(loaded.warning).toBe(loadBoardWarning);
    expect(loaded.tasks).toEqual(seedTasks());
  });

  test("reports absent and throwing storage writes without throwing", () => {
    expect(saveBoardSnapshot([], null)).toEqual({
      ok: false,
      warning: saveBoardWarning,
    });
    const storage: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota exceeded");
      },
    };
    expect(() => saveBoardSnapshot([task("unsaved")], storage)).not.toThrow();
    expect(saveBoardSnapshot([task("unsaved")], storage)).toEqual({
      ok: false,
      warning: saveBoardWarning,
    });
  });
});

describe("task board reducer", () => {
  test("creates at the end of a column and rejects duplicate IDs", () => {
    const initial = state([task("a", "todo", 7), task("b", "todo", 20)]);
    const created = task("c", "todo", -100, { labels: ["new"] });
    const next = boardReducer(initial, { type: "create", task: created });

    expect(idsForStatus(next, "todo")).toEqual(["a", "b", "c"]);
    expect(next.tasks.find((item) => item.id === "c")?.order).toBe(2);
    expect(next.tasks.find((item) => item.id === "c")?.labels).not.toBe(
      created.labels
    );
    expect(boardReducer(next, { type: "create", task: created })).toBe(next);
    expect(initial.tasks.map((item) => item.order)).toEqual([7, 20]);
  });

  test("updates in place and appends status-changing edits to the destination", () => {
    const initial = state([
      task("a", "todo", 0),
      task("b", "todo", 1),
      task("review", "in_review", 4),
    ]);
    const renamed = {
      ...initial.tasks[0]!,
      title: "Renamed",
      updatedAt: baseTime + 1,
    };
    const sameColumn = boardReducer(initial, { type: "update", task: renamed });
    expect(sameColumn.tasks.find((item) => item.id === "a")?.title).toBe(
      "Renamed"
    );
    expect(idsForStatus(sameColumn, "todo")).toEqual(["a", "b"]);

    const movedEdit = {
      ...renamed,
      status: "in_review" as const,
      updatedAt: baseTime + 2,
    };
    const next = boardReducer(sameColumn, { type: "update", task: movedEdit });
    expect(idsForStatus(next, "todo")).toEqual(["b"]);
    expect(idsForStatus(next, "in_review")).toEqual(["review", "a"]);
    expect(initial.tasks[0]?.title).toBe("Task a");
  });

  test("deletes only the selected task, reindexes its column, and no-ops unknown IDs", () => {
    const initial = state([
      task("a", "todo", 2),
      task("b", "todo", 8),
      task("done", "done", 9),
    ]);
    const next = boardReducer(initial, { type: "delete", id: "a" });
    expect(next.tasks.map((item) => item.id)).toEqual(["b", "done"]);
    expect(next.tasks.find((item) => item.id === "b")?.order).toBe(0);
    expect(next.tasks.find((item) => item.id === "done")?.order).toBe(9);
    expect(boardReducer(next, { type: "delete", id: "missing" })).toBe(next);
  });

  test("moves to the exact beforeId position within a column", () => {
    const initial = state([
      task("a", "todo", 0),
      task("b", "todo", 1),
      task("c", "todo", 2),
      task("d", "todo", 3),
    ]);
    const next = boardReducer(initial, {
      type: "move",
      id: "d",
      status: "todo",
      beforeId: "b",
    });
    expect(idsForStatus(next, "todo")).toEqual(["a", "d", "b", "c"]);
    expect(sortBoardTasks(next.tasks).map((item) => item.order)).toEqual([
      0, 1, 2, 3,
    ]);
  });

  test("moves across columns before an anchor or appends when beforeId is omitted", () => {
    const initial = state([
      task("a", "todo", 0),
      task("b", "todo", 1),
      task("x", "in_review", 0),
      task("y", "in_review", 1),
    ]);
    const before = boardReducer(initial, {
      type: "move",
      id: "b",
      status: "in_review",
      beforeId: "y",
    });
    expect(idsForStatus(before, "todo")).toEqual(["a"]);
    expect(idsForStatus(before, "in_review")).toEqual(["x", "b", "y"]);

    const appended = boardReducer(before, {
      type: "move",
      id: "a",
      status: "in_review",
    });
    expect(idsForStatus(appended, "todo")).toEqual([]);
    expect(idsForStatus(appended, "in_review")).toEqual(["x", "b", "y", "a"]);
  });

  test("updates only the moved task timestamp when the action supplies a time", () => {
    const initial = state([
      task("a", "todo", 0),
      task("b", "todo", 1),
      task("review", "in_review", 0),
    ]);
    const next = boardReducer(initial, {
      type: "move",
      id: "b",
      status: "in_review",
      beforeId: "review",
      now: baseTime + 5_000,
    });

    expect(next.tasks.find((item) => item.id === "b")?.updatedAt).toBe(
      baseTime + 5_000
    );
    expect(next.tasks.find((item) => item.id === "a")?.updatedAt).toBe(
      baseTime
    );
    expect(next.tasks.find((item) => item.id === "review")?.updatedAt).toBe(
      baseTime
    );
    expect(initial.tasks.find((item) => item.id === "b")?.updatedAt).toBe(
      baseTime
    );
  });

  test("keeps a moved task timestamp valid and monotonic when the clock rolls back", () => {
    const createdAt = baseTime + 10_000;
    const initial = state([
      task("a", "todo", 0, { createdAt, updatedAt: createdAt }),
      task("b", "done", 0),
    ]);

    const next = boardReducer(initial, {
      type: "move",
      id: "a",
      status: "done",
      now: baseTime,
    });

    expect(next.tasks.find((item) => item.id === "a")?.updatedAt).toBe(
      createdAt
    );
  });

  test("uses exact anchors: self, missing, and cross-column beforeIds are no-ops", () => {
    const initial = state([
      task("a", "todo", 0),
      task("b", "todo", 1),
      task("done", "done", 0),
    ]);
    expect(
      boardReducer(initial, {
        type: "move",
        id: "a",
        status: "todo",
        beforeId: "a",
      })
    ).toBe(initial);
    expect(
      boardReducer(initial, {
        type: "move",
        id: "a",
        status: "todo",
        beforeId: "missing",
      })
    ).toBe(initial);
    expect(
      boardReducer(initial, {
        type: "move",
        id: "a",
        status: "todo",
        beforeId: "done",
      })
    ).toBe(initial);
    expect(
      boardReducer(initial, { type: "move", id: "missing", status: "done" })
    ).toBe(initial);
  });

  test("preserves every non-moved task's relative order when dragging a filtered subset", () => {
    const allTasks = [
      task("visible-a", "todo", 0, { priority: "high" }),
      task("hidden-a", "todo", 1, { priority: "low" }),
      task("visible-b", "todo", 2, { priority: "high" }),
      task("hidden-b", "todo", 3, { priority: "low" }),
      task("visible-c", "todo", 4, { priority: "high" }),
    ];
    const visible = filterBoardTasks(sortBoardTasks(allTasks), {
      query: "",
      priorities: ["high"],
      labels: [],
    });
    expect(visible.map((item) => item.id)).toEqual([
      "visible-a",
      "visible-b",
      "visible-c",
    ]);

    const next = boardReducer(state(allTasks), {
      type: "move",
      id: "visible-c",
      status: "todo",
      beforeId: "visible-a",
    });
    expect(idsForStatus(next, "todo")).toEqual([
      "visible-c",
      "visible-a",
      "hidden-a",
      "visible-b",
      "hidden-b",
    ]);
    expect(
      idsForStatus(next, "todo").filter((id) => id.startsWith("hidden"))
    ).toEqual(["hidden-a", "hidden-b"]);
  });

  test("hydrates a defensive copy and applies or clears the warning", () => {
    const hydratedTasks = [task("loaded", "done", 8, { labels: ["saved"] })];
    const next = boardReducer(createInitialTaskBoardState(), {
      type: "hydrate",
      tasks: hydratedTasks,
      warning: "read warning",
    });
    expect(next).toEqual({ tasks: hydratedTasks, warning: "read warning" });
    expect(next.tasks).not.toBe(hydratedTasks);
    expect(next.tasks[0]?.labels).not.toBe(hydratedTasks[0]?.labels);

    expect(boardReducer(next, { type: "hydrate", tasks: [] })).toEqual({
      tasks: [],
      warning: null,
    });
  });

  test("keeps warning state and does not mutate inputs across ordinary actions", () => {
    const priorities: TaskPriority[] = ["high"];
    const initialTask = task("a", "todo", 0, { priority: priorities[0] });
    const initial = state([initialTask], "storage warning");
    const next = boardReducer(initial, {
      type: "move",
      id: "a",
      status: "done",
    });
    expect(next.warning).toBe("storage warning");
    expect(initialTask).toEqual(task("a", "todo", 0, { priority: "high" }));
  });
});
