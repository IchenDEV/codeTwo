import {
  ALLOWED_ELEMENT_TYPES,
  CANVAS_ENGINE,
  CANVAS_ENGINE_VERSION,
  CANVAS_SCHEMA_VERSION,
  type AllowedElementType,
  type CanvasAppStateSubset,
  type CanvasAssetRef,
  type CanvasEnvelope,
  type CanvasSceneSnapshot,
  type CanvasTheme,
  type NormalizedStaticAsset,
} from "./types";
import type {
  AppState,
  BinaryFileData,
  BinaryFiles,
  ExcalidrawElement,
  ExcalidrawImageElement,
  ExcalidrawTextElement,
} from "./excalidrawAdapter";

const DATA_URL_RE = /^data:[^;,]+(?:;[^;,]+)*;base64,[a-z0-9+/=\s]+$/i;
const INLINE_DATA_URL_RE = /data:[^;,\s]+(?:;[^;,\s]+)*;base64,[a-z0-9+/=\s]+/gi;
const HTTP_URL_RE = /^(?:https?:|javascript:|data:|blob:)/i;
const COLOR_PRESETS = new Set(["black", "white", "transparent", "red", "blue", "green", "yellow", "orange"]);

type ElementRecord = Record<string, unknown> & { type?: unknown; id?: unknown };

export class CanvasEnvelopeError extends Error {
  readonly code: "invalid-envelope" | "unsupported-engine" | "unsupported-schema" | "unsafe-data";

  constructor(code: CanvasEnvelopeError["code"], message: string) {
    super(message);
    this.name = "CanvasEnvelopeError";
    this.code = code;
  }
}

export function isDataUrl(value: unknown): value is string {
  return typeof value === "string" && DATA_URL_RE.test(value);
}

export function isExternalUrl(value: unknown): value is string {
  return typeof value === "string" && HTTP_URL_RE.test(value);
}

function finiteNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function finiteNonNegative(value: unknown, fallback = 0): number {
  return Math.max(0, finiteNumber(value, fallback));
}

function safeId(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 && value.length <= 160 ? value : fallback;
}

function safeColor(value: unknown, fallback: string): string {
  if (typeof value !== "string" || value.length > 64 || isDataUrl(value) || isExternalUrl(value)) {
    return fallback;
  }
  const normalized = String(value).toLowerCase();
  return COLOR_PRESETS.has(normalized) ? normalized : fallback;
}

function safePoints(value: unknown): readonly [number, number][] {
  if (!Array.isArray(value)) return [[0, 0]];
  const points = value
    .filter((point): point is unknown[] => Array.isArray(point) && point.length >= 2)
    .map((point) => [finiteNumber(point[0]), finiteNumber(point[1])] as [number, number]);
  return points.length > 0 ? points : [[0, 0]];
}

function safeText(value: unknown, fallback = ""): string {
  return (typeof value === "string" ? value : fallback).replace(INLINE_DATA_URL_RE, "").slice(0, 100_000);
}

function safeElementBase(element: ElementRecord, index: number): ElementRecord {
  const type = element.type;
  return {
    id: safeId(element.id, `canvas-element-${index + 1}`),
    type,
    x: finiteNumber(element.x),
    y: finiteNumber(element.y),
    width: finiteNonNegative(element.width),
    height: finiteNonNegative(element.height),
    angle: finiteNumber(element.angle),
    strokeColor: safeColor(element.strokeColor, "black"),
    backgroundColor: safeColor(element.backgroundColor, "transparent"),
    fillStyle: element.fillStyle === "solid" ? "solid" : "solid",
    strokeWidth: finiteNonNegative(element.strokeWidth, 2),
    strokeStyle: element.strokeStyle === "dashed" || element.strokeStyle === "dotted" ? element.strokeStyle : "solid",
    roundness: null,
    roughness: 0,
    opacity: Math.min(100, finiteNonNegative(element.opacity, 100)),
    seed: Math.trunc(finiteNumber(element.seed)),
    version: Math.max(1, Math.trunc(finiteNumber(element.version, 1))),
    versionNonce: Math.trunc(finiteNumber(element.versionNonce)),
    index: typeof element.index === "string" ? element.index : null,
    isDeleted: Boolean(element.isDeleted),
    groupIds: [],
    frameId: null,
    boundElements: null,
    updated: Math.max(0, Math.trunc(finiteNumber(element.updated))),
    link: null,
    locked: Boolean(element.locked),
  };
}

function sanitizeElement(element: unknown, index: number): ExcalidrawElement | null {
  if (!element || typeof element !== "object") return null;
  const source = element as ElementRecord;
  const type = source.type;
  if (!ALLOWED_ELEMENT_TYPES.includes(type as AllowedElementType)) return null;
  const base = safeElementBase(source, index);

  switch (type) {
    case "rectangle":
    case "ellipse":
      return base as ExcalidrawElement;
    case "line":
    case "arrow": {
      const points = safePoints(source.points);
      return {
        ...base,
        type,
        points,
        lastCommittedPoint: null,
        startBinding: null,
        endBinding: null,
        startArrowhead: null,
        endArrowhead: type === "arrow" ? "arrow" : null,
        ...(type === "arrow" ? { elbowed: false } : {}),
      } as unknown as ExcalidrawElement;
    }
    case "freedraw":
      return {
        ...base,
        type,
        points: safePoints(source.points),
        pressures: Array.isArray(source.pressures)
          ? source.pressures.map((pressure) => Math.min(1, Math.max(0, finiteNumber(pressure, 0.5))))
          : [],
        simulatePressure: Boolean(source.simulatePressure),
        lastCommittedPoint: null,
      } as unknown as ExcalidrawElement;
    case "text": {
      const text = safeText(source.text);
      const originalText = safeText(source.originalText, text);
      return {
        ...base,
        type,
        text,
        originalText,
        fontSize: Math.min(96, Math.max(8, finiteNumber(source.fontSize, 16))),
        fontFamily: source.fontFamily === 3 ? 3 : 2,
        textAlign: source.textAlign === "center" || source.textAlign === "right" ? source.textAlign : "left",
        verticalAlign: source.verticalAlign === "middle" || source.verticalAlign === "bottom" ? source.verticalAlign : "top",
        containerId: null,
        autoResize: source.autoResize !== false,
        lineHeight: finiteNumber(source.lineHeight, 1.25) as ExcalidrawTextElement["lineHeight"],
      } as ExcalidrawTextElement;
    }
    case "image": {
      const fileId = safeId(source.fileId, "");
      if (!fileId || isDataUrl(source.fileId) || isExternalUrl(source.fileId)) return null;
      return {
        ...base,
        type,
        fileId,
        status: "saved",
        scale: Array.isArray(source.scale) && source.scale.length >= 2
          ? [finiteNumber(source.scale[0], 1), finiteNumber(source.scale[1], 1)]
          : [1, 1],
        crop: null,
      } as ExcalidrawImageElement;
    }
    default:
      return null;
  }
}

/**
 * Filters and normalizes the scene at every boundary. Unsupported Excalidraw elements are
 * discarded, links/custom data/frames are removed, and free-draw points remain only here in the
 * exact engine scene (the manifest deliberately omits them).
 */
export function sanitizeElements(elements: readonly unknown[]): readonly ExcalidrawElement[] {
  const seen = new Set<string>();
  const result: ExcalidrawElement[] = [];
  elements.forEach((element, index) => {
    const sanitized = sanitizeElement(element, index);
    if (!sanitized || seen.has(sanitized.id)) return;
    seen.add(sanitized.id);
    result.push(sanitized);
  });
  return result;
}

export function sanitizeAppState(appState: Partial<AppState> | null | undefined): CanvasAppStateSubset {
  const source = appState ?? {};
  const zoomValue = typeof source.zoom === "number"
    ? finiteNumber(source.zoom, 1)
    : source.zoom && typeof source.zoom === "object" && "value" in source.zoom
      ? finiteNumber((source.zoom as { value?: unknown }).value, 1)
      : 1;
  return {
    viewBackgroundColor: safeColor(source.viewBackgroundColor, "white"),
    scrollX: finiteNumber(source.scrollX),
    scrollY: finiteNumber(source.scrollY),
    zoom: Math.min(8, Math.max(0.1, zoomValue)),
    gridSize: source.gridSize === null ? null : finiteNonNegative(source.gridSize, 20),
    gridStep: Math.max(1, finiteNonNegative(source.gridStep, 5)),
    viewModeEnabled: Boolean(source.viewModeEnabled),
  };
}

function normalizeAssetRefs(elements: readonly ExcalidrawElement[], existing: readonly CanvasAssetRef[]): readonly CanvasAssetRef[] {
  const byFile = new Map(
    existing
      .filter((asset) =>
        typeof asset.ref === "string" &&
        asset.ref.length > 0 &&
        asset.ref.length <= 160 &&
        !/^(?:data:|blob:|https?:|javascript:)/i.test(asset.ref) &&
        !/[\\/\s]/.test(asset.ref) &&
        (asset.mimeType === "image/png" || asset.mimeType === "image/webp") &&
        typeof asset.fileId === "string" &&
        asset.fileId.length > 0,
      )
      .map((asset) => [asset.fileId, {
        ref: asset.ref,
        fileId: asset.fileId,
        mimeType: asset.mimeType,
        byteLength: Math.max(0, Math.trunc(finiteNumber(asset.byteLength))),
        ...(typeof asset.width === "number" && Number.isFinite(asset.width) ? { width: Math.max(0, asset.width) } : {}),
        ...(typeof asset.height === "number" && Number.isFinite(asset.height) ? { height: Math.max(0, asset.height) } : {}),
      } satisfies CanvasAssetRef]),
  );
  const refs: CanvasAssetRef[] = [];
  for (const element of elements) {
    if (element.type !== "image" || !element.fileId) continue;
    const existingRef = byFile.get(element.fileId);
    if (existingRef) refs.push(existingRef);
  }
  const unique = new Map(refs.map((asset) => [asset.fileId, asset]));
  return Array.from(unique.values()).sort((a, b) => a.fileId.localeCompare(b.fileId));
}

export function createEnvelope(
  snapshot: Pick<CanvasSceneSnapshot, "elements" | "appState">,
  revision: number,
  theme: CanvasTheme,
  existingAssetRefs: readonly CanvasAssetRef[] = [],
): CanvasEnvelope {
  const sanitizedElements = sanitizeElements(snapshot.elements);
  const assetRefs = normalizeAssetRefs(sanitizedElements, existingAssetRefs);
  const knownImageFiles = new Set(assetRefs.map((asset) => asset.fileId));
  if (sanitizedElements.some((element) => element.type === "image" && (element.fileId == null || !knownImageFiles.has(element.fileId)))) {
    throw new CanvasEnvelopeError("invalid-envelope", "Canvas image elements require a trusted opaque asset ref");
  }
  const elements = sanitizedElements;
  return {
    engine: CANVAS_ENGINE,
    engineVersion: CANVAS_ENGINE_VERSION,
    schemaVersion: CANVAS_SCHEMA_VERSION,
    revision: Math.max(0, Math.trunc(revision)),
    theme,
    elements,
    appState: sanitizeAppState(snapshot.appState),
    assetRefs,
  };
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, stableValue(entry)]));
}

/** Deterministic JSON is useful for autosave change detection and reconnect retries. */
export function serializeEnvelope(envelope: CanvasEnvelope): string {
  const sanitized = createEnvelope(
    { elements: envelope.elements, appState: envelope.appState as unknown as AppState },
    envelope.revision,
    envelope.theme,
    envelope.assetRefs,
  );
  return JSON.stringify(stableValue(sanitized));
}

function assertEnvelope(value: unknown): asserts value is CanvasEnvelope {
  if (!value || typeof value !== "object") throw new CanvasEnvelopeError("invalid-envelope", "Canvas envelope must be an object");
  const envelope = value as Partial<CanvasEnvelope>;
  if (envelope.engine !== CANVAS_ENGINE || envelope.engineVersion !== CANVAS_ENGINE_VERSION) {
    throw new CanvasEnvelopeError("unsupported-engine", "Canvas envelope engine/version is not supported");
  }
  if (envelope.schemaVersion !== CANVAS_SCHEMA_VERSION) {
    throw new CanvasEnvelopeError("unsupported-schema", "Canvas envelope schema version is not supported");
  }
  if (!Array.isArray(envelope.elements) || !Array.isArray(envelope.assetRefs)) {
    throw new CanvasEnvelopeError("invalid-envelope", "Canvas envelope scene is incomplete");
  }
}

export function deserializeEnvelope(serialized: string | CanvasEnvelope): CanvasEnvelope {
  let parsed: unknown;
  try {
    parsed = typeof serialized === "string" ? JSON.parse(serialized) : serialized;
  } catch {
    throw new CanvasEnvelopeError("invalid-envelope", "Canvas envelope is not valid JSON");
  }
  assertEnvelope(parsed);
  const envelope = parsed as CanvasEnvelope;
  const sanitizedElements = sanitizeElements(envelope.elements);
  if (sanitizedElements.some((element) => JSON.stringify(element).match(DATA_URL_RE))) {
    throw new CanvasEnvelopeError("unsafe-data", "Canvas envelope contains an inline data URL");
  }
  const refs = normalizeAssetRefs(sanitizedElements, envelope.assetRefs);
  const knownImageFiles = new Set(refs.map((asset) => asset.fileId));
  if (sanitizedElements.some((element) => element.type === "image" && (element.fileId == null || !knownImageFiles.has(element.fileId)))) {
    throw new CanvasEnvelopeError("invalid-envelope", "Canvas image elements require a trusted opaque asset ref");
  }
  const elements = sanitizedElements;
  return {
    engine: CANVAS_ENGINE,
    engineVersion: CANVAS_ENGINE_VERSION,
    schemaVersion: CANVAS_SCHEMA_VERSION,
    revision: Math.max(0, Math.trunc(finiteNumber(envelope.revision))),
    theme: envelope.theme === "dark" ? "dark" : "light",
    elements,
    appState: sanitizeAppState(envelope.appState as unknown as Partial<AppState>),
    assetRefs: refs,
  };
}

function bytesToDataUrl(bytes: Uint8Array, mimeType: string): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:${mimeType};base64,${btoa(binary)}`;
}

async function readBytes(value: NormalizedStaticAsset["bytes"]): Promise<Uint8Array> {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return new Uint8Array(await value.arrayBuffer());
}

/** Rehydrate requires caller-provided normalized static assets; no storage or network lookup occurs. */
export async function rehydrateEnvelope(
  envelopeInput: CanvasEnvelope | string,
  assets: readonly NormalizedStaticAsset[],
): Promise<CanvasSceneSnapshot> {
  const envelope = deserializeEnvelope(envelopeInput);
  const byRef = new Map(assets.map((asset) => [asset.ref, asset]));
  const files: BinaryFiles = {};
  for (const asset of envelope.assetRefs) {
    const supplied = byRef.get(asset.ref);
    if (!supplied || supplied.fileId !== asset.fileId || supplied.mimeType !== asset.mimeType) continue;
    const bytes = await readBytes(supplied.bytes);
    const binaryFile: BinaryFileData = {
      id: supplied.fileId as BinaryFileData["id"],
      mimeType: supplied.mimeType,
      dataURL: bytesToDataUrl(bytes, supplied.mimeType) as BinaryFileData["dataURL"],
      created: 0,
      version: 1,
    };
    files[supplied.fileId] = binaryFile;
  }
  return {
    elements: envelope.elements,
    appState: {
      ...envelope.appState,
      zoom: { value: envelope.appState.zoom },
      theme: envelope.theme,
    } as AppState,
    files,
  };
}

export function stripDataUrls(value: unknown): unknown {
  if (typeof value === "string") return isDataUrl(value) ? undefined : value;
  if (Array.isArray(value)) return value.map(stripDataUrls).filter((entry) => entry !== undefined);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, entry]) => [key, stripDataUrls(entry)] as const)
      .filter(([, entry]) => entry !== undefined),
  );
}
