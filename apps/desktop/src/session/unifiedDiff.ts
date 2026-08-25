/**
 * Extracts unified diffs embedded in tool text output (many CLI tools print diffs inline).
 * Handles both the standard multi-file `diff --git a/x b/y` format and bare
 * `--- a/x` / `+++ b/y` + `@@ -a,b +c,d @@` blocks.
 */

import type { DiffLine } from "./lineDiff";

export interface UnifiedDiffFile {
  path: string;
  added: number;
  deleted: number;
  lines: DiffLine[];
}

const HUNK_HEADER = /^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@/;

/** Cheap pre-check so callers can skip the full parse for ordinary text. */
export function looksLikeUnifiedDiff(text: string): boolean {
  if (text.includes("diff --git")) return true;
  return text.includes("--- ") && text.includes("+++ ") && text.includes("@@ -");
}

/** Normalise a raw header path: drop timestamps (`diff -u`), quotes, and the a//b/ prefix. */
function cleanPath(raw: string, sidePrefix: string): string {
  let path = raw.trim().replace(/\t.*$/, "");
  if (path.startsWith('"') && path.endsWith('"') && path.length >= 2) {
    path = path.slice(1, -1);
  }
  if (path.startsWith(sidePrefix)) path = path.slice(sidePrefix.length);
  return path;
}

export function parseUnifiedDiff(text: string): UnifiedDiffFile[] {
  const files: UnifiedDiffFile[] = [];
  let current: UnifiedDiffFile | null = null;
  // Path from the current file's `---` line, kept so `+++ /dev/null` can fall back to it.
  let oldPath: string | null = null;
  // Whether the current file already saw its `+++` line — the next `---` then starts a new
  // file in the bare (header-only) format.
  let sawNewPath = false;
  let inHunk = false;
  let oldRemain = 0;
  let newRemain = 0;

  const lines = text.replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n");
  for (const line of lines) {
    // Hunk body first: a `--- ` or `+++ ` here is content, not a header. Hunk line counts
    // from the `@@` header decide when the hunk ends, so mis-nested headers can't occur.
    if (inHunk && current) {
      const c = line.charAt(0);
      if (c === "\\") continue; // "\ No newline at end of file"
      if (c === "+" || c === "-" || c === " " || c === "") {
        if (c === "+") {
          current.lines.push({ type: "add", text: line.slice(1) });
          current.added++;
          newRemain--;
        } else if (c === "-") {
          current.lines.push({ type: "del", text: line.slice(1) });
          current.deleted++;
          oldRemain--;
        } else {
          // A bare empty line is an empty context line (many generators drop the space).
          current.lines.push({ type: "ctx", text: line.slice(1) });
          oldRemain--;
          newRemain--;
        }
        if (oldRemain <= 0 && newRemain <= 0) inHunk = false;
        continue;
      }
      inHunk = false; // malformed: hunk ended early; re-read this line as a header below
    }

    if (line.startsWith("diff --git ")) {
      current = { path: "", added: 0, deleted: 0, lines: [] };
      files.push(current);
      sawNewPath = false;
      inHunk = false;
      oldPath = null;
      // Best-effort path from the header itself; the `---`/`+++` lines refine it.
      const header = /^diff --git (\S+) (\S+)/.exec(line);
      if (header) {
        oldPath = cleanPath(header[1], "a/");
        current.path = cleanPath(header[2], "b/");
      }
      continue;
    }

    if (line.startsWith("--- ")) {
      if (!current || sawNewPath) {
        current = { path: "", added: 0, deleted: 0, lines: [] };
        files.push(current);
        sawNewPath = false;
        inHunk = false;
      }
      const raw = cleanPath(line.slice(4), "a/");
      oldPath = raw === "/dev/null" ? null : raw;
      continue;
    }

    if (line.startsWith("+++ ")) {
      if (!current) continue;
      sawNewPath = true;
      const raw = cleanPath(line.slice(4), "b/");
      // Deleted files report `+++ /dev/null`: fall back to the `---` (a/) side.
      current.path = raw === "/dev/null" ? (oldPath ?? current.path) : raw;
      continue;
    }

    const hunk = HUNK_HEADER.exec(line);
    if (hunk && current) {
      inHunk = true;
      oldRemain = hunk[1] === undefined ? 1 : Number.parseInt(hunk[1], 10);
      newRemain = hunk[2] === undefined ? 1 : Number.parseInt(hunk[2], 10);
      continue;
    }
    // Everything else (index/mode lines, commit text, tool chatter) is ignored.
  }
  return files;
}
