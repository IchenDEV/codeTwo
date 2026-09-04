/**
Extension → MIME. An image the browser can't decode is better refused than shown broken.
*/
const PREVIEW_IMAGE_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  bmp: "image/bmp",
  ico: "image/x-icon",
  icns: "image/x-icns",
  svg: "image/svg+xml",
};

/**
ACP image blocks currently use the formats accepted by the core's guarded image reader.
*/
const AGENT_IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "svg",
]);

function extensionOf(path: string): string {
  return path.split(".").pop()?.toLowerCase() ?? "";
}

/**
The MIME to preview `path` as, or null when it belongs in the text editor.
*/
export function imageTypeOf(path: string): string | null {
  return PREVIEW_IMAGE_TYPES[extensionOf(path)] ?? null;
}

/**
Whether an `@` workspace reference should be sent as pixels rather than decoded as text.
*/
export function isAgentImagePath(path: string): boolean {
  return AGENT_IMAGE_EXTENSIONS.has(extensionOf(path));
}
