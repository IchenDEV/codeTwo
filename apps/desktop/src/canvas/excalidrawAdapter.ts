/**
 * C2's only direct integration seam with Excalidraw. Other canvas modules consume the
 * narrow re-exports and policy helpers here instead of reaching into the renderer package.
 *
 * Brand constructors live here so Excalidraw's opaque FileId / DataURL / lineHeight brands
 * are minted in one place (external type boundary).
 */
export { Excalidraw, exportToCanvas } from "@excalidraw/excalidraw";
export type {
  AppState,
  BinaryFileData,
  BinaryFiles,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";
export type {
  ExcalidrawProps,
  ExcalidrawInitialDataState,
} from "@excalidraw/excalidraw/types";
export type {
  ExcalidrawElement,
  ExcalidrawImageElement,
  ExcalidrawTextElement,
  OrderedExcalidrawElement,
  Theme,
} from "@excalidraw/excalidraw/element/types";
export type { DataURL } from "@excalidraw/excalidraw/types";
export type { FileId } from "@excalidraw/excalidraw/element/types";

import type {
  ExcalidrawElement,
  ExcalidrawImageElement,
  ExcalidrawTextElement,
  FileId,
} from "@excalidraw/excalidraw/element/types";
import type { AppState, DataURL } from "@excalidraw/excalidraw/types";
import type { Radians } from "@excalidraw/math";

export const excalidrawCss = "@excalidraw/excalidraw/index.css";

/** Mint an Excalidraw FileId brand from a validated opaque reference string. */
export function toFileId(fileId: string): FileId {
  // Excalidraw brands FileId as `string & { _brand: "FileId" }`; the brand is a
  // type-system only marker and cannot be constructed without an assertion.
  return fileId as FileId;
}

/** Mint an Excalidraw DataURL brand from a `data:` URL we generated. */
export function toDataURL(dataURL: string): DataURL {
  return dataURL as DataURL;
}

/** Mint Excalidraw's branded radians angle. */
export function toRadians(value: number): Radians {
  return value as Radians;
}

/** Mint Excalidraw's branded unitless lineHeight. */
export function toLineHeight(
  value: number
): ExcalidrawTextElement["lineHeight"] {
  return value as ExcalidrawTextElement["lineHeight"];
}

/**
 * Assert a fully sanitized scene element into Excalidraw's branded element union.
 * Call only after field-level sanitizers have produced a complete shape.
 */
export function toExcalidrawElement(element: object): ExcalidrawElement {
  return element as ExcalidrawElement;
}

export function toExcalidrawTextElement(
  element: object
): ExcalidrawTextElement {
  return element as ExcalidrawTextElement;
}

export function toExcalidrawImageElement(
  element: object
): ExcalidrawImageElement {
  return element as ExcalidrawImageElement;
}

/** Rehydrate a sanitized app-state subset into Excalidraw's AppState brand. */
export function toAppState(value: object): AppState {
  return value as AppState;
}

export function newImageElement(options: {
  type: "image";
  fileId: string;
  status?: "pending" | "saved" | "error";
  x: number;
  y: number;
  width: number;
  height: number;
  strokeColor: string;
  backgroundColor: string;
  fillStyle: "solid";
  strokeWidth: number;
  strokeStyle: "solid";
  roughness: 0;
  roundness: null;
  opacity: number;
  locked: boolean;
  frameId: null;
  scale: readonly [number, number];
}): ExcalidrawImageElement {
  const now = Date.now();
  const runtimeCrypto = typeof crypto === "object" ? crypto : null;
  const randomId =
    typeof runtimeCrypto?.randomUUID === "function"
      ? runtimeCrypto.randomUUID()
      : `canvas-image-${now}-${Math.random().toString(36).slice(2)}`;
  return {
    angle: toRadians(0),
    backgroundColor: options.backgroundColor,
    boundElements: null,
    crop: null,
    fileId: toFileId(options.fileId),
    fillStyle: options.fillStyle,
    frameId: options.frameId,
    groupIds: [],
    height: options.height,
    id: randomId,
    index: null,
    isDeleted: false,
    link: null,
    locked: options.locked,
    opacity: options.opacity,
    roughness: options.roughness,
    roundness: options.roundness,
    scale: [options.scale[0], options.scale[1]],
    seed: now,
    status: options.status ?? "saved",
    strokeColor: options.strokeColor,
    strokeStyle: options.strokeStyle,
    strokeWidth: options.strokeWidth,
    type: "image",
    updated: now,
    version: 1,
    versionNonce: now,
    width: options.width,
    x: options.x,
    y: options.y,
  };
}
