import { describe, expect, test } from "bun:test";

import {
  closePane,
  computeDividers,
  computePaneRects,
  focusInDirection,
  focusPane,
  hasPane,
  listPanes,
  MIN_RATIO,
  paneInDirection,
  setSplitRatio,
  singlePaneLayout,
  splitFocused,
  splitForEdge,
  splitPane,
} from "./paneLayout";
import type { PaneLayout, PaneSplit } from "./paneLayout";

const rootSplit = (layout: PaneLayout): PaneSplit => {
  if (layout.root.kind !== "split") {
    throw new Error("expected a split root");
  }
  return layout.root;
};

describe("pane layout model", () => {
  test("a fresh workspace is one focused pane", () => {
    const layout = singlePaneLayout("p1");
    expect(layout.root).toEqual({ kind: "leaf", id: "p1" });
    expect(layout.focused).toBe("p1");
    expect(listPanes(layout.root)).toEqual(["p1"]);
  });

  test("splitting right puts the new pane after and focuses it", () => {
    const layout = splitPane(
      singlePaneLayout("p1"),
      "p1",
      "row",
      "after",
      "p2"
    );
    const split = rootSplit(layout);
    expect(split.direction).toBe("row");
    expect(split.a).toEqual({ kind: "leaf", id: "p1" });
    expect(split.b).toEqual({ kind: "leaf", id: "p2" });
    expect(layout.focused).toBe("p2");
  });

  test("splitting before puts the new pane first and mirrors the ratio", () => {
    const layout = splitPane(
      singlePaneLayout("p1"),
      "p1",
      "row",
      "before",
      "p2",
      0.3
    );
    const split = rootSplit(layout);
    expect(split.a).toEqual({ kind: "leaf", id: "p2" });
    expect(split.b).toEqual({ kind: "leaf", id: "p1" });
    // before-side split keeps the original pane at 0.3, so the new leaf `a` takes 0.7.
    expect(split.ratio).toBeCloseTo(0.7);
  });

  test("edge mapping matches tmux-style directions", () => {
    expect(splitForEdge("right")).toEqual({ direction: "row", side: "after" });
    expect(splitForEdge("left")).toEqual({ direction: "row", side: "before" });
    expect(splitForEdge("bottom")).toEqual({ direction: "col", side: "after" });
    expect(splitForEdge("top")).toEqual({ direction: "col", side: "before" });
  });

  test("splitFocused targets whichever pane currently holds focus", () => {
    let layout = splitPane(singlePaneLayout("p1"), "p1", "row", "after", "p2");
    expect(layout.focused).toBe("p2");
    layout = splitFocused(layout, "bottom", "p3");
    // p2 was focused, so it becomes a vertical split with p3 below it.
    expect(hasPane(layout.root, "p3")).toBe(true);
    expect(listPanes(layout.root)).toEqual(["p1", "p2", "p3"]);
    expect(layout.focused).toBe("p3");
  });

  test("splitting an unknown target is a no-op", () => {
    const layout = singlePaneLayout("p1");
    expect(splitPane(layout, "nope", "row", "after", "p2")).toBe(layout);
  });

  test("closing a pane collapses its parent into the sibling", () => {
    const layout = splitPane(
      singlePaneLayout("p1"),
      "p1",
      "row",
      "after",
      "p2"
    );
    const closed = closePane(layout, "p2");
    expect(closed).not.toBeNull();
    expect(closed!.root).toEqual({ kind: "leaf", id: "p1" });
    expect(closed!.focused).toBe("p1");
  });

  test("closing the focused pane moves focus into the survivor", () => {
    let layout = splitPane(singlePaneLayout("p1"), "p1", "row", "after", "p2");
    layout = splitFocused(layout, "right", "p3"); // p2 -> [p2 | p3], focus p3
    const closed = closePane(layout, "p3");
    expect(closed).not.toBeNull();
    expect(listPanes(closed!.root)).toEqual(["p1", "p2"]);
    expect(hasPane(closed!.root, closed!.focused)).toBe(true);
  });

  test("closing the last pane yields an empty workspace", () => {
    expect(closePane(singlePaneLayout("p1"), "p1")).toBeNull();
  });

  test("closing an absent pane is a no-op", () => {
    const layout = singlePaneLayout("p1");
    expect(closePane(layout, "ghost")).toBe(layout);
  });

  test("focusPane ignores unknown ids and no-op self-focus", () => {
    const layout = splitPane(
      singlePaneLayout("p1"),
      "p1",
      "row",
      "after",
      "p2"
    );
    expect(focusPane(layout, "ghost")).toBe(layout);
    expect(focusPane(layout, "p2")).toBe(layout);
    expect(focusPane(layout, "p1").focused).toBe("p1");
  });

  test("split ratios clamp so no pane collapses to nothing", () => {
    const layout = splitPane(
      singlePaneLayout("p1"),
      "p1",
      "row",
      "after",
      "p2"
    );
    const splitId = rootSplit(layout).id;
    const tiny = setSplitRatio(layout, splitId, 0.001);
    expect(rootSplit(tiny).ratio).toBeCloseTo(MIN_RATIO);
    const huge = setSplitRatio(layout, splitId, 0.999);
    expect(rootSplit(huge).ratio).toBeCloseTo(1 - MIN_RATIO);
  });

  test("computePaneRects tiles the unit square by direction and ratio", () => {
    // [ p1 | (p2 / p3) ] with the right column split in half vertically.
    let layout = splitPane(
      singlePaneLayout("p1"),
      "p1",
      "row",
      "after",
      "p2",
      0.5
    );
    layout = splitPane(layout, "p2", "col", "after", "p3", 0.5);
    const rects = computePaneRects(layout.root);
    expect(rects.get("p1")).toEqual({ x: 0, y: 0, w: 0.5, h: 1 });
    expect(rects.get("p2")).toEqual({ x: 0.5, y: 0, w: 0.5, h: 0.5 });
    expect(rects.get("p3")).toEqual({ x: 0.5, y: 0.5, w: 0.5, h: 0.5 });
  });

  test("computeDividers emits one boundary per split with its rect and ratio", () => {
    // [ p1 | (p2 / p3) ]: an outer row split and an inner col split on the right column.
    let layout = splitPane(
      singlePaneLayout("p1"),
      "p1",
      "row",
      "after",
      "p2",
      0.5
    );
    layout = splitPane(layout, "p2", "col", "after", "p3", 0.5);
    const dividers = computeDividers(layout.root);
    expect(dividers).toHaveLength(2);

    const outer = dividers.find((d) => d.direction === "row");
    expect(outer?.rect).toEqual({ x: 0, y: 0, w: 1, h: 1 });
    expect(outer?.ratio).toBeCloseTo(0.5);

    const inner = dividers.find((d) => d.direction === "col");
    // The inner split lives inside the right half of the workspace.
    expect(inner?.rect).toEqual({ x: 0.5, y: 0, w: 0.5, h: 1 });
    expect(inner?.ratio).toBeCloseTo(0.5);
  });

  test("a single pane has no dividers", () => {
    expect(computeDividers(singlePaneLayout("p1").root)).toEqual([]);
  });

  test("spatial focus finds the neighbor on the requested side", () => {
    // Layout: [ p1 | (p2 top / p3 bottom) ]
    let layout = splitPane(
      singlePaneLayout("p1"),
      "p1",
      "row",
      "after",
      "p2",
      0.5
    );
    layout = splitPane(layout, "p2", "col", "after", "p3", 0.5);

    layout = focusPane(layout, "p1");
    // p1 spans the full height, so moving right can reach either right pane; assert it lands
    // somewhere on the right column rather than pinning the tie-break.
    const rightOfP1 = paneInDirection(layout, "right");
    expect(rightOfP1 !== null && ["p2", "p3"].includes(rightOfP1)).toBe(true);
    expect(paneInDirection(layout, "left")).toBeNull();

    layout = focusPane(layout, "p2");
    expect(paneInDirection(layout, "left")).toBe("p1");
    expect(paneInDirection(layout, "bottom")).toBe("p3");
    expect(paneInDirection(layout, "top")).toBeNull();

    layout = focusPane(layout, "p3");
    expect(paneInDirection(layout, "top")).toBe("p2");
    expect(paneInDirection(layout, "left")).toBe("p1");
  });

  test("focusInDirection moves focus, or leaves it put at an edge", () => {
    let layout = splitPane(
      singlePaneLayout("p1"),
      "p1",
      "row",
      "after",
      "p2",
      0.5
    );
    layout = focusPane(layout, "p1");
    expect(focusInDirection(layout, "right").focused).toBe("p2");
    // No pane to the left of p1: focus is unchanged.
    expect(focusInDirection(layout, "left")).toBe(layout);
  });
});
