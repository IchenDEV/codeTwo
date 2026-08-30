#!/usr/bin/env bun

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const REQUIRED_FILES = [
  "docs/sdlc/workflow.md",
  "docs/sdlc/templates/change.md",
  "docs/sdlc/templates/incident.md",
  "docs/sdlc/templates/eval.md",
] as const;

const LEGACY_PATHS = [
  "docs/superpowers",
  "docs/sdlc/specs",
  "docs/sdlc/plans",
  "docs/sdlc/changes/2026-08-29-sdlc-bootstrap.md",
  "docs/sdlc/evals/legacy-workflow-single-source.md",
] as const;

const ARTIFACT_KINDS = {
  changes: "change",
  incidents: "incident",
  evals: "eval",
} as const;

type ArtifactKind = (typeof ARTIFACT_KINDS)[keyof typeof ARTIFACT_KINDS];

const ALLOWED_STATUSES: Record<ArtifactKind, Set<string>> = {
  change: new Set([
    "draft",
    "in-review",
    "accepted",
    "executing",
    "blocked",
    "failed",
    "verified",
    "ready-to-release",
    "released",
    "closed",
    "superseded",
  ]),
  incident: new Set([
    "draft",
    "investigating",
    "mitigated",
    "blocked",
    "resolved",
    "closed",
    "superseded",
  ]),
  eval: new Set(["draft", "active", "blocked", "failed", "retired"]),
};

const REQUIRED_SECTIONS: Record<ArtifactKind, readonly string[]> = {
  change: [
    "intent",
    "spec",
    "decision and gates",
    "plan",
    "build",
    "verification",
    "review and release",
    "feedback",
  ],
  incident: [
    "detection and impact",
    "timeline",
    "diagnosis",
    "mitigation and recovery",
    "follow-ups",
    "regression eval",
  ],
  eval: [
    "provenance",
    "fixed input and environment",
    "allowed actions",
    "observable acceptance",
    "scoring and failure classes",
    "last result",
  ],
};

const REQUIRED_FIELDS = [
  "id",
  "kind",
  "status",
  "owner",
  "approvers",
  "created",
  "updated",
  "source",
  "inputs",
  "outputs",
  "next_trigger",
] as const;

const ADVANCED_CHANGE_STATUSES = new Set([
  "accepted",
  "executing",
  "failed",
  "verified",
  "ready-to-release",
  "released",
  "closed",
]);
const BUILD_CHANGE_STATUSES = new Set([
  "executing",
  "failed",
  "verified",
  "ready-to-release",
  "released",
  "closed",
]);
const VERIFIED_CHANGE_STATUSES = new Set([
  "verified",
  "ready-to-release",
  "released",
  "closed",
]);

const SCHEMA_V2 = "2";
const CHANGE_BUNDLE_RE = /^docs\/sdlc\/changes\/\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*\/change\.md$/;
const RISK_LEVELS = new Set(["low", "medium", "high", "critical"]);
const INDEPENDENT_RISK_LEVELS = new Set(["high", "critical"]);
const VERIFICATION_MODES = new Set(["owner", "fresh-context", "human", "pair"]);
const V2_REQUIRED_FIELDS = [
  "schema",
  "risk",
  "scope",
  "approved_at",
  "verification_mode",
  "verified_by",
  "verified_at",
] as const;

const ID_RE = /^[a-z0-9][a-z0-9-]{5,95}$/;
const TITLE_RE = /^#\s+(.+?)\s*$/;
const HEADING_RE = /^##\s+(.+?)\s*$/;
const CHECKBOX_RE = /^\s*-\s+\[([ xX])\]\s+\S/gm;
const V2_CRITERION_RE = /^\s*-\s+\[([ xX])\]\s+(AC-\d+):\s+(.+?)\s*$/gm;
const V2_EVIDENCE_RE =
  /^\s*-\s+(AC-\d+):\s+(PASS|FAIL|BLOCKED)\b\s*(?:[—-]\s*)?(.+?)\s*$/gim;
const PLACEHOLDER_RE = /^(?:pending|todo|tbd|unassigned|none recorded|not applicable|n\/a|<[^>]+>)(?:[.:\s].*)?$/i;
const UNASSIGNED = new Set([
  "",
  "[]",
  "none",
  "none recorded",
  "unassigned",
  "tbd",
  "todo",
  "<owner>",
]);

interface Artifact {
  path: string;
  title: string;
  metadata: Record<string, string>;
  sections: Record<string, string>;
}

interface ParsedArtifact {
  artifact: Artifact | null;
  errors: string[];
}

function normalizeHeading(value: string): string {
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

function repoPath(root: string, path: string): string {
  return relative(root, path).split(sep).join("/");
}

function isCanonicalChangePath(path: string): boolean {
  return CHANGE_BUNDLE_RE.test(path);
}

function parseArtifact(path: string): ParsedArtifact {
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

function titleCase(value: string): string {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function linkTargets(text: string): string[] {
  return Array.from(text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g), (match) => match[1]);
}

function validateLocalLinks(root: string, path: string): string[] {
  const errors: string[] = [];
  const displayPath = path.split(sep).join("/");
  for (const target of linkTargets(readFileSync(path, "utf8"))) {
    let clean = target.trim().replace(/^<|>$/g, "");
    if (!clean || /^(?:#|https?:\/\/|mailto:)/.test(clean)) continue;
    clean = clean.split("#", 1)[0];
    const resolved = resolve(dirname(path), clean);
    const fromRoot = relative(root, resolved);
    if (fromRoot === ".." || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
      errors.push(`${displayPath}: local link escapes repository: ${target}`);
    } else if (!existsSync(resolved)) {
      errors.push(`${displayPath}: broken local link: ${target}`);
    }
  }
  return errors;
}

function labelValue(section: string, label: string): string | null {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^\\s*${escaped}:\\s*(.+?)\\s*$`, "im").exec(section)?.[1].trim() ?? null;
}

function isConcrete(value: string | null | undefined): boolean {
  return Boolean(value && !PLACEHOLDER_RE.test(value.trim()));
}

function normalizedActor(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function scopeEntries(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((entry) => entry.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

function validateScope(value: string | null | undefined, path: string): string[] {
  const errors: string[] = [];
  const entries = scopeEntries(value);
  if (entries.length === 0) return [`${path}: schema 2 requires at least one explicit scope path`];
  for (const entry of entries) {
    const parts = entry.split("/");
    if (
      entry === "." ||
      entry === "*" ||
      entry.startsWith("/") ||
      entry.includes("\\") ||
      parts.some((part) => part === "" || part === "." || part === ".." || part.includes("*"))
    ) {
      errors.push(`${path}: unsafe or broad schema 2 scope path ${JSON.stringify(entry)}`);
    }
  }
  return errors;
}

function scopeCovers(scope: string | null | undefined, changedPath: string): boolean {
  return scopeEntries(scope).some(
    (entry) => changedPath === entry || changedPath.startsWith(`${entry}/`),
  );
}

interface AcceptanceCriterion {
  id: string;
  mark: string;
  text: string;
}

interface AcceptanceEvidence {
  id: string;
  outcome: string;
  detail: string;
}

function v2Criteria(spec: string): AcceptanceCriterion[] {
  return Array.from(spec.matchAll(V2_CRITERION_RE), (match) => ({
    mark: match[1],
    id: match[2].toUpperCase(),
    text: match[3].trim(),
  }));
}

function v2Evidence(verification: string): AcceptanceEvidence[] {
  return Array.from(verification.matchAll(V2_EVIDENCE_RE), (match) => ({
    id: match[1].toUpperCase(),
    outcome: match[2].toUpperCase(),
    detail: match[3].trim(),
  }));
}

function duplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return Array.from(repeated).sort();
}

function hasLinkTo(section: string, pathPart: string): boolean {
  return linkTargets(section).some((target) => target.includes(pathPart));
}

function hasBlocker(section: string): boolean {
  return isConcrete(labelValue(section, "Blocked"));
}

function hasVerificationEvidence(section: string): boolean {
  const hasResult = /\b(?:pass(?:ed)?|fail(?:ed)?|blocked|verified)\b/i.test(section);
  const hasSubject = section.includes("`") || linkTargets(section).length > 0 || section.includes("|");
  return hasResult && hasSubject;
}

function validateV2Change(artifact: Artifact, path: string): string[] {
  const errors: string[] = [];
  const metadata = artifact.metadata;
  const status = metadata.status ?? "";
  const risk = metadata.risk ?? "";
  const spec = artifact.sections.spec ?? "";
  const verification = artifact.sections.verification ?? "";

  for (const field of V2_REQUIRED_FIELDS) {
    if (!(metadata[field] ?? "").trim()) {
      errors.push(`${path}: schema 2 change is missing required frontmatter field ${field}`);
    }
  }
  if (!RISK_LEVELS.has(risk)) {
    errors.push(`${path}: schema 2 risk must be low, medium, high, or critical`);
  }

  if (ADVANCED_CHANGE_STATUSES.has(status)) {
    if (!isConcrete(metadata.scope)) {
      errors.push(`${path}: status ${status} requires concrete schema 2 scope metadata`);
    } else {
      errors.push(...validateScope(metadata.scope, path));
    }
    if (!isValidDate(metadata.approved_at ?? "")) {
      errors.push(`${path}: status ${status} requires approved_at in YYYY-MM-DD form`);
    }
    if (
      INDEPENDENT_RISK_LEVELS.has(risk) &&
      normalizedActor(metadata.approvers) === normalizedActor(metadata.owner)
    ) {
      errors.push(`${path}: ${risk} risk requires an approver other than the implementation owner`);
    }
  } else if (isConcrete(metadata.scope)) {
    errors.push(...validateScope(metadata.scope, path));
  }

  const allCheckboxes = Array.from(spec.matchAll(CHECKBOX_RE));
  const criteria = v2Criteria(spec);
  if (criteria.length !== allCheckboxes.length) {
    errors.push(`${path}: every schema 2 acceptance checkbox must use a unique AC-N identifier`);
  }
  for (const id of duplicates(criteria.map((criterion) => criterion.id))) {
    errors.push(`${path}: duplicate schema 2 acceptance criterion ${id}`);
  }

  if (VERIFIED_CHANGE_STATUSES.has(status) || status === "failed") {
    const evidence = v2Evidence(verification);
    for (const id of duplicates(evidence.map((item) => item.id))) {
      errors.push(`${path}: duplicate schema 2 acceptance evidence ${id}`);
    }
    const evidenceById = new Map(evidence.map((item) => [item.id, item]));
    const criterionIds = new Set(criteria.map((criterion) => criterion.id));
    for (const criterion of criteria) {
      const item = evidenceById.get(criterion.id);
      if (!item) {
        errors.push(`${path}: missing schema 2 verification evidence for ${criterion.id}`);
        continue;
      }
      if (VERIFIED_CHANGE_STATUSES.has(status) && item.outcome !== "PASS") {
        errors.push(`${path}: status ${status} requires PASS evidence for ${criterion.id}`);
      }
      if (!isConcrete(item.detail) || (!item.detail.includes("`") && linkTargets(item.detail).length === 0)) {
        errors.push(`${path}: ${criterion.id} evidence must cite a command or linked artifact`);
      }
    }
    for (const item of evidence) {
      if (!criterionIds.has(item.id)) {
        errors.push(`${path}: verification evidence ${item.id} has no matching acceptance criterion`);
      }
    }
    if (status === "failed" && !evidence.some((item) => item.outcome === "FAIL")) {
      errors.push(`${path}: failed schema 2 change requires at least one FAIL acceptance mapping`);
    }
  }

  if (VERIFIED_CHANGE_STATUSES.has(status)) {
    const mode = metadata.verification_mode ?? "";
    if (!VERIFICATION_MODES.has(mode)) {
      errors.push(`${path}: status ${status} requires a valid verification_mode`);
    }
    if (!isConcrete(metadata.verified_by)) {
      errors.push(`${path}: status ${status} requires a named verified_by actor`);
    }
    if (!isValidDate(metadata.verified_at ?? "")) {
      errors.push(`${path}: status ${status} requires verified_at in YYYY-MM-DD form`);
    }
    if (
      INDEPENDENT_RISK_LEVELS.has(risk) &&
      normalizedActor(metadata.verified_by) === normalizedActor(metadata.owner)
    ) {
      errors.push(`${path}: ${risk} risk requires a verifier other than the implementation owner`);
    }
  }

  return errors;
}

function validateChange(artifact: Artifact, path: string): string[] {
  const errors: string[] = [];
  const status = artifact.metadata.status ?? "";
  const spec = artifact.sections.spec ?? "";
  const decision = artifact.sections["decision and gates"] ?? "";
  const verification = artifact.sections.verification ?? "";
  const review = artifact.sections["review and release"] ?? "";
  const criteria = Array.from(spec.matchAll(CHECKBOX_RE), (match) => match[1]);

  if (criteria.length === 0) {
    errors.push(`${path}: change Spec must contain observable acceptance checkboxes`);
  }

  if (ADVANCED_CHANGE_STATUSES.has(status)) {
    if (UNASSIGNED.has((artifact.metadata.approvers ?? "").trim().toLowerCase())) {
      errors.push(`${path}: status ${status} requires named Intent/Spec approval`);
    }
    for (const field of ["source", "inputs", "outputs", "next_trigger"]) {
      if (!isConcrete(artifact.metadata[field])) {
        errors.push(`${path}: status ${status} requires concrete ${field} metadata`);
      }
    }
    if (!decision.trim() || /^\s*(?:pending|todo|tbd)\.?\s*$/i.test(decision)) {
      errors.push(`${path}: status ${status} requires Decision and Gate evidence`);
    }
  }

  if (VERIFIED_CHANGE_STATUSES.has(status)) {
    if (criteria.some((mark) => mark.trim().toLowerCase() !== "x")) {
      errors.push(`${path}: status ${status} requires every acceptance criterion checked`);
    }
    if ((labelValue(verification, "Verdict") ?? "").toLowerCase().replace(/\.$/, "") !== "verified") {
      errors.push(`${path}: status ${status} requires 'Verdict: verified'`);
    }
    if (!isConcrete(labelValue(verification, "Residual risk"))) {
      errors.push(`${path}: status ${status} requires a concrete Residual risk`);
    }
    if (!hasVerificationEvidence(verification)) {
      errors.push(`${path}: status ${status} requires actual verification evidence`);
    }
  }

  if (status === "failed") {
    if ((labelValue(verification, "Verdict") ?? "").toLowerCase().replace(/\.$/, "") !== "failed") {
      errors.push(`${path}: failed status requires 'Verdict: failed'`);
    }
    if (!hasVerificationEvidence(verification)) {
      errors.push(`${path}: failed status requires the observed failed evidence`);
    }
  }

  if (status === "ready-to-release" || status === "released") {
    if (!isConcrete(labelValue(review, "Approval"))) {
      errors.push(`${path}: status ${status} requires explicit release Approval`);
    }
    const target = labelValue(review, "Release target");
    if (!isConcrete(target) || target?.toLowerCase().replace(/\.$/, "") === "none") {
      errors.push(`${path}: status ${status} requires a concrete Release target`);
    }
    if (!isConcrete(labelValue(review, "Rollback"))) {
      errors.push(`${path}: status ${status} requires a concrete Rollback path`);
    }
  }

  if (status === "released") {
    if (!isConcrete(labelValue(review, "Release identity"))) {
      errors.push(`${path}: released status requires an immutable Release identity`);
    }
    if (!isConcrete(labelValue(review, "Smoke evidence"))) {
      errors.push(`${path}: released status requires observed Smoke evidence`);
    }
  }

  if (status === "closed") {
    const hasRelease =
      isConcrete(labelValue(review, "Release identity")) &&
      isConcrete(labelValue(review, "Smoke evidence"));
    if (!hasRelease && !isConcrete(labelValue(review, "No release"))) {
      errors.push(
        `${path}: closed status requires release evidence or a concrete No release disposition`,
      );
    }
  }

  if (artifact.metadata.schema === SCHEMA_V2) {
    errors.push(...validateV2Change(artifact, path));
  }

  return errors;
}

function validateIncident(artifact: Artifact, path: string): string[] {
  const errors: string[] = [];
  const status = artifact.metadata.status ?? "";
  if (status !== "resolved" && status !== "closed") return errors;

  for (const field of ["source", "inputs", "outputs", "next_trigger"]) {
    if (!isConcrete(artifact.metadata[field])) {
      errors.push(`${path}: status ${status} requires concrete ${field} metadata`);
    }
  }

  const recovery = artifact.sections["mitigation and recovery"] ?? "";
  const followUps = artifact.sections["follow-ups"] ?? "";
  const regression = artifact.sections["regression eval"] ?? "";
  if ((labelValue(recovery, "Recovery verdict") ?? "").toLowerCase().replace(/\.$/, "") !== "recovered") {
    errors.push(`${path}: status ${status} requires 'Recovery verdict: recovered'`);
  }
  if (!hasLinkTo(followUps, "/changes/") && !hasBlocker(followUps)) {
    errors.push(`${path}: status ${status} requires a linked follow-up change or Blocked reason`);
  }
  if (!hasLinkTo(regression, "/evals/") && !hasBlocker(regression)) {
    errors.push(`${path}: status ${status} requires a linked regression Eval or Blocked reason`);
  }
  return errors;
}

function validateEval(artifact: Artifact, path: string): string[] {
  const errors: string[] = [];
  const status = artifact.metadata.status ?? "";
  if (!new Set(["active", "failed", "retired"]).has(status)) return errors;

  for (const field of ["source", "inputs", "outputs", "next_trigger"]) {
    if (!isConcrete(artifact.metadata[field])) {
      errors.push(`${path}: status ${status} requires concrete ${field} metadata`);
    }
  }

  const provenance = artifact.sections.provenance ?? "";
  const lastResult = artifact.sections["last result"] ?? "";
  if (linkTargets(provenance).length === 0) {
    errors.push(`${path}: status ${status} requires linked real-task or Incident provenance`);
  }
  const result = (labelValue(lastResult, "Result") ?? "").toLowerCase().replace(/\.$/, "");
  if (!new Set(["pass", "fail", "blocked"]).has(result)) {
    errors.push(`${path}: status ${status} requires 'Result: pass', 'fail', or 'blocked'`);
  }
  if (!isConcrete(labelValue(lastResult, "Revision"))) {
    errors.push(`${path}: status ${status} requires the tested Revision`);
  }
  return errors;
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function validateArtifact(root: string, artifact: Artifact, expectedKind: ArtifactKind): string[] {
  const errors: string[] = [];
  const path = repoPath(root, artifact.path);
  const metadata = artifact.metadata;

  if (!artifact.title) errors.push(`${path}: missing one level-one Artifact title`);

  for (const field of REQUIRED_FIELDS) {
    if (!(metadata[field] ?? "").trim()) {
      errors.push(`${path}: missing required frontmatter field ${field}`);
    }
  }

  const kind = metadata.kind;
  if (kind && kind !== expectedKind) {
    errors.push(`${path}: kind must be ${expectedKind}, found ${kind}`);
  }
  if (expectedKind === "change" && metadata.schema && metadata.schema !== SCHEMA_V2) {
    errors.push(`${path}: unsupported change schema ${JSON.stringify(metadata.schema)}`);
  }
  if (expectedKind === "change" && !isCanonicalChangePath(path)) {
    errors.push(
      `${path}: change Artifacts must use docs/sdlc/changes/<date>-<slug>/change.md`,
    );
  }

  const id = metadata.id ?? "";
  if (id && !ID_RE.test(id)) errors.push(`${path}: invalid id ${JSON.stringify(id)}`);
  const artifactSlug =
    expectedKind === "change"
      ? basename(dirname(artifact.path))
      : basename(artifact.path).replace(/\.md$/, "");
  const expectedId = `${expectedKind}-${artifactSlug}`;
  if (id && id !== expectedId) {
    errors.push(`${path}: id must match filename: expected ${expectedId}`);
  }

  const status = metadata.status ?? "";
  if (status && !ALLOWED_STATUSES[expectedKind].has(status)) {
    const allowed = Array.from(ALLOWED_STATUSES[expectedKind]).sort().join(", ");
    errors.push(`${path}: invalid ${expectedKind} status ${JSON.stringify(status)}; allowed: ${allowed}`);
  }

  for (const field of ["created", "updated"]) {
    const value = metadata[field] ?? "";
    if (value && !isValidDate(value)) {
      errors.push(`${path}: ${field} must be YYYY-MM-DD, found ${JSON.stringify(value)}`);
    }
  }
  if (metadata.created && metadata.updated && metadata.updated < metadata.created) {
    errors.push(`${path}: updated date precedes created date`);
  }

  if (!["", "draft", "in-review", "investigating"].includes(status)) {
    if (UNASSIGNED.has((metadata.owner ?? "").trim().toLowerCase())) {
      errors.push(`${path}: status ${status} requires an assigned owner`);
    }
  }

  for (const heading of REQUIRED_SECTIONS[expectedKind]) {
    if (!(heading in artifact.sections)) {
      errors.push(`${path}: missing required section ## ${titleCase(heading)}`);
    } else if (!artifact.sections[heading].trim()) {
      errors.push(`${path}: section ## ${titleCase(heading)} is empty`);
    }
  }

  if (expectedKind === "change") errors.push(...validateChange(artifact, path));
  if (expectedKind === "incident") errors.push(...validateIncident(artifact, path));
  if (expectedKind === "eval") errors.push(...validateEval(artifact, path));
  errors.push(...validateLocalLinks(root, artifact.path));
  return errors;
}

function markdownFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    if (statSync(path).isDirectory()) files.push(...markdownFiles(path));
    else if (entry.endsWith(".md")) files.push(path);
  }
  return files.sort();
}

interface ChangedPath {
  status: string;
  paths: string[];
}

function parseChangedPaths(output: string): ChangedPath[] {
  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [status, ...paths] = line.split("\t");
      return { status, paths };
    })
    .filter((change) => change.paths.length > 0);
}

function changedPaths(
  root: string,
  base: string | undefined,
  worktree: boolean,
): { changes: ChangedPath[]; errors: string[] } {
  const comparison = worktree ? "HEAD" : `${base}...HEAD`;
  const result = spawnSync("git", ["diff", "--name-status", "--find-renames", comparison], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim() || "git diff failed";
    const label = worktree ? "worktree with HEAD" : `SDLC branch with base ${base}`;
    return { changes: [], errors: [`cannot compare ${label}: ${detail}`] };
  }

  const changes = parseChangedPaths(result.stdout);
  if (worktree) {
    const untracked = spawnSync("git", ["ls-files", "--others", "--exclude-standard"], {
      cwd: root,
      encoding: "utf8",
    });
    if (untracked.status !== 0) {
      const detail = untracked.stderr.trim() || untracked.stdout.trim() || "git ls-files failed";
      return { changes: [], errors: [`cannot list untracked worktree files: ${detail}`] };
    }
    for (const path of untracked.stdout.split(/\r?\n/).filter(Boolean)) {
      changes.push({ status: "A", paths: [path] });
    }
  }
  return { changes, errors: [] };
}

function validateChangedArtifactGate(
  root: string,
  base: string | undefined,
  worktree: boolean,
  artifactsByPath: Map<string, Artifact>,
): string[] {
  const { changes, errors } = changedPaths(root, base, worktree);
  if (errors.length > 0 || changes.length === 0) return errors;

  const changed = new Set(changes.flatMap((change) => change.paths));
  const changedArtifacts = new Set(
    changes
      .filter((change) => !change.status.startsWith("D"))
      .flatMap((change) => change.paths)
      .filter(isCanonicalChangePath),
  );
  if (changedArtifacts.size === 0) {
    return ["repository changes require an added or updated canonical file under docs/sdlc/changes/"];
  }

  const gateErrors: string[] = [];
  const changedArtifactRecords = Array.from(changedArtifacts).flatMap((path) => {
    const artifact = artifactsByPath.get(path);
    if (!artifact) return [];
    if (artifact.metadata.schema !== SCHEMA_V2) {
      gateErrors.push(`${path}: added or updated change Artifacts must use schema 2`);
    }
    return [{ path, artifact }];
  });
  if (gateErrors.length > 0) return gateErrors;

  if (Array.from(changed).every((path) => changedArtifacts.has(path))) return [];
  const ready = changedArtifactRecords.filter(({ artifact }) =>
    BUILD_CHANGE_STATUSES.has(artifact.metadata.status ?? ""),
  );
  if (ready.length === 0) {
    return [
      "repository implementation changes require a changed canonical Artifact in executing, failed, verified, ready-to-release, released, or closed state",
    ];
  }

  for (const path of changed) {
    if (changedArtifacts.has(path)) continue;
    if (!ready.some(({ artifact }) => scopeCovers(artifact.metadata.scope, path))) {
      gateErrors.push(`${path}: changed path is not covered by a changed schema 2 Artifact scope`);
    }
  }
  return gateErrors;
}

function validateReleaseGate(artifacts: Map<string, Artifact>, changeId: string): string[] {
  const artifact = artifacts.get(changeId);
  if (!artifact) return [`release change artifact not found: ${changeId}`];
  if (artifact.metadata.kind !== "change") {
    return [`release artifact must be a change: ${changeId}`];
  }
  const status = artifact.metadata.status;
  if (status !== "ready-to-release") {
    return [`release change ${changeId} must be ready-to-release, found ${status || "missing"}`];
  }
  return [];
}

export function validateRepository(
  repositoryRoot: string,
  base?: string,
  releaseChange?: string,
  worktree = false,
): string[] {
  const root = resolve(repositoryRoot);
  const errors: string[] = [];

  for (const path of REQUIRED_FILES) {
    if (!existsSync(join(root, path)) || !statSync(join(root, path)).isFile()) {
      errors.push(`missing required SDLC file: ${path}`);
    }
  }
  for (const path of LEGACY_PATHS) {
    if (existsSync(join(root, path))) {
      errors.push(`legacy or superseded lifecycle path is forbidden: ${path}`);
    }
  }

  const seenIds = new Map<string, string>();
  const artifacts = new Map<string, Artifact>();
  const artifactsByPath = new Map<string, Artifact>();
  let changeCount = 0;

  for (const [directory, expectedKind] of Object.entries(ARTIFACT_KINDS)) {
    for (const path of markdownFiles(join(root, "docs", "sdlc", directory))) {
      const parsed = parseArtifact(path);
      errors.push(...parsed.errors);
      if (!parsed.artifact) continue;
      const artifact = parsed.artifact;
      errors.push(...validateArtifact(root, artifact, expectedKind));
      const id = artifact.metadata.id;
      const relativePath = repoPath(root, path);
      artifactsByPath.set(relativePath, artifact);
      if (id) {
        const previous = seenIds.get(id);
        if (previous) {
          errors.push(`duplicate artifact id ${JSON.stringify(id)}: ${previous} and ${relativePath}`);
        } else {
          seenIds.set(id, relativePath);
          artifacts.set(id, artifact);
        }
      }
      if (expectedKind === "change") changeCount += 1;
    }
  }

  if (changeCount === 0) errors.push("at least one canonical change artifact is required");
  const workflow = join(root, "docs", "sdlc", "workflow.md");
  if (existsSync(workflow)) errors.push(...validateLocalLinks(root, workflow));
  if (base && worktree) errors.push("--base and --worktree are mutually exclusive");
  else if (base || worktree) {
    errors.push(...validateChangedArtifactGate(root, base, worktree, artifactsByPath));
  }
  if (releaseChange) errors.push(...validateReleaseGate(artifacts, releaseChange));
  return errors;
}

function parseArguments(argv: string[]): {
  root: string;
  base?: string;
  releaseChange?: string;
  worktree: boolean;
} {
  let root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  let base: string | undefined;
  let releaseChange: string | undefined;
  let worktree = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--worktree") {
      worktree = true;
      continue;
    }
    const value = argv[index + 1];
    if (!["--root", "--base", "--release-change"].includes(argument) || !value) {
      throw new Error(
        "usage: bun script/verify/sdlc.ts [--root PATH] [--base SHA | --worktree] [--release-change ID]",
      );
    }
    if (argument === "--root") root = value;
    if (argument === "--base") base = value;
    if (argument === "--release-change") releaseChange = value;
    index += 1;
  }
  return { root, base, releaseChange, worktree };
}

if (import.meta.main) {
  try {
    const args = parseArguments(process.argv.slice(2));
    const errors = validateRepository(args.root, args.base, args.releaseChange, args.worktree);
    if (errors.length > 0) {
      for (const error of errors) console.error(`[sdlc] error: ${error}`);
      console.error(`[sdlc] failed with ${errors.length} error(s)`);
      process.exit(1);
    }
    console.log("[sdlc] contract valid");
  } catch (error) {
    console.error(`[sdlc] error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(2);
  }
}
