import type { BinaryFileData } from "./excalidrawAdapter";

export const MEDIA_LIMITS = {
  maxInputs: 16,
  maxInputBytes: 20 * 1024 * 1024,
  maxOutputBytes: 20 * 1024 * 1024,
} as const;

export type AcceptedMediaMime = "image/png" | "image/webp";

export interface CanvasMediaInput {
  bytes: Uint8Array | ArrayBuffer | Blob;
  mimeType: string;
  name?: string;
}

export interface NormalizedCanvasMedia {
  /** Trusted opaque asset identity assigned by the normalizer/core boundary. */
  ref: string;
  bytes: Uint8Array | ArrayBuffer | Blob;
  mimeType: AcceptedMediaMime;
  name?: string;
  width?: number;
  height?: number;
}

export type CanvasMediaNormalizer = (
  input: CanvasMediaInput
) => Promise<NormalizedCanvasMedia | null>;

export class CanvasMediaError extends Error {
  readonly code:
    | "normalizer-required"
    | "input-budget"
    | "output-budget"
    | "unsupported-output"
    | "normalizer-rejected";

  constructor(code: CanvasMediaError["code"], message: string) {
    super(message);
    this.name = "CanvasMediaError";
    this.code = code;
  }
}

export interface CanvasMediaIntakeOptions {
  normalize: CanvasMediaNormalizer;
  onAsset: (asset: BinaryFileData, media: NormalizedCanvasMedia) => void;
  maxInputs?: number;
  maxInputBytes?: number;
  maxOutputBytes?: number;
  createFileId?: (media: NormalizedCanvasMedia, index: number) => string;
}

function byteLength(
  value: CanvasMediaInput["bytes"] | NormalizedCanvasMedia["bytes"]
): number {
  if (value instanceof Uint8Array) return value.byteLength;
  if (value instanceof ArrayBuffer) return value.byteLength;
  return value.size;
}

async function asUint8Array(
  value: NormalizedCanvasMedia["bytes"]
): Promise<Uint8Array> {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return new Uint8Array(await value.arrayBuffer());
}

function asDataUrl(bytes: Uint8Array, mimeType: AcceptedMediaMime): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:${mimeType};base64,${btoa(binary)}`;
}

function defaultFileId(index: number): string {
  return `canvas-file-${index + 1}`;
}

function assertOpaqueRef(
  value: unknown,
  index: number
): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 160 ||
    /^(?:data:|blob:|https?:|javascript:)/i.test(value) ||
    /[\\/\s]/.test(value)
  ) {
    throw new CanvasMediaError(
      "normalizer-rejected",
      `Canvas media normalizer returned an invalid opaque ref for input ${index + 1}`
    );
  }
}

/**
 * The one media intake path used by paste, drop, and the local picker. The normalizer is required;
 * callers cannot accidentally pass raw SVG/GIF/JPEG bytes to Excalidraw.
 */
export async function intakeCanvasMedia(
  inputs: readonly CanvasMediaInput[],
  options: CanvasMediaIntakeOptions
): Promise<readonly BinaryFileData[]> {
  if (typeof options.normalize !== "function") {
    throw new CanvasMediaError(
      "normalizer-required",
      "Canvas media normalizer callback is required"
    );
  }
  const maxInputs = options.maxInputs ?? MEDIA_LIMITS.maxInputs;
  const maxInputBytes = options.maxInputBytes ?? MEDIA_LIMITS.maxInputBytes;
  const maxOutputBytes = options.maxOutputBytes ?? MEDIA_LIMITS.maxOutputBytes;
  if (inputs.length > maxInputs) {
    throw new CanvasMediaError(
      "input-budget",
      `Canvas media input count exceeds ${maxInputs}`
    );
  }
  const inputBytes = inputs.reduce(
    (sum, input) => sum + byteLength(input.bytes),
    0
  );
  if (inputBytes > maxInputBytes) {
    throw new CanvasMediaError(
      "input-budget",
      `Canvas media input bytes exceed ${maxInputBytes}`
    );
  }
  const files: BinaryFileData[] = [];
  let outputBytes = 0;
  for (const [index, input] of inputs.entries()) {
    const normalized = await options.normalize(input);
    if (!normalized)
      throw new CanvasMediaError(
        "normalizer-rejected",
        `Canvas media input ${index + 1} was rejected by the normalizer`
      );
    assertOpaqueRef(normalized.ref, index);
    if (
      normalized.mimeType !== "image/png" &&
      normalized.mimeType !== "image/webp"
    ) {
      throw new CanvasMediaError(
        "unsupported-output",
        "Canvas media normalizer must return PNG or WebP"
      );
    }
    const size = byteLength(normalized.bytes);
    outputBytes += size;
    if (outputBytes > maxOutputBytes) {
      throw new CanvasMediaError(
        "output-budget",
        `Normalized canvas media exceeds ${maxOutputBytes} bytes`
      );
    }
    const bytes = await asUint8Array(normalized.bytes);
    const fileId =
      options.createFileId?.(normalized, index) ?? defaultFileId(index);
    const file: BinaryFileData = {
      id: fileId as BinaryFileData["id"],
      mimeType: normalized.mimeType,
      dataURL: asDataUrl(
        bytes,
        normalized.mimeType
      ) as BinaryFileData["dataURL"],
      created: 0,
      version: 1,
    };
    files.push(file);
    options.onAsset(file, normalized);
  }
  return files;
}

export function mediaInputFromFile(file: File): CanvasMediaInput {
  return {
    bytes: file,
    mimeType: file.type || "application/octet-stream",
    name: file.name,
  };
}

export function mediaInputsFromDataTransfer(
  dataTransfer: DataTransfer | null | undefined
): readonly CanvasMediaInput[] {
  if (!dataTransfer) return [];
  return Array.from(dataTransfer.files ?? []).map(mediaInputFromFile);
}

export function mediaInputsFromClipboard(
  event: ClipboardEvent | null | undefined
): readonly CanvasMediaInput[] {
  return mediaInputsFromDataTransfer(event?.clipboardData);
}
