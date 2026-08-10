import type { CanvasExport } from "../bridge";

export const LONG_PROMPT_MAX_LINES = 8;
export const LONG_PROMPT_MAX_CHARS = 600;

/**
 * The current transcript API exposes Canvas history as two internal marker lines. Keep the
 * compatibility parser in one place until the core can expose structured history directly.
 */
export interface CanvasHistoryMarker {
  id: string;
  revision: number;
  title: string;
  textOriginals: string[];
}

const CANVAS_HISTORY_LINE = /^\s*\[canvas-history\s+([^\s\]@]+)@(\d+)\]\s*(.*)\s*$/;
const CANVAS_TEXT_LINE = /^\s*canvas-text:\s?(.*)$/;
const CANVAS_HISTORY_JSON_LINE = /^\s*\[canvas-history-json\s+(.+)\]\s*$/;

function parseCanvasHistoryJson(line: string): CanvasHistoryMarker | null {
  const match = line.match(CANVAS_HISTORY_JSON_LINE);
  if (!match) return null;
  let decoded: unknown;
  try {
    decoded = JSON.parse(match[1]);
  } catch {
    return null;
  }
  if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) return null;
  const value = decoded as Record<string, unknown>;
  if (value.version !== 1) return null;
  if (typeof value.id !== "string" || value.id.trim().length === 0) return null;
  if (!Number.isSafeInteger(value.revision) || (value.revision as number) <= 0) return null;
  if (typeof value.title !== "string" || Array.from(value.title).length > 200) return null;
  if (
    !Array.isArray(value.text_originals) ||
    value.text_originals.length > 64 ||
    !value.text_originals.every(
      (text) => typeof text === "string" && Array.from(text).length <= 2_000,
    )
  ) {
    return null;
  }
  return {
    id: value.id,
    revision: value.revision as number,
    title: value.title,
    textOriginals: [...(value.text_originals as string[])],
  };
}

export function parseCanvasHistoryPrompt(prompt: string): {
  visiblePrompt: string;
  canvases: CanvasHistoryMarker[];
} {
  const visible: string[] = [];
  const canvases: CanvasHistoryMarker[] = [];
  let current: CanvasHistoryMarker | null = null;
  let markerTextContext = false;
  for (const line of prompt.split(/\r?\n/)) {
    const structured = parseCanvasHistoryJson(line);
    if (structured) {
      canvases.push(structured);
      current = structured;
      markerTextContext = false;
      continue;
    }
    const marker = line.match(CANVAS_HISTORY_LINE);
    if (marker) {
      current = {
        id: marker[1],
        revision: Number(marker[2]),
        title: marker[3] || "Canvas",
        textOriginals: [],
      };
      canvases.push(current);
      markerTextContext = true;
      continue;
    }
    const text = line.match(CANVAS_TEXT_LINE);
    if (text) {
      if (current && markerTextContext) {
        if (text[1].trim()) current.textOriginals.push(text[1].trim());
        continue;
      }
      // A user-authored line with this prefix is ordinary prompt text unless it immediately
      // follows a canonical marker. Keep it visible rather than over-stripping history.
      visible.push(line);
      current = null;
      markerTextContext = false;
      continue;
    }
    visible.push(line);
    current = null;
    markerTextContext = false;
  }
  return {
    visiblePrompt: visible.join("\n").replace(/\n{3,}/g, "\n\n").trim(),
    canvases,
  };
}

/** Convert a validated bridge export to a browser image without exposing mutable scene state. */
export function canvasExportDataUrl(item: CanvasExport): string {
  const bytes = Uint8Array.from(item.bytes);
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return `data:${item.mimeType};base64,${btoa(binary)}`;
}

/** Match t3code's long-message boundary without coupling the transcript card to string policy. */
export function isLongPrompt(prompt: string): boolean {
  return (
    Array.from(prompt).length > LONG_PROMPT_MAX_CHARS ||
    prompt.split(/\r?\n/).length > LONG_PROMPT_MAX_LINES
  );
}

/** Keep the collapsed copy inside both limits and avoid splitting a Unicode surrogate pair. */
export function collapsedPrompt(prompt: string): string {
  const lines = prompt.split(/\r?\n/).slice(0, LONG_PROMPT_MAX_LINES).join("\n");
  return Array.from(lines).slice(0, LONG_PROMPT_MAX_CHARS).join("").trimEnd();
}
