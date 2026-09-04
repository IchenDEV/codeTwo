import { useEffect, useState } from "react";
import { Spinner } from "@/components/ui/spinner";

import { readBinary } from "../bridge";
import { useT } from "../i18n";
import { imageTypeOf } from "./imageTypes";

function prettySize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * An image file, shown as the image.
 *
 * The text path can't serve these: `read_text` refuses anything with a NUL byte in the first block,
 * which is every PNG ever written, so a picture used to open as the word "binary file". The bytes
 * come over the sidecar JSON protocol and become a blob URL — a `data:` URI would mean base64'ing
 * the same bytes again for no benefit.
 *
 * Checkerboard behind the image, because transparent PNGs are most of what a UI project contains
 * and "white logo on white pane" looks like a failed load.
 */
export const ImagePreview = ({
  cwd,
  path,
}: {
  readonly cwd: string;
  readonly path: string;
}) => {
  const t = useT();
  const [url, setUrl] = useState<string | null>(null);
  const [size, setSize] = useState(0);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isAlive = true;
    let objectUrl: string | null = null;
    setUrl(null);
    setDims(null);
    setError(null);

    readBinary(cwd, path)
      .then((bytes) => {
        if (!isAlive) {
          return;
        }
        const type = imageTypeOf(path) ?? "application/octet-stream";
        // Copy into a fresh ArrayBuffer: the IPC buffer may be a view into a larger one.
        objectUrl = URL.createObjectURL(
          new Blob([bytes.slice().buffer as ArrayBuffer], { type })
        );
        setSize(bytes.byteLength);
        setUrl(objectUrl);
      })
      .catch((e) => isAlive && setError(String(e)));

    return () => {
      isAlive = false;
      // Revoking is what actually frees the bytes; without it every tab switch leaks the file.
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [cwd, path]);

  if (error) {
    return <p className="text-body text-destructive px-6 py-4">{error}</p>;
  }

  if (!url) {
    return (
      <p className="text-body text-muted-foreground flex items-center gap-2 px-6 py-4">
        <Spinner className="size-3.5" />
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
            setDims({
              h: e.currentTarget.naturalHeight,
              w: e.currentTarget.naturalWidth,
            })
          }
          onError={() => setError(t("files.imageFailed"))}
          className="image-checker rounded-control max-h-full max-w-full object-contain shadow-sm"
        />
      </div>
      <div className="text-callout text-muted-foreground flex shrink-0 items-center justify-center gap-3 border-t px-3 py-1.5">
        {dims ? (
          <span>
            {dims.w} × {dims.h}
          </span>
        ) : null}
        <span>{prettySize(size)}</span>
      </div>
    </div>
  );
};
