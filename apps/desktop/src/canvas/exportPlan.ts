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

export const defaultExportBudget: CanvasExportBudget = {
  margin: 24,
  maxBytes: 20 * 1024 * 1024,
  maxImages: 16,
  maxPixels: 32_000_000,
  tileSize: 2048,
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

export function planCanvasExportTiles(
  bounds: CanvasExportBounds,
  budget: Partial<CanvasExportBudget> = {}
): readonly CanvasExportTile[] {
  const limits = { ...defaultExportBudget, ...budget };
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
      column: 0,
      height: overviewHeight,
      kind: "overview",
      pixels: overviewWidth * overviewHeight,
      row: 0,
      sourceHeight,
      sourceWidth,
      sourceX: 0,
      sourceY: 0,
      width: overviewWidth,
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
        column,
        height: tileHeight,
        kind: "detail",
        pixels: tileWidth * tileHeight,
        row,
        sourceHeight: tileHeight,
        sourceWidth: tileWidth,
        sourceX,
        sourceY,
        width: tileWidth,
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
