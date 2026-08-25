/**
 * Line-level diff for chat UI rendering. Pure functions, no dependencies.
 *
 * The core is a classic LCS dynamic program (equivalent to Myers for our purposes): O(N*M) in
 * the worst case, so inputs are guarded — beyond {@link MAX_DIFF_LINES} lines on either side the
 * common prefix/suffix is trimmed first, and if the remaining middle is still too large the diff
 * degrades to "delete everything, add everything" rather than risking a blow-up.
 */

export interface DiffLine {
  type: "add" | "del" | "ctx";
  text: string;
}

/** Per-side line budget for the quadratic LCS pass (after common prefix/suffix trimming). */
const MAX_DIFF_LINES = 2000;

/** Split into lines on `\n`; an empty string is zero lines and trailing newlines are ignored. */
function splitLines(text: string): string[] {
  const trimmed = text.replace(/\n+$/, "");
  return trimmed === "" ? [] : trimmed.split("\n");
}

/** LCS table diff over already-trimmed line arrays. Callers keep sizes under MAX_DIFF_LINES. */
function lcsDiff(oldLines: string[], newLines: string[]): DiffLine[] {
  const n = oldLines.length;
  const m = newLines.length;
  const width = m + 1;
  // dp[i * width + j] = LCS length of oldLines[i..] and newLines[j..].
  const dp = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    const a = oldLines[i];
    for (let j = m - 1; j >= 0; j--) {
      dp[i * width + j] =
        a === newLines[j]
          ? dp[(i + 1) * width + j + 1] + 1
          : Math.max(dp[(i + 1) * width + j], dp[i * width + j + 1]);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (oldLines[i] === newLines[j]) {
      out.push({ type: "ctx", text: oldLines[i] });
      i++;
      j++;
    } else if (dp[(i + 1) * width + j] >= dp[i * width + j + 1]) {
      // Ties prefer deletions first, so a changed hunk reads as del block followed by add block.
      out.push({ type: "del", text: oldLines[i] });
      i++;
    } else {
      out.push({ type: "add", text: newLines[j] });
      j++;
    }
  }
  while (i < n) out.push({ type: "del", text: oldLines[i++] });
  while (j < m) out.push({ type: "add", text: newLines[j++] });
  return out;
}

export function diffLines(oldText: string, newText: string): DiffLine[] {
  const oldLines = splitLines(oldText);
  const newLines = splitLines(newText);

  // Trim the common prefix/suffix: those lines are context in any minimal diff, and cutting
  // them first is what keeps huge mostly-identical files inside the LCS budget.
  let prefix = 0;
  while (
    prefix < oldLines.length &&
    prefix < newLines.length &&
    oldLines[prefix] === newLines[prefix]
  ) {
    prefix++;
  }
  let suffix = 0;
  while (
    suffix < oldLines.length - prefix &&
    suffix < newLines.length - prefix &&
    oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]
  ) {
    suffix++;
  }
  const oldMiddle = oldLines.slice(prefix, oldLines.length - suffix);
  const newMiddle = newLines.slice(prefix, newLines.length - suffix);

  // Over budget even after trimming: degrade to a whole-file rewrite. Always correct, never
  // quadratic on pathological inputs.
  if (oldMiddle.length > MAX_DIFF_LINES || newMiddle.length > MAX_DIFF_LINES) {
    return [
      ...oldLines.map((text): DiffLine => ({ type: "del", text })),
      ...newLines.map((text): DiffLine => ({ type: "add", text })),
    ];
  }

  const out: DiffLine[] = [];
  for (let k = 0; k < prefix; k++) out.push({ type: "ctx", text: oldLines[k] });
  out.push(...lcsDiff(oldMiddle, newMiddle));
  for (let k = oldLines.length - suffix; k < oldLines.length; k++) {
    out.push({ type: "ctx", text: oldLines[k] });
  }
  return out;
}

export function diffStats(lines: readonly DiffLine[]): { added: number; deleted: number } {
  let added = 0;
  let deleted = 0;
  for (const line of lines) {
    if (line.type === "add") added++;
    else if (line.type === "del") deleted++;
  }
  return { added, deleted };
}
