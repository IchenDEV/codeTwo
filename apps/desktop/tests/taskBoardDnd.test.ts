// @ts-nocheck
import { describe, expect, test } from "bun:test";

import { activateDom, dom } from "./domTestHarness";

activateDom();

const {
  boardDragData,
  boardDropAfter,
  boardDropAfterKeyboard,
  boardDropPreview,
  boardDropTarget,
  isTaskBoardLane,
} = await import("../src/taskboard/boardDnd");
const { boardPanBlocked } = await import("../src/taskboard/useBoardDragPan");

function projected(id, status, lane) {
  return {
    task: {
      id,
      number: 0,
      title: id,
      description: "",
      status,
      priority: "none",
      labels: [],
      order: 0,
      createdAt: 0,
      updatedAt: 0,
      sessionIds: [],
      pullRequest: null,
      pullRequestLinkRevision: 0,
    },
    lane,
    sessions: [],
  };
}

describe("board drag data", () => {
  test("recognizes exactly the four lanes", () => {
    expect(isTaskBoardLane("queue")).toBe(true);
    expect(isTaskBoardLane("running")).toBe(true);
    expect(isTaskBoardLane("needs_you")).toBe(true);
    expect(isTaskBoardLane("done")).toBe(true);
    expect(isTaskBoardLane("todo")).toBe(false);
    expect(isTaskBoardLane(1)).toBe(false);
    expect(isTaskBoardLane(null)).toBe(false);
  });

  test("reads lane zones and card payloads, rejecting foreign data", () => {
    expect(boardDragData({ lane: "running" })).toEqual({
      lane: "running",
      taskId: undefined,
    });
    expect(boardDragData({ lane: "done", taskId: "t1" })).toEqual({
      lane: "done",
      taskId: "t1",
    });
    expect(boardDragData({ lane: "backlog", taskId: "t1" })).toBeNull();
    expect(boardDragData({ taskId: "t1" })).toBeNull();
    expect(boardDragData(null)).toBeNull();
    expect(boardDragData("running")).toBeNull();
  });
});

describe("board drop targets", () => {
  const runningLane = [
    projected("a", "in_progress", "running"),
    projected("b", "in_progress", "running"),
    projected("c", "in_progress", "running"),
  ];

  test("reorders within a lane at the exact anchor", () => {
    expect(boardDropTarget(runningLane, "c", "running", 0)).toEqual({
      status: "in_progress",
      beforeId: "a",
    });
    expect(boardDropTarget(runningLane, "a", "running", 1)).toEqual({
      status: "in_progress",
      beforeId: "c",
    });
    expect(boardDropTarget(runningLane, "a", "running", 2)).toEqual({
      status: "in_progress",
    });
  });

  test("clamps indexes and appends past the end", () => {
    expect(boardDropTarget(runningLane, "c", "running", -5)).toEqual({
      status: "in_progress",
      beforeId: "a",
    });
    expect(boardDropTarget(runningLane, "a", "running", 99)).toEqual({
      status: "in_progress",
    });
  });

  test("maps cross-lane drops to the lane's durable status", () => {
    expect(boardDropTarget(runningLane, "new", "running", 1)).toEqual({
      status: "in_progress",
      beforeId: "b",
    });
    expect(boardDropTarget([], "new", "queue", 0)).toEqual({ status: "todo" });
    expect(boardDropTarget([], "new", "done", 0)).toEqual({ status: "done" });
  });

  test("skips attention cards that share a mixed needs_you lane", () => {
    const needsYou = [
      projected("attention", "in_progress", "needs_you"),
      projected("review", "in_review", "needs_you"),
    ];
    expect(boardDropTarget(needsYou, "new", "needs_you", 0)).toEqual({
      status: "in_review",
      beforeId: "review",
    });
    expect(boardDropTarget(needsYou, "new", "needs_you", 1)).toEqual({
      status: "in_review",
      beforeId: "review",
    });
    expect(boardDropTarget(needsYou, "new", "needs_you", 2)).toEqual({
      status: "in_review",
    });
  });
});

describe("board drop previews", () => {
  const laneTasks = [
    projected("first", "todo", "queue"),
    projected("second", "todo", "queue"),
    projected("third", "todo", "queue"),
  ];

  test("anchors before or after the hovered card", () => {
    expect(
      boardDropPreview(laneTasks, "third", "queue", "first", false)
    ).toEqual({
      status: "todo",
      beforeId: "first",
      edge: { taskId: "first", after: false },
    });
    expect(
      boardDropPreview(laneTasks, "third", "queue", "first", true)
    ).toEqual({
      status: "todo",
      beforeId: "second",
      edge: { taskId: "first", after: true },
    });
    expect(
      boardDropPreview(laneTasks, "third", "queue", "second", true)
    ).toEqual({ status: "todo", edge: { taskId: "second", after: true } });
  });

  test("appends on lane background with no edge indicator", () => {
    expect(boardDropPreview(laneTasks, "first", "queue", null, false)).toEqual({
      status: "todo",
      edge: null,
    });
    expect(
      boardDropPreview(laneTasks, "first", "queue", "missing", false)
    ).toEqual({ status: "todo", edge: null });
  });

  test("keeps the current position when the hovered card is the dragged card", () => {
    expect(
      boardDropPreview(laneTasks, "second", "queue", "second", true)
    ).toEqual({ status: "todo", beforeId: "third", edge: null });
    expect(
      boardDropPreview(laneTasks, "third", "queue", "third", false)
    ).toEqual({ status: "todo", edge: null });
  });

  test("maps a hovered card in another lane to that lane's status", () => {
    const running = [
      projected("r1", "in_progress", "running"),
      projected("r2", "in_progress", "running"),
    ];
    expect(boardDropPreview(running, "first", "running", "r2", false)).toEqual({
      status: "in_progress",
      beforeId: "r2",
      edge: { taskId: "r2", after: false },
    });
  });
});

describe("board drop side", () => {
  test("compares the dragged card's center with the hovered card's center", () => {
    const source = dom.document.createElement("div");
    const target = dom.document.createElement("div");
    source.getBoundingClientRect = () => ({ top: 0, height: 100 });
    target.getBoundingClientRect = () => ({ top: 0, height: 100 });
    expect(boardDropAfter(source, target)).toBe(false);
    source.getBoundingClientRect = () => ({ top: 10, height: 100 });
    expect(boardDropAfter(source, target)).toBe(true);
    expect(boardDropAfter(null, target)).toBe(false);
    expect(boardDropAfter(source, null)).toBe(false);
  });

  test("resolves the keyboard side from the arrow history", () => {
    const laneTasks = [
      projected("a", "todo", "queue"),
      projected("b", "todo", "queue"),
      projected("c", "todo", "queue"),
    ];
    expect(boardDropAfterKeyboard(laneTasks, "b", "a")).toBe(true);
    expect(boardDropAfterKeyboard(laneTasks, "b", "c")).toBe(false);
    expect(boardDropAfterKeyboard(laneTasks, "b", "b")).toBe(false);
    expect(boardDropAfterKeyboard(laneTasks, "b", null)).toBe(false);
    expect(boardDropAfterKeyboard(laneTasks, "b", "missing")).toBe(false);
    expect(boardDropAfterKeyboard(laneTasks, "missing", "a")).toBe(false);
  });
});

describe("board pan gesture boundary", () => {
  test("starts only on non-interactive board background", () => {
    const card = dom.document.createElement("article");
    card.setAttribute("data-task-card", "t1");
    const title = dom.document.createElement("span");
    card.append(title);
    const button = dom.document.createElement("button");
    const plain = dom.document.createElement("div");

    expect(boardPanBlocked(title)).toBe(true);
    expect(boardPanBlocked(card)).toBe(true);
    expect(boardPanBlocked(button)).toBe(true);
    expect(boardPanBlocked(plain)).toBe(false);
    expect(boardPanBlocked(null)).toBe(false);
    expect(boardPanBlocked(dom.document.documentElement)).toBe(false);
  });
});
