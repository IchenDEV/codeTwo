import type { ExcalidrawElement } from "./excalidrawAdapter";
import { sanitizeElements } from "./serialize";
import { ALLOWED_ELEMENT_TYPES, type AllowedElementType } from "./types";

export interface CanvasManifestGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CanvasManifestArrowEndpoint {
  x: number;
  y: number;
}

export interface CanvasManifestObject {
  id: string;
  type: AllowedElementType;
  originalText: string | null;
  geometry: CanvasManifestGeometry;
  layer: number;
  arrowStart: CanvasManifestArrowEndpoint | null;
  arrowEnd: CanvasManifestArrowEndpoint | null;
}

export interface CanvasManifest {
  schemaVersion: 1;
  objects: readonly CanvasManifestObject[];
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function elementBounds(element: ExcalidrawElement): CanvasManifestGeometry {
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
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    return {
      x: minX,
      y: minY,
      width: Math.max(0, Math.max(...xs) - minX),
      height: Math.max(0, Math.max(...ys) - minY),
    };
  }
  return {
    x: element.x,
    y: element.y,
    width: Math.max(0, element.width),
    height: Math.max(0, element.height),
  };
}

function endpoint(
  element: ExcalidrawElement,
  point: readonly [number, number] | undefined,
  originX: number,
  originY: number
): CanvasManifestArrowEndpoint | null {
  if (!point) return null;
  return {
    x: round(element.x + point[0] - originX),
    y: round(element.y + point[1] - originY),
  };
}

/**
 * Derives a stable structural summary. It intentionally contains no raw free-draw samples or
 * engine app state so the manifest is safe to send to providers that only need structure.
 */
export function deriveCanvasManifest(
  elements: readonly unknown[]
): CanvasManifest {
  const sanitized = sanitizeElements(elements);
  const visible = sanitized
    .filter((element) => !element.isDeleted && element.opacity > 0)
    .filter(
      (element): element is ExcalidrawElement & { type: AllowedElementType } =>
        ALLOWED_ELEMENT_TYPES.includes(element.type as AllowedElementType)
    );
  const allBounds = visible.map(elementBounds);
  const originX =
    allBounds.length > 0 ? Math.min(...allBounds.map((bounds) => bounds.x)) : 0;
  const originY =
    allBounds.length > 0 ? Math.min(...allBounds.map((bounds) => bounds.y)) : 0;
  const objects = visible.map((element, layer) => {
    const bounds = elementBounds(element);
    const points =
      element.type === "line" || element.type === "arrow" ? element.points : [];
    return {
      id: element.id,
      type: element.type,
      originalText: element.type === "text" ? element.originalText : null,
      geometry: {
        x: round(bounds.x - originX),
        y: round(bounds.y - originY),
        width: round(bounds.width),
        height: round(bounds.height),
      },
      layer,
      arrowStart:
        element.type === "arrow"
          ? endpoint(element, points[0], originX, originY)
          : null,
      arrowEnd:
        element.type === "arrow"
          ? endpoint(element, points[points.length - 1], originX, originY)
          : null,
    } satisfies CanvasManifestObject;
  });
  return { schemaVersion: 1, objects };
}

export function serializeCanvasManifest(manifest: CanvasManifest): string {
  return JSON.stringify(manifest);
}
