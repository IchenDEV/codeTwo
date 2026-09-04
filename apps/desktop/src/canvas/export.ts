import { exportToCanvas } from "./excalidrawAdapter";
import type {
  AppState,
  BinaryFiles,
  ExcalidrawElement,
} from "./excalidrawAdapter";
import {
  defaultExportBudget,
  CanvasExportBudgetError,
  planCanvasExportTiles,
} from "./exportPlan";
import type {
  CanvasExportBounds,
  CanvasExportBudget,
  CanvasExportTile,
} from "./exportPlan";
import { sanitizeElements } from "./serialize";

export {
  defaultExportBudget,
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
    const points: [number, number][] = element.points.map((point) => [
      element.x + Number(point[0]),
      element.y + Number(point[1]),
    ]);
    const xs: number[] = points.map(([x]) => x);
    const ys: number[] = points.map(([, y]) => y);
    return {
      maxX: Math.max(...xs),
      maxY: Math.max(...ys),
      minX: Math.min(...xs),
      minY: Math.min(...ys),
    };
  }
  return {
    maxX: element.x + element.width,
    maxY: element.y + element.height,
    minX: element.x,
    minY: element.y,
  };
}

export function getCanvasExportBounds(
  elements: readonly unknown[],
  margin = defaultExportBudget.margin
): CanvasExportBounds | null {
  const visible = sanitizeElements(elements).filter(
    (element) => !element.isDeleted && element.opacity > 0
  );
  if (visible.length === 0) {
    return null;
  }
  const bounds = visible.map(elementBounds);
  return {
    maxX: Math.max(...bounds.map((entry) => entry.maxX)) + margin,
    maxY: Math.max(...bounds.map((entry) => entry.maxY)) + margin,
    minX: Math.min(...bounds.map((entry) => entry.minX)) - margin,
    minY: Math.min(...bounds.map((entry) => entry.minY)) - margin,
  };
}

async function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return await new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      return blob
        ? resolve(blob)
        : reject(
            new CanvasExportBudgetError(
              "canvas-unavailable",
              "Canvas could not produce a PNG"
            )
          );
    }, "image/png");
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

export async function exportCanvasPng(
  elementsInput: readonly unknown[],
  appState: AppState,
  files: BinaryFiles,
  budget: Partial<CanvasExportBudget> = {}
): Promise<readonly CanvasPngExport[]> {
  const limits = { ...defaultExportBudget, ...budget };
  const elements = sanitizeElements(elementsInput);
  const bounds = getCanvasExportBounds(elements, 0);
  if (!bounds) {
    throw new CanvasExportBudgetError(
      "empty-scene",
      "Cannot export an empty canvas"
    );
  }
  const rendered = await exportToCanvas({
    appState: {
      ...appState,
      gridModeEnabled: false,
      gridSize: 0,
      viewBackgroundColor: "transparent",
    },
    elements,
    exportPadding: limits.margin,
    files,
  });
  const tiles = planCanvasExportTiles(
    { maxX: rendered.width, maxY: rendered.height, minX: 0, minY: 0 },
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
    results.push({ blob, column: tile.column, kind: tile.kind, row: tile.row });
  }
  return results;
}
