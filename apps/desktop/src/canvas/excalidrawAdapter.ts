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
export const excalidrawCss = "@excalidraw/excalidraw/index.css";

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
  const runtimeCrypto = typeof crypto === "object" ? crypto : null;
  const randomId =
    typeof runtimeCrypto?.randomUUID === "function"
      ? runtimeCrypto.randomUUID()
      : `canvas-image-${now}-${Math.random().toString(36).slice(2)}`;
  return {
    angle: 0,
    backgroundColor: options.backgroundColor,
    boundElements: null,
    crop: null,
    fileId:
      options.fileId as import("@excalidraw/excalidraw/element/types").FileId,
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
