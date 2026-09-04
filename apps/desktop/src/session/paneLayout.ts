/**
 * Tiling layout model for the multi-agent workspace (tmux-style recursive splits).
 *
 * This module is pure geometry and focus bookkeeping: a binary tree of splits and leaves plus the
 * id of the focused leaf. It deliberately knows nothing about sessions, React, or rendering. The
 * host owns the paneId -> content mapping and updates it in step with the reducer's results (a
 * split reports its new paneId; a close leaves the removed id for the host to drop).
 *
 * Axes: a "row" split places `a` and `b` side by side (a left, b right); a "col" split stacks them
 * (a top, b bottom). `ratio` is the fraction of the split's main-axis size given to child `a`.
 */

export type SplitDirection = "row" | "col";

/**
Which side of the target the new pane lands on when splitting.
*/
export type SplitSide = "before" | "after";

/**
A drop target edge on a pane, mapped to a split by {@link splitForEdge}.
*/
export type PaneEdge = "left" | "right" | "top" | "bottom";

export interface PaneLeaf {
  kind: "leaf";
  id: string;
}

export interface PaneSplit {
  kind: "split";
  id: string;
  direction: SplitDirection;
  /**
  Fraction of the split's main-axis extent given to child `a`, clamped to [minRatio, 1-minRatio].
  */
  ratio: number;
  a: PaneNode;
  b: PaneNode;
}

export type PaneNode = PaneLeaf | PaneSplit;

export interface PaneLayout {
  root: PaneNode;
  /**
  Id of the currently focused leaf. Always references a leaf that exists in `root`.
  */
  focused: string;
}

/**
Normalized rectangle in [0,1] space; used for dividers, spatial focus, and drop hit-testing.
*/
export interface PaneRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
Minimum fraction either side of a split may occupy, so a pane can never collapse to nothing.
*/
export const minRatio = 0.1;

const clampRatio = (ratio: number): number =>
  Math.min(1 - minRatio, Math.max(minRatio, ratio));

export function singlePaneLayout(paneId: string): PaneLayout {
  return { focused: paneId, root: { id: paneId, kind: "leaf" } };
}

export function splitForEdge(edge: PaneEdge): {
  direction: SplitDirection;
  side: SplitSide;
} {
  switch (edge) {
    case "left": {
      return { direction: "row", side: "before" };
    }
    case "right": {
      return { direction: "row", side: "after" };
    }
    case "top": {
      return { direction: "col", side: "before" };
    }
    case "bottom": {
      return { direction: "col", side: "after" };
    }
  }
}

export function listPanes(node: PaneNode, out: string[] = []): string[] {
  if (node.kind === "leaf") {
    out.push(node.id);
    return out;
  }
  listPanes(node.a, out);
  listPanes(node.b, out);
  return out;
}

export function hasPane(node: PaneNode, paneId: string): boolean {
  if (node.kind === "leaf") {
    return node.id === paneId;
  }
  return hasPane(node.a, paneId) || hasPane(node.b, paneId);
}

export function firstLeaf(node: PaneNode): string {
  return node.kind === "leaf" ? node.id : firstLeaf(node.a);
}

export function splitPane(
  layout: PaneLayout,
  targetPaneId: string,
  direction: SplitDirection,
  side: SplitSide,
  newPaneId: string,
  ratio = 0.5
): PaneLayout {
  if (!hasPane(layout.root, targetPaneId)) {
    return layout;
  }

  const replace = (node: PaneNode): PaneNode => {
    if (node.kind === "leaf") {
      if (node.id !== targetPaneId) {
        return node;
      }
      const newLeaf: PaneLeaf = { id: newPaneId, kind: "leaf" };
      const existing: PaneNode = node;
      return {
        a: side === "before" ? newLeaf : existing,
        b: side === "before" ? existing : newLeaf,
        direction,
        id: `split:${targetPaneId}:${newPaneId}`,
        kind: "split",
        ratio: clampRatio(side === "before" ? 1 - ratio : ratio),
      };
    }
    return { ...node, a: replace(node.a), b: replace(node.b) };
  };

  return { focused: newPaneId, root: replace(layout.root) };
}

export function splitFocused(
  layout: PaneLayout,
  edge: PaneEdge,
  newPaneId: string,
  ratio = 0.5
): PaneLayout {
  const { direction, side } = splitForEdge(edge);
  return splitPane(layout, layout.focused, direction, side, newPaneId, ratio);
}

interface RemoveResult {
  changed: boolean;
  node: PaneNode | null;
}

function removeLeaf(node: PaneNode, paneId: string): RemoveResult {
  if (node.kind === "leaf") {
    return node.id === paneId
      ? { changed: true, node: null }
      : { changed: false, node };
  }
  const aRes = removeLeaf(node.a, paneId);
  if (aRes.changed) {
    // Removing a whole side collapses the split into its surviving sibling.
    return {
      changed: true,
      node: aRes.node ? { ...node, a: aRes.node } : node.b,
    };
  }
  const bRes = removeLeaf(node.b, paneId);
  if (bRes.changed) {
    return {
      changed: true,
      node: bRes.node ? { ...node, b: bRes.node } : node.a,
    };
  }
  return { changed: false, node };
}

export function closePane(
  layout: PaneLayout,
  paneId: string
): PaneLayout | null {
  const res = removeLeaf(layout.root, paneId);
  if (!res.changed) {
    return layout;
  }
  if (res.node === null) {
    return null;
  }
  const focused =
    layout.focused === paneId || !hasPane(res.node, layout.focused)
      ? firstLeaf(res.node)
      : layout.focused;
  return { focused, root: res.node };
}

export function focusPane(layout: PaneLayout, paneId: string): PaneLayout {
  if (paneId === layout.focused || !hasPane(layout.root, paneId)) {
    return layout;
  }
  return { ...layout, focused: paneId };
}

export function setSplitRatio(
  layout: PaneLayout,
  splitId: string,
  ratio: number
): PaneLayout {
  const apply = (node: PaneNode): PaneNode => {
    if (node.kind === "leaf") {
      return node;
    }
    if (node.id === splitId) {
      return { ...node, ratio: clampRatio(ratio) };
    }
    return { ...node, a: apply(node.a), b: apply(node.b) };
  };
  return { ...layout, root: apply(layout.root) };
}

export function computePaneRects(
  node: PaneNode,
  rect: PaneRect = { h: 1, w: 1, x: 0, y: 0 },
  out = new Map<string, PaneRect>()
): Map<string, PaneRect> {
  if (node.kind === "leaf") {
    out.set(node.id, rect);
    return out;
  }
  if (node.direction === "row") {
    const wA = rect.w * node.ratio;
    computePaneRects(node.a, { h: rect.h, w: wA, x: rect.x, y: rect.y }, out);
    computePaneRects(
      node.b,
      { h: rect.h, w: rect.w - wA, x: rect.x + wA, y: rect.y },
      out
    );
  } else {
    const hA = rect.h * node.ratio;
    computePaneRects(node.a, { h: hA, w: rect.w, x: rect.x, y: rect.y }, out);
    computePaneRects(
      node.b,
      { h: rect.h - hA, w: rect.w, x: rect.x, y: rect.y + hA },
      out
    );
  }
  return out;
}

/**
A resizable boundary between the two children of a split, in normalized [0,1] space.
*/
export interface DividerRect {
  splitId: string;
  direction: SplitDirection;
  ratio: number;
  /**
  The full rectangle the split occupies; the handle sits at `ratio` along its main axis.
  */
  rect: PaneRect;
}

export function computeDividers(
  node: PaneNode,
  rect: PaneRect = { h: 1, w: 1, x: 0, y: 0 },
  out: DividerRect[] = []
): DividerRect[] {
  if (node.kind === "leaf") {
    return out;
  }
  out.push({
    direction: node.direction,
    ratio: node.ratio,
    rect,
    splitId: node.id,
  });
  if (node.direction === "row") {
    const wA = rect.w * node.ratio;
    computeDividers(node.a, { h: rect.h, w: wA, x: rect.x, y: rect.y }, out);
    computeDividers(
      node.b,
      { h: rect.h, w: rect.w - wA, x: rect.x + wA, y: rect.y },
      out
    );
  } else {
    const hA = rect.h * node.ratio;
    computeDividers(node.a, { h: hA, w: rect.w, x: rect.x, y: rect.y }, out);
    computeDividers(
      node.b,
      { h: rect.h - hA, w: rect.w, x: rect.x, y: rect.y + hA },
      out
    );
  }
  return out;
}

const isRangesOverlap = (
  aStart: number,
  aLength: number,
  bStart: number,
  bLength: number
): boolean => aStart < bStart + bLength && bStart < aStart + aLength;

export function paneInDirection(
  layout: PaneLayout,
  direction: PaneEdge
): string | null {
  const rects = computePaneRects(layout.root);
  const from = rects.get(layout.focused);
  if (!from) {
    return null;
  }
  const fromCx = from.x + from.w / 2;
  const fromCy = from.y + from.h / 2;

  let best: { id: string; dist: number } | null = null;
  for (const [id, r] of rects) {
    if (id === layout.focused) {
      continue;
    }
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    let isInDirectory: boolean;
    let isPerp: boolean;
    let distribution: number;
    switch (direction) {
      case "left": {
        isInDirectory = cx < fromCx - 1e-6;
        isPerp = isRangesOverlap(from.y, from.h, r.y, r.h);
        distribution = fromCx - cx;
        break;
      }
      case "right": {
        isInDirectory = cx > fromCx + 1e-6;
        isPerp = isRangesOverlap(from.y, from.h, r.y, r.h);
        distribution = cx - fromCx;
        break;
      }
      case "top": {
        isInDirectory = cy < fromCy - 1e-6;
        isPerp = isRangesOverlap(from.x, from.w, r.x, r.w);
        distribution = fromCy - cy;
        break;
      }
      case "bottom": {
        isInDirectory = cy > fromCy + 1e-6;
        isPerp = isRangesOverlap(from.x, from.w, r.x, r.w);
        distribution = cy - fromCy;
        break;
      }
    }
    if (!isInDirectory || !isPerp) {
      continue;
    }
    if (!best || distribution < best.dist) {
      best = { dist: distribution, id };
    }
  }
  return best ? best.id : null;
}

export function focusInDirection(
  layout: PaneLayout,
  direction: PaneEdge
): PaneLayout {
  const target = paneInDirection(layout, direction);
  return target != null && target !== ""
    ? { ...layout, focused: target }
    : layout;
}
