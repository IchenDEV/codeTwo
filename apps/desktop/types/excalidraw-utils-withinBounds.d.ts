/**
 * Shim for `@excalidraw/utils/withinBounds` (unpublished peer of Excalidraw 0.18 types).
 */
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

export declare function elementsOverlappingBBox(
  elements: readonly ExcalidrawElement[],
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  },
  type?: "overlap" | "contain" | "inside"
): ExcalidrawElement[];

export declare function isElementInsideBBox(
  element: ExcalidrawElement,
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  },
  requireAllPoints?: boolean
): boolean;

export declare function elementPartiallyOverlapsWithOrContainsBBox(
  element: ExcalidrawElement,
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  }
): boolean;
