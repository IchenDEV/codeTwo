import type { CanvasExport } from "../bridge";

export const longPromptMaxLines = 8;
export const longPromptMaxChars = 600;

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

const canvasHistoryLine =
  /^\s*\[canvas-history\s+([^\s\]@]+)@(\d+)\]\s*(.*)\s*$/u;
const canvasTextLine = /^\s*canvas-text:\s?(.*)$/u;
const canvasHistoryJsonLine = /^\s*\[canvas-history-json\s+(.+)\]\s*$/u;

function parseCanvasHistoryJson(line: string): CanvasHistoryMarker | null {
  const match = canvasHistoryJsonLine.exec(line);
  if (!match) {
    return null;
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(match[1]);
  } catch {
    return null;
  }
  if (
    decoded == null ||
    typeof decoded !== "object" ||
    Array.isArray(decoded)
  ) {
    return null;
  }
  const value = decoded as Record<string, unknown>;
  if (value.version !== 1) {
    return null;
  }
  if (typeof value.id !== "string" || value.id.trim().length === 0) {
    return null;
  }
  if (
    !Number.isSafeInteger(value.revision) ||
    (value.revision as number) <= 0
  ) {
    return null;
  }
  if (typeof value.title !== "string" || [...value.title].length > 200) {
    return null;
  }
  if (
    !Array.isArray(value.text_originals) ||
    value.text_originals.length > 64 ||
    value.text_originals.some(
      (text) => !(typeof text === "string" && [...text].length <= 2000)
    )
  ) {
    return null;
  }
  return {
    id: value.id,
    revision: value.revision as number,
    textOriginals: [...(value.text_originals as string[])],
    title: value.title,
  };
}

export function parseCanvasHistoryPrompt(prompt: string): {
  visiblePrompt: string;
  canvases: CanvasHistoryMarker[];
} {
  const visible: string[] = [];
  const canvases: CanvasHistoryMarker[] = [];
  let current: CanvasHistoryMarker | null = null;
  let isMarkerTextContext = false;
  for (const line of prompt.split(/\r?\n/u)) {
    const structured = parseCanvasHistoryJson(line);
    if (structured) {
      canvases.push(structured);
      current = structured;
      isMarkerTextContext = false;
      continue;
    }
    const marker = canvasHistoryLine.exec(line);
    if (marker) {
      current = {
        id: marker[1],
        revision: Number(marker[2]),
        textOriginals: [],
        title: marker[3] || "Canvas",
      };
      canvases.push(current);
      isMarkerTextContext = true;
      continue;
    }
    const text = canvasTextLine.exec(line);
    if (text) {
      if (current && isMarkerTextContext) {
        if (text[1].trim()) {
          current.textOriginals.push(text[1].trim());
        }
        continue;
      }
      // A user-authored line with this prefix is ordinary prompt text unless it immediately
      // follows a canonical marker. Keep it visible rather than over-stripping history.
      visible.push(line);
      current = null;
      isMarkerTextContext = false;
      continue;
    }
    visible.push(line);
    current = null;
    isMarkerTextContext = false;
  }
  return {
    canvases,
    visiblePrompt: visible
      .join("\n")
      .replaceAll(/\n{3,}/gu, "\n\n")
      .trim(),
  };
}

export function canvasExportDataUrl(item: CanvasExport): string {
  const bytes = Uint8Array.from(item.bytes);
  let binary = "";
  const chunkSize = 0x80_00;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, offset + chunkSize)
    );
  }
  return `data:${item.mimeType};base64,${btoa(binary)}`;
}

export function isLongPrompt(prompt: string): boolean {
  return (
    [...prompt].length > longPromptMaxChars ||
    prompt.split(/\r?\n/u).length > longPromptMaxLines
  );
}

export function collapsedPrompt(prompt: string): string {
  const lines = prompt.split(/\r?\n/u).slice(0, longPromptMaxLines).join("\n");
  return [...lines].slice(0, longPromptMaxChars).join("").trimEnd();
}
