import { sanitizeElements } from "./serialize";
import { exportToCanvas } from "./excalidrawAdapter";
import {
  DEFAULT_EXPORT_BUDGET,
  CanvasExportBudgetError,
  planCanvasExportTiles,
} from "./exportPlan";
import type {
  CanvasExportBounds,
  CanvasExportBudget,
  CanvasExportTile,
} from "./exportPlan";
import type {
  AppState,
  BinaryFiles,
  ExcalidrawElement,
} from "./excalidrawAdapter";

export {
  DEFAULT_EXPORT_BUDGET,
  CanvasExportBudgetError,
  planCanvasExportTiles,
} from "./exportPlan";
export type {
  CanvasExportBounds,
  CanvasExportBudget,
  CanvasExportTile,
} from "./exportPlan";

function elementBounds(element: ExcalidrawElement): CanvasExportBounds {
  if (
    (element.type === "line" ||
      element.type === "arrow" ||
      element.type === "freedraw") &&
    element.points.length > 0
  ) {
    const points = element.points.map(([x, y]) => [
										      element.x + x,
										      element.y + y,
										    ]);
    const xs = points.map(([x]) => x);
    const ys = points.map(([, y]) => y);
    return {
      minX: Math.min(...xs),
      minY: Math.min(...ys),
      maxX: Math.max(...xs),
      maxY: Math.max(...ys),
    };
  }
  return {
    minX: element.x,
    minY: element.y,
    maxX: element.x + element.width,
    maxY: element.y + element.height,
  };
}

export function getCanvasExportBounds(
  elements: readonly unknown[],
  margin = DEFAULT_EXPORT_BUDGET.margin
): CanvasExportBounds | null {
  const visible = sanitizeElements(elements).filter(
    (element) => !element.isDeleted && element.opacity > 0
  );
  if (visible.length === 0) {
    return null;
  }
  const bounds = visible.map(elementBounds);
  return {
    minX: Math.min(...bounds.map((entry) => entry.minX)) - margin,
    minY: Math.min(...bounds.map((entry) => entry.minY)) - margin,
    maxX: Math.max(...bounds.map((entry) => entry.maxX)) + margin,
    maxY: Math.max(...bounds.map((entry) => entry.maxY)) + margin,
  };
}

async function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return await new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob
          ? resolve(blob)
          : reject(
              new CanvasExportBudgetError(
                "canvas-unavailable",
                "Canvas could not produce a PNG"
              )
            ),
      "image/png"
    );
  });
}

function makeCanvas(width: number, height: number): HTMLCanvasElement {
  if (typeof document === "undefined") {
    throw new CanvasExportBudgetError(
      "canvas-unavailable",
      "PNG export requires a browser canvas"
    );
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export interface CanvasPngExport {
  kind: CanvasExportTile["kind"];
  row: number;
  column: number;
  blob: Blob;
}

/**
 * Renders a transparent, cropped PNG overview and deterministic detail tiles. The dot grid is a
 * UI-only Excalidraw concern and is never painted by this export path.
 */
export async function exportCanvasPng(
  elementsInput: readonly unknown[],
  appState: AppState,
  files: BinaryFiles,
  budget: Partial<CanvasExportBudget> = {}
): Promise<readonly CanvasPngExport[]> {
  const limits = { ...DEFAULT_EXPORT_BUDGET, ...budget };
  const elements = sanitizeElements(elementsInput);
  const bounds = getCanvasExportBounds(elements, 0);
  if (!bounds) {
    throw new CanvasExportBudgetError(
      "empty-scene",
      "Cannot export an empty canvas"
    );
  }
  const rendered = await exportToCanvas({
    elements: elements as ExcalidrawElement[],
    // Grid dots are authoring-only chrome. Explicitly disable the engine grid for every export,
    // even when the live editor is in grid mode, so no UI pixels enter persisted PNGs.
    appState: {
      ...appState,
      viewBackgroundColor: "transparent",
      gridModeEnabled: false,
      gridSize: 0,
    },
    files,
    // The engine applies this exact margin around its crop. The tile plan is
    // derived from the resulting canvas dimensions below, so negative/positive
    // scene coordinates cannot drift from tile source rectangles.
    exportPadding: limits.margin,
  });
  const tiles = planCanvasExportTiles(
    { minX: 0, minY: 0, maxX: rendered.width, maxY: rendered.height },
    { ...limits, margin: 0 }
  );
  const source = makeCanvas(rendered.width, rendered.height);
  const sourceContext = source.getContext("2d");
  if (!sourceContext) {
    throw new CanvasExportBudgetError(
      "canvas-unavailable",
      "Canvas 2D context is unavailable"
    );
  }
  sourceContext.drawImage(rendered, 0, 0);
  const results: CanvasPngExport[] = [];
  let totalBytes = 0;
  for (const tile of tiles) {
    const target = makeCanvas(tile.width, tile.height);
    const context = target.getContext("2d");
    if (!context) {
      throw new CanvasExportBudgetError(
        "canvas-unavailable",
        "Canvas 2D context is unavailable"
      );
    }
    if (tile.kind === "overview") {
      context.drawImage(
        source,
        0,
        0,
        source.width,
        source.height,
        0,
        0,
        tile.width,
        tile.height
      );
    } else {
      context.drawImage(
        source,
        tile.sourceX,
        tile.sourceY,
        tile.sourceWidth,
        tile.sourceHeight,
        0,
        0,
        tile.width,
        tile.height
      );
    }
    const blob = await canvasBlob(target);
    totalBytes += blob.size;
    if (totalBytes > limits.maxBytes) {
      throw new CanvasExportBudgetError(
        "byte-budget",
        `Canvas export produced ${totalBytes} bytes; limit is ${limits.maxBytes}`
      );
    }
    results.push({ kind: tile.kind, row: tile.row, column: tile.column, blob });
  }
  return results;
}
