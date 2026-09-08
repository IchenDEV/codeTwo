import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
/**
 * Shim for `@excalidraw/utils/export`, which Excalidraw 0.18 re-exports from its
 * public entry but does not publish as a resolvable package. Runtime values still
 * come from `@excalidraw/excalidraw`; this file only restores type resolution.
 */
import type { AppState, BinaryFiles } from "@excalidraw/excalidraw/types";

export declare function exportToCanvas(opts: {
  elements: readonly ExcalidrawElement[];
  appState?: Partial<AppState> | AppState;
  files?: BinaryFiles;
  exportPadding?: number;
  maxWidthOrHeight?: number;
  getDimensions?: (
    width: number,
    height: number
  ) => {
    width: number;
    height: number;
    scale?: number;
  };
}): Promise<HTMLCanvasElement>;

export declare function exportToBlob(opts: {
  elements: readonly ExcalidrawElement[];
  appState?: Partial<AppState> | AppState;
  files?: BinaryFiles;
  mimeType?: string;
  quality?: number;
  exportPadding?: number;
}): Promise<Blob>;

export declare function exportToSvg(opts: {
  elements: readonly ExcalidrawElement[];
  appState?: Partial<AppState> | AppState;
  files?: BinaryFiles;
  exportPadding?: number;
}): Promise<SVGSVGElement>;

export declare function exportToClipboard(opts: {
  elements: readonly ExcalidrawElement[];
  appState?: Partial<AppState> | AppState;
  files?: BinaryFiles;
  type: "png" | "svg" | "json";
}): Promise<void>;
