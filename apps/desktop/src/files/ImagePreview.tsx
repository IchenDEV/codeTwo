import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { readBinary } from "../bridge";
import { useT } from "../i18n";

/** Extension → MIME. An image the browser can't decode is better refused than shown as a broken box. */
const IMAGE_TYPES: Record<string, string> = {
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

/** The MIME to preview `path` as, or null when it isn't an image and belongs in the editor. */
export function imageTypeOf(path: string): string | null {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_TYPES[ext] ?? null;
}

function prettySize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * An image file, shown as the image.
 *
 * The text path can't serve these: `read_text` refuses anything with a NUL byte in the first block,
 * which is every PNG ever written, so a picture used to open as the word "binary file". The bytes
 * come over Tauri's binary IPC and become a blob URL — a `data:` URI would mean base64'ing
 * megabytes through the JSON bridge for no benefit.
 *
 * Checkerboard behind the image, because transparent PNGs are most of what a UI project contains
 * and "white logo on white pane" looks like a failed load.
 */
export function ImagePreview({ cwd, path }: { cwd: string; path: string }) {
  const t = useT();
  const [url, setUrl] = useState<string | null>(null);
  const [size, setSize] = useState(0);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    let objectUrl: string | null = null;
    setUrl(null);
    setDims(null);
    setError(null);

    readBinary(cwd, path)
      .then((bytes) => {
        if (!alive) return;
        const type = imageTypeOf(path) ?? "application/octet-stream";
        // Copy into a fresh ArrayBuffer: the IPC buffer may be a view into a larger one.
        objectUrl = URL.createObjectURL(new Blob([bytes.slice().buffer as ArrayBuffer], { type }));
        setSize(bytes.byteLength);
        setUrl(objectUrl);
      })
      .catch((e) => alive && setError(String(e)));

    return () => {
      alive = false;
      // Revoking is what actually frees the bytes; without it every tab switch leaks the file.
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [cwd, path]);

  if (error) return <p className="px-6 py-4 text-ui text-destructive">{error}</p>;

  if (!url) {
    return (
      <p className="flex items-center gap-2 px-6 py-4 text-ui text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        {t("files.loading")}
      </p>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-6">
        <img
          src={url}
          alt={path}
          onLoad={(e) =>
            setDims({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })
          }
          onError={() => setError(t("files.imageFailed"))}
          className="image-checker max-h-full max-w-full rounded-md object-contain shadow-sm"
        />
      </div>
      <div className="flex shrink-0 items-center justify-center gap-3 border-t px-3 py-1.5 text-fine text-muted-foreground">
        {dims && (
          <span>
            {dims.w} × {dims.h}
          </span>
        )}
        <span>{prettySize(size)}</span>
      </div>
    </div>
  );
}
