/**
 * Fix @typescript-eslint/strict-boolean-expressions from an eslint JSON report.
 *
 * Single-line only. If the flagged expr is the operand of unary `!`, the bang
 * is included and the condition is inverted (avoids `!x != null` bugs).
 * Skips call expressions and `||` / assignment value contexts that need a
 * ternary rather than a boolean rewrite.
 */
import { readFileSync, writeFileSync } from "node:fs";

interface Msg {
  ruleId: string | null;
  message: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
}
interface FileResult {
  filePath: string;
  messages: Msg[];
}

const reportPath = process.argv[2] ?? "/tmp/eslint-bool.json";
const report = JSON.parse(readFileSync(reportPath, "utf-8")) as FileResult[];

let filesChanged = 0;
let fixes = 0;
let skipped = 0;

function wrap(expr: string): string {
  return /[?:|&]/.test(expr) ? `(${expr})` : expr;
}

function positiveCheck(message: string, expr: string): string | null {
  const e = wrap(expr);
  if (message.includes("nullable string")) {
    return `${e} != null && ${e} !== ""`;
  }
  if (message.includes("nullable number")) {
    return `${e} != null`;
  }
  if (
    message.includes("nullable boolean") ||
    message.includes("boolean | null") ||
    message.includes("boolean | undefined")
  ) {
    return `${e} === true`;
  }
  if (message.includes("number value")) {
    return `${e} !== 0`;
  }
  if (message.includes("string value")) {
    return `${e} !== ""`;
  }
  if (
    message.includes("any value") ||
    message.includes("Unexpected any") ||
    message.includes("nullable object") ||
    message.includes("object value")
  ) {
    // Prefer nullish for narrowing into Object.entries / typeof object.
    return `${e} != null`;
  }
  return `${e} != null`;
}

function invertedCheck(message: string, expr: string): string | null {
  const e = wrap(expr);
  if (message.includes("nullable string")) {
    return `${e} == null || ${e} === ""`;
  }
  if (message.includes("nullable number")) {
    return `${e} == null`;
  }
  if (
    message.includes("nullable boolean") ||
    message.includes("boolean | null") ||
    message.includes("boolean | undefined")
  ) {
    return `${e} !== true`;
  }
  if (message.includes("number value")) {
    return `${e} === 0`;
  }
  if (message.includes("string value")) {
    return `${e} === ""`;
  }
  return `${e} == null`;
}

function isUnsafeExpr(expr: string): boolean {
  const trimmed = expr.trim();
  if (trimmed == null || trimmed === "") {
    return true;
  }
  if (trimmed.startsWith("Boolean(")) {
    return true;
  }
  if (trimmed.includes("!=") || trimmed.includes("===")) {
    return true;
  }
  // Member-span / UTF-8 column bugs can clip `a || b` mid-string; never rewrite those.
  if (trimmed.includes("||") || trimmed.includes("&&")) {
    return true;
  }
  if (/\w\s*\(/u.test(trimmed) || trimmed.includes("await ")) {
    return true;
  }
  if (trimmed.length > 80) {
    return true;
  }
  return false;
}

for (const file of report) {
  const targets = file.messages
    .filter((m) => m.ruleId === "@typescript-eslint/strict-boolean-expressions")
    .filter((m) => m.endLine != null && m.endColumn != null)
    .sort((a, b) => b.line - a.line || b.column - a.column);
  if (targets.length === 0) {
    continue;
  }

  const original = readFileSync(file.filePath, "utf-8");
  const lines = original.split("\n");
  let changed = false;

  for (const message of targets) {
    const startLine = message.line - 1;
    const endLine = (message.endLine ?? message.line) - 1;
    if (startLine !== endLine) {
      skipped += 1;
      continue;
    }

    const row = lines[startLine];
    if (!row) {
      skipped += 1;
      continue;
    }
    let startCol = message.column - 1;
    const endCol = (message.endColumn ?? message.column) - 1;
    const expr = row.slice(startCol, endCol);
    if (isUnsafeExpr(expr)) {
      skipped += 1;
      continue;
    }

    // Skip value-producing `||` / `&&` fallbacks: `a || b`, `a && b` assigned
    // or returned as a non-boolean value. Only rewrite when clearly a condition.
    const after = row.slice(endCol).trimStart();
    const before = row.slice(0, startCol);
    const inValueCoalesce =
      after.startsWith("||") ||
      /\|\|\s*$/.test(before.trimEnd()) ||
      /:\s*$/.test(before.trimEnd());
    if (inValueCoalesce) {
      skipped += 1;
      continue;
    }

    const bang =
      startCol > 0 &&
      row[startCol - 1] === "!" &&
      (startCol === 1 || !/[\w$]/.test(row[startCol - 2] ?? ""));
    if (bang) {
      startCol -= 1;
    }

    let replacement = bang
      ? invertedCheck(message.message, expr)
      : positiveCheck(message.message, expr);
    if (replacement == null || replacement === "") {
      skipped += 1;
      continue;
    }

    // Bang expansions become `a == null || a === ""` and must be parenthesized
    // when nested under && / || / ternary, or the || binds too loosely.
    const prev = row.slice(0, startCol).trimEnd();
    if (
      replacement.includes("||") &&
      !replacement.startsWith("(") &&
      /(?:&&|\|\||[?:!(,=])$/.test(prev)
    ) {
      replacement = `(${replacement})`;
    }

    lines[startLine] = row.slice(0, startCol) + replacement + row.slice(endCol);
    changed = true;
    fixes += 1;
  }

  if (changed) {
    writeFileSync(file.filePath, lines.join("\n"));
    filesChanged += 1;
  }
}

console.log(JSON.stringify({ filesChanged, fixes, skipped }));
