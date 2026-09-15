import { useEffect, useState } from "react";

import { Download, FolderOpen } from "@/components/ui/icons";
import { TooltipButton } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import {
  getArtifact,
  readArtifactText,
  revealArtifact,
  saveArtifactAs,
} from "../bridge";
import type { ArtifactRef } from "../bridge";
import { MarkdownContent } from "./MarkdownContent";

type PreviewKind = "image" | "markup" | "markdown" | "text" | "download";

/** Classify a stored artifact's mime into the preview branch it should use. */
export function artifactPreviewKind(mimeType: string): PreviewKind {
  const value = mimeType.toLowerCase();
  if (value === "text/html" || value.startsWith("image/svg")) return "markup";
  if (value.startsWith("image/")) return "image";
  if (value === "text/markdown") return "markdown";
  if (
    value.startsWith("text/") ||
    value === "application/json" ||
    value.endsWith("+json") ||
    value === "application/xml" ||
    value.endsWith("+xml")
  ) {
    return "text";
  }
  return "download";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * One renderer for any delivered artifact: raster images, HTML/SVG markup, markdown, and structured
 * or plain text, each with Save As and Reveal. Unknown binaries degrade to a metadata card with
 * download only, so nothing silently disappears from the transcript.
 */
export function ArtifactPreview({ artifact }: { artifact: ArtifactRef }) {
  const kind = artifactPreviewKind(artifact.mime_type);
  const [text, setText] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    let objectUrl: string | null = null;
    setText(null);
    setImageUrl(null);
    setError(null);
    if (kind === "image") {
      void getArtifact(artifact.id)
        .then((bytes) => {
          if (!alive) return;
          objectUrl = URL.createObjectURL(
            new Blob([Uint8Array.from(bytes).buffer], {
              type: artifact.mime_type,
            })
          );
          setImageUrl(objectUrl);
        })
        .catch(() => alive && setError("Preview unavailable"));
    } else if (kind !== "download") {
      void readArtifactText(artifact.id)
        .then((value) => {
          if (alive) setText(value);
        })
        .catch(() => alive && setError("Preview unavailable"));
    }
    return () => {
      alive = false;
      if (objectUrl != null && objectUrl !== "") URL.revokeObjectURL(objectUrl);
    };
  }, [artifact.id, artifact.mime_type, kind]);

  return (
    <figure className="rounded-module bg-fill-quiet min-w-0 overflow-hidden border">
      <div
        className={cn(
          "flex min-h-32 items-center justify-center overflow-auto",
          kind === "image" && "image-checker"
        )}
        data-artifact-preview={kind}
      >
        {error === null ? (
          kind === "image" ? (
            imageUrl != null && imageUrl !== "" ? (
              <img
                src={imageUrl}
                alt={artifact.display_name}
                className="max-h-96 w-full object-contain"
              />
            ) : (
              <span className="text-callout text-muted-foreground px-4 py-10">
                Loading image…
              </span>
            )
          ) : kind === "markup" ? (
            <iframe
              title={artifact.display_name}
              srcDoc={text ?? ""}
              sandbox="allow-scripts"
              className="h-80 w-full bg-white"
            />
          ) : kind === "markdown" ? (
            <div className="max-h-96 w-full overflow-auto p-3 text-left">
              <MarkdownContent text={text ?? ""} />
            </div>
          ) : kind === "text" ? (
            <pre className="text-callout max-h-96 w-full overflow-auto p-3 text-left whitespace-pre-wrap">
              {text ?? ""}
            </pre>
          ) : (
            <span className="text-callout text-muted-foreground px-4 py-8 text-center">
              {artifact.mime_type} — download to open.
            </span>
          )
        ) : (
          <span className="text-callout text-destructive px-4 py-10">
            {error}
          </span>
        )}
      </div>
      <figcaption className="bg-background/60 text-callout text-muted-foreground flex flex-wrap items-center gap-2 px-2.5 py-2">
        <span className="text-foreground min-w-0 flex-1 truncate">
          {artifact.display_name}
        </span>
        {kind === "image" ? (
          <span>
            {artifact.width} × {artifact.height}
          </span>
        ) : (
          <span className="truncate">{artifact.mime_type}</span>
        )}
        <span>{formatBytes(artifact.bytes)}</span>
        <TooltipButton
          type="button"
          variant="ghost"
          size="icon-xs"
          label="Save As"
          onClick={() => {
            setActionError(null);
            void saveArtifactAs(artifact.id, artifact.display_name).catch(() =>
              setActionError("Could not save")
            );
          }}
        >
          <Download className="size-3.5" />
        </TooltipButton>
        <TooltipButton
          type="button"
          variant="ghost"
          size="icon-xs"
          label="Reveal in file manager"
          onClick={() => {
            setActionError(null);
            void revealArtifact(artifact.id).catch(() =>
              setActionError("Could not reveal")
            );
          }}
        >
          <FolderOpen className="size-3.5" />
        </TooltipButton>
        {actionError != null && actionError !== "" && (
          <span className="text-destructive basis-full">{actionError}</span>
        )}
      </figcaption>
    </figure>
  );
}
