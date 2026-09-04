/**
 * C2's only direct integration seam with Excalidraw. Other canvas modules consume the
 * narrow re-exports and policy helpers here instead of reaching into the renderer package.
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
export const EXCALIDRAW_CSS = "@excalidraw/excalidraw/index.css";

/**
 * The public 0.18.1 package does not export its image constructor. Keep the
 * tiny constructor here so image placement remains behind this single adapter
 * seam rather than importing Excalidraw internals throughout the editor.
 */
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
}): import("@excalidraw/excalidraw/element/types").ExcalidrawImageElement {
  const now = Date.now();
  const runtimeCrypto =
    typeof globalThis.crypto === "object" ? globalThis.crypto : null;
  const randomId =
    typeof runtimeCrypto?.randomUUID === "function"
      ? runtimeCrypto.randomUUID()
      : `canvas-image-${now}-${Math.random().toString(36).slice(2)}`;
  return {
    id: randomId,
    type: "image",
    x: options.x,
    y: options.y,
    width: options.width,
    height: options.height,
    angle: 0,
    strokeColor: options.strokeColor,
    backgroundColor: options.backgroundColor,
    fillStyle: options.fillStyle,
    strokeWidth: options.strokeWidth,
    strokeStyle: options.strokeStyle,
    roughness: options.roughness,
    roundness: options.roundness,
    seed: now,
    version: 1,
    versionNonce: now,
    opacity: options.opacity,
    index: null,
    isDeleted: false,
    groupIds: [],
    frameId: options.frameId,
    boundElements: null,
    updated: now,
    link: null,
    locked: options.locked,
    fileId:
      options.fileId as import("@excalidraw/excalidraw/element/types").FileId,
    status: options.status ?? "saved",
    scale: [options.scale[0], options.scale[1]],
    crop: null,
  } as unknown as import("@excalidraw/excalidraw/element/types").ExcalidrawImageElement;
}
