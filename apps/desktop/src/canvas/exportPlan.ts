export interface CanvasExportBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface CanvasExportBudget {
  maxImages: number;
  maxPixels: number;
  maxBytes: number;
  tileSize: number;
  margin: number;
}

export const DEFAULT_EXPORT_BUDGET: CanvasExportBudget = {
  maxImages: 16,
  maxPixels: 32_000_000,
  maxBytes: 20 * 1024 * 1024,
  tileSize: 2048,
  margin: 24,
};

export interface CanvasExportTile {
  kind: "overview" | "detail";
  row: number;
  column: number;
  sourceX: number;
  sourceY: number;
  sourceWidth: number;
  sourceHeight: number;
  width: number;
  height: number;
  pixels: number;
}

export class CanvasExportBudgetError extends Error {
  readonly code:
    | "empty-scene"
    | "image-count"
    | "pixel-budget"
    | "byte-budget"
    | "canvas-unavailable";

  constructor(code: CanvasExportBudgetError["code"], message: string) {
    super(message);
    this.name = "CanvasExportBudgetError";
    this.code = code;
  }
}

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function scaledDimension(value: number, maxDimension: number): number {
  return Math.max(1, Math.min(maxDimension, Math.ceil(value)));
}

/**
Builds a deterministic overview-first, row-major detail tile plan without rendering.
*/
export function planCanvasExportTiles(
  bounds: CanvasExportBounds,
  budget: Partial<CanvasExportBudget> = {}
): readonly CanvasExportTile[] {
  const limits = { ...DEFAULT_EXPORT_BUDGET, ...budget };
  const sourceWidth = Math.max(1, Math.ceil(finite(bounds.maxX - bounds.minX)));
  const sourceHeight = Math.max(
    1,
    Math.ceil(finite(bounds.maxY - bounds.minY))
  );
  const overviewScale = Math.min(
    1,
    limits.tileSize / Math.max(sourceWidth, sourceHeight)
  );
  const overviewWidth = scaledDimension(
    sourceWidth * overviewScale,
    limits.tileSize
  );
  const overviewHeight = scaledDimension(
    sourceHeight * overviewScale,
    limits.tileSize
  );
  const tiles: CanvasExportTile[] = [
    {
      kind: "overview",
      row: 0,
      column: 0,
      sourceX: 0,
      sourceY: 0,
      sourceWidth,
      sourceHeight,
      width: overviewWidth,
      height: overviewHeight,
      pixels: overviewWidth * overviewHeight,
    },
  ];
  if (sourceWidth <= limits.tileSize && sourceHeight <= limits.tileSize) {
    if (tiles.length > limits.maxImages) {
      throw new CanvasExportBudgetError(
        "image-count",
        `Canvas export requires ${tiles.length} images; limit is ${limits.maxImages}`
      );
    }
    if (tiles[0].pixels > limits.maxPixels) {
      throw new CanvasExportBudgetError(
        "pixel-budget",
        "Canvas overview exceeds the pixel budget"
      );
    }
    if (tiles[0].pixels * 4 > limits.maxBytes) {
      throw new CanvasExportBudgetError(
        "byte-budget",
        "Canvas overview exceeds the byte budget"
      );
    }
    return tiles;
  }
  const rows = Math.ceil(sourceHeight / limits.tileSize);
  const columns = Math.ceil(sourceWidth / limits.tileSize);
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const sourceX = column * limits.tileSize;
      const sourceY = row * limits.tileSize;
      const tileWidth = Math.min(limits.tileSize, sourceWidth - sourceX);
      const tileHeight = Math.min(limits.tileSize, sourceHeight - sourceY);
      tiles.push({
        kind: "detail",
        row,
        column,
        sourceX,
        sourceY,
        sourceWidth: tileWidth,
        sourceHeight: tileHeight,
        width: tileWidth,
        height: tileHeight,
        pixels: tileWidth * tileHeight,
      });
    }
  }
  if (tiles.length > limits.maxImages) {
    throw new CanvasExportBudgetError(
      "image-count",
      `Canvas export requires ${tiles.length} images; limit is ${limits.maxImages}`
    );
  }
  const pixels = tiles.reduce((sum, tile) => sum + tile.pixels, 0);
  if (pixels > limits.maxPixels) {
    throw new CanvasExportBudgetError(
      "pixel-budget",
      `Canvas export requires ${pixels} pixels; limit is ${limits.maxPixels}`
    );
  }
  if (pixels * 4 > limits.maxBytes) {
    throw new CanvasExportBudgetError(
      "byte-budget",
      `Canvas export may require ${pixels * 4} bytes; limit is ${limits.maxBytes}`
    );
  }
  return tiles;
}
