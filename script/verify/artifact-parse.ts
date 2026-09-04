import { readFileSync } from "node:fs";
import { sep } from "node:path";

const TITLE_RE = /^#\s+(.+?)\s*$/;
const HEADING_RE = /^##\s+(.+?)\s*$/;

export interface Artifact {
  path: string;
  title: string;
  metadata: Record<string, string>;
  sections: Record<string, string>;
}

export interface ParsedArtifact {
  artifact: Artifact | null;
  errors: string[];
}

export function normalizeHeading(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function unquote(value: string): string {
  if (
    value.length >= 2 &&
    value[0] === value.at(-1) &&
    (value[0] === '"' || value[0] === "'")
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function titleCase(value: string): string {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function parseArtifact(path: string): ParsedArtifact {
  const errors: string[] = [];
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  const displayPath = path.split(sep).join("/");

  if (lines[0]?.trim() !== "---") {
    return {
      artifact: null,
      errors: [`${displayPath}: missing opening YAML frontmatter delimiter`],
    };
  }

  const closing = lines.slice(1).findIndex((line) => line.trim() === "---") + 1;
  if (closing === 0) {
    return {
      artifact: null,
      errors: [`${displayPath}: missing closing YAML frontmatter delimiter`],
    };
  }

  const metadata: Record<string, string> = {};
  for (let index = 1; index < closing; index += 1) {
    const line = lines[index] ?? "";
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const match = /^([a-z_]+):\s*(.*)$/.exec(line);
    if (!match) {
      errors.push(
        `${displayPath}:${index + 1}: frontmatter must use flat scalar key: value fields`,
      );
      continue;
    }
    const [, key, rawValue] = match;
    if (key in metadata) {
      errors.push(`${displayPath}:${index + 1}: duplicate frontmatter field ${key}`);
      continue;
    }
    metadata[key] = unquote(rawValue.trim());
  }

  let title = "";
  let current: string | null = null;
  let buffer: string[] = [];
  const sections: Record<string, string> = {};
  const flush = () => {
    if (current !== null) {
      if (current in sections) {
        errors.push(`${displayPath}: duplicate section ## ${titleCase(current)}`);
      } else {
        sections[current] = buffer.join("\n").trim();
      }
    }
    buffer = [];
  };

  for (const line of lines.slice(closing + 1)) {
    const titleMatch = TITLE_RE.exec(line);
    const headingMatch = HEADING_RE.exec(line);
    if (titleMatch && !title) {
      title = titleMatch[1].trim();
    } else if (headingMatch) {
      flush();
      current = normalizeHeading(headingMatch[1]);
    } else if (current !== null) {
      buffer.push(line);
    }
  }
  flush();

  return { artifact: { path, title, metadata, sections }, errors };
}

export function linkTargets(text: string): string[] {
  return Array.from(text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g), (match) => match[1]);
}

export function labelValue(section: string, label: string): string | null {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^\\s*${escaped}:\\s*(.+?)\\s*$`, "im").exec(section)?.[1].trim() ?? null;
}

export function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export const PLACEHOLDER_RE =
  /^(?:pending|todo|tbd|unassigned|none recorded|not applicable|n\/a|\[fill\]|"")(?:[.:\s].*)?$/i;

export function isConcrete(value: string | null | undefined): boolean {
  return Boolean(value && !PLACEHOLDER_RE.test(value.trim()));
}

export function normalizedActor(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function scopeEntries(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((entry) => entry.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

export function validateScope(value: string | null | undefined, path: string): string[] {
  const errors: string[] = [];
  const entries = scopeEntries(value);
  if (entries.length === 0) return [`${path}: plan requires at least one explicit scope path`];
  for (const entry of entries) {
    const parts = entry.split("/");
    if (
      entry === "." ||
      entry === "*" ||
      entry.startsWith("/") ||
      entry.includes("\\") ||
      parts.some((part) => part === "" || part === "." || part === ".." || part.includes("*"))
    ) {
      errors.push(`${path}: unsafe or broad scope path ${JSON.stringify(entry)}`);
    }
  }
  return errors;
}

export function scopeCovers(scope: string | null | undefined, changedPath: string): boolean {
  return scopeEntries(scope).some(
    (entry) => changedPath === entry || changedPath.startsWith(`${entry}/`),
  );
}

export interface AcceptanceCriterion {
  id: string;
  mark: string;
  text: string;
}

export interface AcceptanceEvidence {
  id: string;
  outcome: string;
  detail: string;
}

const V2_CRITERION_RE = /^\s*-\s+\[([ xX])\]\s+(AC-\d+):\s+(.+?)\s*$/gm;
const V2_EVIDENCE_RE =
  /^\s*-\s+(AC-\d+):\s+(PASS|FAIL|BLOCKED)\b\s*(?:[—-]\s*)?(.+?)\s*$/gim;

export function v2Criteria(spec: string): AcceptanceCriterion[] {
  return Array.from(spec.matchAll(V2_CRITERION_RE), (match) => ({
    mark: match[1],
    id: match[2].toUpperCase(),
    text: match[3].trim(),
  }));
}

export function v2Evidence(verification: string): AcceptanceEvidence[] {
  return Array.from(verification.matchAll(V2_EVIDENCE_RE), (match) => ({
    id: match[1].toUpperCase(),
    outcome: match[2].toUpperCase(),
    detail: match[3].trim(),
  }));
}

export function duplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return Array.from(repeated).sort();
}

export function hasLinkTo(section: string, pathPart: string): boolean {
  return linkTargets(section).some((target) => target.includes(pathPart));
}

export function hasBlocker(section: string): boolean {
  return isConcrete(labelValue(section, "Blocked"));
}

export function hasVerificationEvidence(section: string): boolean {
  const hasResult = /\b(?:pass(?:ed)?|fail(?:ed)?|blocked|verified)\b/i.test(section);
  const hasSubject = section.includes("`") || linkTargets(section).length > 0 || section.includes("|");
  return hasResult && hasSubject;
}
