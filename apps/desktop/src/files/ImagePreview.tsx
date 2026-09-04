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

export function ImagePreview({
  cwd,
  path,
}: {
  readonly cwd: string;
  readonly path: string;
}) {
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
      .catch((error) => isAlive && setError(String(error)));

    return () => {
      isAlive = false;
      // Revoking is what actually frees the bytes; without it every tab switch leaks the file.
      if (objectUrl != null && objectUrl !== "") {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [cwd, path]);

  if (error != null && error !== "") {
    return <p className="text-body text-destructive px-6 py-4">{error}</p>;
  }

  if (url == null || url === "") {
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
}
