import type {
  AppState,
  BinaryFiles,
  ExcalidrawElement,
  OrderedExcalidrawElement,
  Theme as ExcalidrawTheme,
} from "./excalidrawAdapter";

export const CANVAS_ENGINE = "@excalidraw/excalidraw" as const;
export const CANVAS_ENGINE_VERSION = "0.18.1" as const;
export const CANVAS_SCHEMA_VERSION = 1 as const;

export type CanvasTheme = ExcalidrawTheme;
export type CanvasMode = "edit" | "readonly" | "historical";

/** The only scene element types that C2 allows to cross a persistence boundary. */
export const ALLOWED_ELEMENT_TYPES = [
  "rectangle",
  "ellipse",
  "line",
  "arrow",
  "freedraw",
  "text",
  "image",
] as const;

export type AllowedElementType = (typeof ALLOWED_ELEMENT_TYPES)[number];

/** Toolbar tools are deliberately narrower than Excalidraw's complete tool set. */
export const APPROVED_TOOL_TYPES = [
  "selection",
  "hand",
  "freedraw",
  "eraser",
  "text",
  "rectangle",
  "ellipse",
  "line",
  "arrow",
  "image",
] as const;

export type ApprovedToolType = (typeof APPROVED_TOOL_TYPES)[number];

export interface CanvasAssetRef {
  /** Opaque app-owned identifier. It must never contain a path, URL, or data URL. */
  ref: string;
  fileId: string;
  mimeType: "image/png" | "image/webp";
  byteLength: number;
  width?: number;
  height?: number;
}

export interface CanvasAppStateSubset {
  viewBackgroundColor: string;
  scrollX: number;
  scrollY: number;
  zoom: number;
  gridSize: number | null;
  gridStep: number;
  viewModeEnabled: boolean;
}

/**
 * Versioned persistence envelope. BinaryFiles are intentionally absent: the caller stores and
 * resolves normalized static assets by opaque refs when rehydrating.
 */
export interface CanvasEnvelope {
  engine: typeof CANVAS_ENGINE;
  engineVersion: typeof CANVAS_ENGINE_VERSION;
  schemaVersion: typeof CANVAS_SCHEMA_VERSION;
  revision: number;
  theme: CanvasTheme;
  elements: readonly ExcalidrawElement[];
  appState: CanvasAppStateSubset;
  assetRefs: readonly CanvasAssetRef[];
}

export interface CanvasSceneSnapshot {
  elements: readonly ExcalidrawElement[];
  appState: AppState;
  files: BinaryFiles;
}

export interface NormalizedStaticAsset {
  ref: string;
  fileId: string;
  mimeType: "image/png" | "image/webp";
  bytes: Uint8Array | ArrayBuffer | Blob;
}

export interface CanvasCallbacks {
  onChange?: (envelope: CanvasEnvelope) => void;
  onDone?: () => void;
  onFocusChange?: (focused: boolean) => void;
  onMediaError?: (error: Error) => void;
}

export interface CanvasEditorProps extends CanvasCallbacks {
  className?: string;
  /** A caller can provide a new envelope after reconnect without local persistence. */
  value?: CanvasEnvelope | null;
  mode?: CanvasMode;
  theme?: CanvasTheme;
  initiallyExpanded?: boolean;
  autosaveDebounceMs?: number;
  mediaNormalizer?: import("./media").CanvasMediaNormalizer;
  assetResolver?: (
    asset: CanvasAssetRef
  ) => Promise<NormalizedStaticAsset | null>;
  /** Optional caller-rendered PNG/WebP thumbnail shown while the island is collapsed. */
  previewImage?: string | null;
  previewAlt?: string;
  name?: string;
}

export interface CanvasEditorHandle {
  getSnapshot: () => CanvasSceneSnapshot | null;
  getEnvelope: () => CanvasEnvelope | null;
  resetFromEnvelope: (envelope: CanvasEnvelope | null) => void;
  focus: () => void;
}

export type CanvasChangeElements = readonly OrderedExcalidrawElement[];
