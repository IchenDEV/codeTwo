/**
Extension → MIME. An image the browser can't decode is better refused than shown broken.
*/
const previewImageTypes: Record<string, string> = {
  avif: "image/avif",
  bmp: "image/bmp",
  gif: "image/gif",
  icns: "image/x-icns",
  ico: "image/x-icon",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  svg: "image/svg+xml",
  webp: "image/webp",
};

/**
ACP image blocks currently use the formats accepted by the core's guarded image reader.
*/
const agentImageExtensions = new Set([
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

export function imageTypeOf(path: string): string | null {
  return previewImageTypes[extensionOf(path)] ?? null;
}

export function isAgentImagePath(path: string): boolean {
  return agentImageExtensions.has(extensionOf(path));
}
