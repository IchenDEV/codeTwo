import type {
  AppState,
  BinaryFileData,
  BinaryFiles,
  ExcalidrawElement,
} from "./excalidrawAdapter";
import {
  toAppState,
  toDataURL,
  toExcalidrawElement,
  toExcalidrawImageElement,
  toExcalidrawTextElement,
  toFileId,
  toLineHeight,
} from "./excalidrawAdapter";
import {
  canvasEngine,
  canvasEngineVersion,
  canvasSchemaVersion,
  isAllowedElementType,
} from "./types";
import type {
  CanvasAppStateSubset,
  CanvasAssetReference,
  CanvasEnvelope,
  CanvasSceneSnapshot,
  CanvasTheme,
  NormalizedStaticAsset,
} from "./types";

const dataUrlRe = /^data:[^;,]+(?:;[^;,]+)*;base64,[a-z0-9+/=\s]+$/iu;
const inlineDataUrlRe = /data:[^;,\s]+(?:;[^;,\s]+)*;base64,[a-z0-9+/=\s]+/giu;
const httpUrlRe = /^(?:https?:|javascript:|data:|blob:)/iu;
const colorPresets = new Set([
  "black",
  "white",
  "transparent",
  "red",
  "blue",
  "green",
  "yellow",
  "orange",
]);

type ElementRecord = Record<string, unknown> & { type?: unknown; id?: unknown };

function toElementRecord(element: object): ElementRecord {
  const record: ElementRecord = {};
  for (const [key, value] of Object.entries(element)) {
    record[key] = value;
  }
  return record;
}

export class CanvasEnvelopeError extends Error {
  readonly code:
    | "invalid-envelope"
    | "unsupported-engine"
    | "unsupported-schema"
    | "unsafe-data";

  constructor(code: CanvasEnvelopeError["code"], message: string) {
    super(message);
    this.name = "CanvasEnvelopeError";
    this.code = code;
  }
}

export function isDataUrl(value: unknown): value is string {
  return typeof value === "string" && dataUrlRe.test(value);
}

export function isExternalUrl(value: unknown): value is string {
  return typeof value === "string" && httpUrlRe.test(value);
}

function readUnknownField(object: object, key: string): unknown {
  if (!Object.prototype.hasOwnProperty.call(object, key)) {
    return undefined;
  }
  return Object.getOwnPropertyDescriptor(object, key)?.value;
}

function finiteNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function finiteNonNegative(value: unknown, fallback = 0): number {
  return Math.max(0, finiteNumber(value, fallback));
}

function safeId(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 && value.length <= 160
    ? value
    : fallback;
}

function safeColor(value: unknown, fallback: string): string {
  if (
    typeof value !== "string" ||
    value.length > 64 ||
    isDataUrl(value) ||
    isExternalUrl(value)
  ) {
    return fallback;
  }
  const normalized = String(value).toLowerCase();
  return colorPresets.has(normalized) ? normalized : fallback;
}

function safePoints(value: unknown): readonly [number, number][] {
  if (!Array.isArray(value)) {
    return [[0, 0]];
  }
  const points = value
    .filter(
      (point): point is unknown[] => Array.isArray(point) && point.length >= 2
    )
    .map(
      (point) =>
        [finiteNumber(point[0]), finiteNumber(point[1])] as [number, number]
    );
  return points.length > 0 ? points : [[0, 0]];
}

function safeText(value: unknown, fallback = ""): string {
  return (typeof value === "string" ? value : fallback)
    .replace(inlineDataUrlRe, "")
    .slice(0, 100_000);
}

function safeElementBase(element: ElementRecord, index: number): ElementRecord {
  const { type } = element;
  return {
    angle: finiteNumber(element.angle),
    backgroundColor: safeColor(element.backgroundColor, "transparent"),
    boundElements: null,
    fillStyle: element.fillStyle === "solid" ? "solid" : "solid",
    frameId: null,
    groupIds: [],
    height: finiteNonNegative(element.height),
    id: safeId(element.id, `canvas-element-${index + 1}`),
    index: typeof element.index === "string" ? element.index : null,
    isDeleted: Boolean(element.isDeleted),
    link: null,
    locked: Boolean(element.locked),
    opacity: Math.min(100, finiteNonNegative(element.opacity, 100)),
    roughness: 0,
    roundness: null,
    seed: Math.trunc(finiteNumber(element.seed)),
    strokeColor: safeColor(element.strokeColor, "black"),
    strokeStyle:
      element.strokeStyle === "dashed" || element.strokeStyle === "dotted"
        ? element.strokeStyle
        : "solid",
    strokeWidth: finiteNonNegative(element.strokeWidth, 2),
    type,
    updated: Math.max(0, Math.trunc(finiteNumber(element.updated))),
    version: Math.max(1, Math.trunc(finiteNumber(element.version, 1))),
    versionNonce: Math.trunc(finiteNumber(element.versionNonce)),
    width: finiteNonNegative(element.width),
    x: finiteNumber(element.x),
    y: finiteNumber(element.y),
  };
}

function sanitizeElement(
  element: unknown,
  index: number
): ExcalidrawElement | null {
  if (element == null || typeof element !== "object") {
    return null;
  }
  const source = toElementRecord(element);
  const { type } = source;
  if (typeof type !== "string" || !isAllowedElementType(type)) {
    return null;
  }
  const base = safeElementBase(source, index);

  switch (type) {
    case "rectangle":
    case "ellipse": {
      return toExcalidrawElement({ ...base, type });
    }
    case "line":
    case "arrow": {
      const points = safePoints(source.points);
      return toExcalidrawElement({
        ...base,
        endArrowhead: type === "arrow" ? "arrow" : null,
        endBinding: null,
        lastCommittedPoint: null,
        points,
        startArrowhead: null,
        startBinding: null,
        type,
        ...(type === "arrow" ? { elbowed: false } : {}),
      });
    }
    case "freedraw": {
      return toExcalidrawElement({
        ...base,
        lastCommittedPoint: null,
        points: safePoints(source.points),
        pressures: Array.isArray(source.pressures)
          ? source.pressures.map((pressure) =>
              Math.min(1, Math.max(0, finiteNumber(pressure, 0.5)))
            )
          : [],
        simulatePressure: Boolean(source.simulatePressure),
        type,
      });
    }
    case "text": {
      const text = safeText(source.text);
      const originalText = safeText(source.originalText, text);
      return toExcalidrawTextElement({
        ...base,
        autoResize: source.autoResize !== false,
        containerId: null,
        fontFamily: source.fontFamily === 3 ? 3 : 2,
        fontSize: Math.min(96, Math.max(8, finiteNumber(source.fontSize, 16))),
        lineHeight: toLineHeight(finiteNumber(source.lineHeight, 1.25)),
        originalText,
        text,
        textAlign:
          source.textAlign === "center" || source.textAlign === "right"
            ? source.textAlign
            : "left",
        type,
        verticalAlign:
          source.verticalAlign === "middle" || source.verticalAlign === "bottom"
            ? source.verticalAlign
            : "top",
      });
    }
    case "image": {
      const fileId = safeId(source.fileId, "");
      if (!fileId || isDataUrl(source.fileId) || isExternalUrl(source.fileId)) {
        return null;
      }
      return toExcalidrawImageElement({
        ...base,
        crop: null,
        fileId: toFileId(fileId),
        scale:
          Array.isArray(source.scale) && source.scale.length >= 2
            ? [
                finiteNumber(source.scale[0], 1),
                finiteNumber(source.scale[1], 1),
              ]
            : [1, 1],
        status: "saved",
        type,
      });
    }
    default: {
      return null;
    }
  }
}

export function sanitizeElements(
  elements: readonly unknown[]
): readonly ExcalidrawElement[] {
  const seen = new Set<string>();
  const result: ExcalidrawElement[] = [];
  elements.forEach((element, index) => {
    const sanitized = sanitizeElement(element, index);
    if (!sanitized || seen.has(sanitized.id)) {
      return;
    }
    seen.add(sanitized.id);
    result.push(sanitized);
  });
  return result;
}

export function sanitizeAppState(
  appState: Partial<AppState> | CanvasAppStateSubset | null | undefined
): CanvasAppStateSubset {
  const source = appState ?? {};
  const zoomSource = source.zoom;
  const zoomValue =
    typeof zoomSource === "number"
      ? finiteNumber(zoomSource, 1)
      : zoomSource != null && typeof zoomSource === "object"
        ? finiteNumber(readUnknownField(zoomSource, "value"), 1)
        : 1;
  return {
    gridSize:
      source.gridSize === null ? null : finiteNonNegative(source.gridSize, 20),
    gridStep: Math.max(1, finiteNonNegative(source.gridStep, 5)),
    scrollX: finiteNumber(source.scrollX),
    scrollY: finiteNumber(source.scrollY),
    viewBackgroundColor: safeColor(source.viewBackgroundColor, "white"),
    viewModeEnabled: Boolean(source.viewModeEnabled),
    zoom: Math.min(8, Math.max(0.1, zoomValue)),
  };
}

function normalizeAssetReferences(
  elements: readonly ExcalidrawElement[],
  existing: readonly CanvasAssetReference[]
): readonly CanvasAssetReference[] {
  const byFile = new Map(
    existing
      .filter((asset) => {
        return (
          typeof asset.ref === "string" &&
          asset.ref.length > 0 &&
          asset.ref.length <= 160 &&
          !/^(?:data:|blob:|https?:|javascript:)/iu.test(asset.ref) &&
          !/[\\/\s]/u.test(asset.ref) &&
          (asset.mimeType === "image/png" || asset.mimeType === "image/webp") &&
          typeof asset.fileId === "string" &&
          asset.fileId.length > 0
        );
      })
      .map((asset) => {
        return [
          asset.fileId,
          {
            byteLength: Math.max(0, Math.trunc(finiteNumber(asset.byteLength))),
            fileId: asset.fileId,
            mimeType: asset.mimeType,
            ref: asset.ref,
            ...(typeof asset.width === "number" && Number.isFinite(asset.width)
              ? { width: Math.max(0, asset.width) }
              : {}),
            ...(typeof asset.height === "number" &&
            Number.isFinite(asset.height)
              ? { height: Math.max(0, asset.height) }
              : {}),
          } satisfies CanvasAssetReference,
        ];
      })
  );
  const refs: CanvasAssetReference[] = [];
  for (const element of elements) {
    if (element.type !== "image" || !element.fileId) {
      continue;
    }
    const existingReference = byFile.get(element.fileId);
    if (existingReference) {
      refs.push(existingReference);
    }
  }
  const unique = new Map(refs.map((asset) => [asset.fileId, asset]));
  return [...unique.values()].sort((a, b) => a.fileId.localeCompare(b.fileId));
}

export function createEnvelope(
  snapshot: {
    elements: readonly unknown[];
    appState: Partial<AppState> | CanvasAppStateSubset;
  },
  revision: number,
  theme: CanvasTheme,
  existingAssetReferences: readonly CanvasAssetReference[] = []
): CanvasEnvelope {
  const sanitizedElements = sanitizeElements(snapshot.elements);
  const assetReferences = normalizeAssetReferences(
    sanitizedElements,
    existingAssetReferences
  );
  const knownImageFiles = new Set(assetReferences.map((asset) => asset.fileId));
  if (
    sanitizedElements.some((element) => {
      return (
        element.type === "image" &&
        (element.fileId === null ||
          element.fileId === undefined ||
          !knownImageFiles.has(element.fileId))
      );
    })
  ) {
    throw new CanvasEnvelopeError(
      "invalid-envelope",
      "Canvas image elements require a trusted opaque asset ref"
    );
  }
  const elements = sanitizedElements;
  return {
    appState: sanitizeAppState(snapshot.appState),
    assetReferences,
    elements,
    engine: canvasEngine,
    engineVersion: canvasEngineVersion,
    revision: Math.max(0, Math.trunc(revision)),
    schemaVersion: canvasSchemaVersion,
    theme,
  };
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }
  if (value == null || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => [key, stableValue(entry)])
  );
}

export function serializeEnvelope(envelope: CanvasEnvelope): string {
  const sanitized = createEnvelope(
    {
      appState: envelope.appState,
      elements: envelope.elements,
    },
    envelope.revision,
    envelope.theme,
    envelope.assetReferences
  );
  return JSON.stringify(stableValue(sanitized));
}

function assertEnvelope(value: unknown): asserts value is CanvasEnvelope {
  if (value == null || typeof value !== "object") {
    throw new CanvasEnvelopeError(
      "invalid-envelope",
      "Canvas envelope must be an object"
    );
  }
  const envelope = toElementRecord(value);
  if (
    envelope.engine !== canvasEngine ||
    envelope.engineVersion !== canvasEngineVersion
  ) {
    throw new CanvasEnvelopeError(
      "unsupported-engine",
      "Canvas envelope engine/version is not supported"
    );
  }
  if (envelope.schemaVersion !== canvasSchemaVersion) {
    throw new CanvasEnvelopeError(
      "unsupported-schema",
      "Canvas envelope schema version is not supported"
    );
  }
  if (
    !Array.isArray(envelope.elements) ||
    !Array.isArray(envelope.assetReferences)
  ) {
    throw new CanvasEnvelopeError(
      "invalid-envelope",
      "Canvas envelope scene is incomplete"
    );
  }
}

export function deserializeEnvelope(
  serialized: string | CanvasEnvelope
): CanvasEnvelope {
  let parsed: unknown;
  try {
    parsed =
      typeof serialized === "string" ? JSON.parse(serialized) : serialized;
  } catch {
    throw new CanvasEnvelopeError(
      "invalid-envelope",
      "Canvas envelope is not valid JSON"
    );
  }
  assertEnvelope(parsed);
  const envelope = parsed;
  const sanitizedElements = sanitizeElements(envelope.elements);
  if (
    sanitizedElements.some((element) =>
      JSON.stringify(element).match(dataUrlRe)
    )
  ) {
    throw new CanvasEnvelopeError(
      "unsafe-data",
      "Canvas envelope contains an inline data URL"
    );
  }
  const refs = normalizeAssetReferences(
    sanitizedElements,
    envelope.assetReferences
  );
  const knownImageFiles = new Set(refs.map((asset) => asset.fileId));
  if (
    sanitizedElements.some((element) => {
      return (
        element.type === "image" &&
        (element.fileId === null ||
          element.fileId === undefined ||
          !knownImageFiles.has(element.fileId))
      );
    })
  ) {
    throw new CanvasEnvelopeError(
      "invalid-envelope",
      "Canvas image elements require a trusted opaque asset ref"
    );
  }
  const elements = sanitizedElements;
  return {
    appState: sanitizeAppState(envelope.appState),
    assetReferences: refs,
    elements,
    engine: canvasEngine,
    engineVersion: canvasEngineVersion,
    revision: Math.max(0, Math.trunc(finiteNumber(envelope.revision))),
    schemaVersion: canvasSchemaVersion,
    theme: envelope.theme === "dark" ? "dark" : "light",
  };
}

function bytesToDataUrl(bytes: Uint8Array, mimeType: string): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}

async function readBytes(
  value: NormalizedStaticAsset["bytes"]
): Promise<Uint8Array> {
  if (value instanceof Uint8Array) {
    return value;
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  return new Uint8Array(await value.arrayBuffer());
}

export async function rehydrateEnvelope(
  envelopeInput: CanvasEnvelope | string,
  assets: readonly NormalizedStaticAsset[]
): Promise<CanvasSceneSnapshot> {
  const envelope = deserializeEnvelope(envelopeInput);
  const byRef = new Map(assets.map((asset) => [asset.ref, asset]));
  const files: BinaryFiles = {};
  for (const asset of envelope.assetReferences) {
    const supplied = byRef.get(asset.ref);
    if (
      !supplied ||
      supplied.fileId !== asset.fileId ||
      supplied.mimeType !== asset.mimeType
    ) {
      continue;
    }
    const bytes = await readBytes(supplied.bytes);
    const binaryFile: BinaryFileData = {
      created: 0,
      dataURL: toDataURL(bytesToDataUrl(bytes, supplied.mimeType)),
      id: toFileId(supplied.fileId),
      mimeType: supplied.mimeType,
      version: 1,
    };
    files[supplied.fileId] = binaryFile;
  }
  return {
    appState: toAppState({
      ...envelope.appState,
      theme: envelope.theme,
      zoom: { value: envelope.appState.zoom },
    }),
    elements: envelope.elements,
    files,
  };
}

export function stripDataUrls(value: unknown): unknown {
  if (typeof value === "string") {
    return isDataUrl(value) ? undefined : value;
  }
  if (Array.isArray(value)) {
    return value.map(stripDataUrls).filter((entry) => entry !== undefined);
  }
  if (value == null || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, entry]) => [key, stripDataUrls(entry)] as const)
      .filter(([, entry]) => entry !== undefined)
  );
}
