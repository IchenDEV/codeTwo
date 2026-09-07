import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";

import {
  duplicates,
  hasVerificationEvidence,
  isConcrete,
  isValidDate,
  labelValue,
  linkTargets,
  normalizedActor,
  parseArtifact,
  scopeCovers,
  validateScope,
  v2Criteria,
  v2Evidence,
  type Artifact,
} from "./artifact-parse";

export const SCHEMA_V3 = "3";
export const STAGE_FILES = ["intent.md", "spec.md", "plan.md", "verification.md"] as const;
export const CHANGE_BUNDLE_RE =
  /^docs\/sdlc\/changes\/\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*\/(intent|spec|plan|verification)\.md$/;
export const CHANGE_ID_RE = /^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/;

const RISK_LEVELS = new Set(["low", "medium", "high", "critical"]);
const INDEPENDENT_RISK_LEVELS = new Set(["high", "critical"]);
const VERIFICATION_MODES = new Set(["owner", "fresh-context", "human", "pair"]);
const PLACEHOLDER_BODY_RE = /\[fill\]|(^|[^\p{L}\p{N}_])(TODO|TBD)([^\p{L}\p{N}_]|$)/iu;

const INTENT_HEADINGS = [
  "problem",
  "proposed outcome",
  "affected users and systems",
  "constraints",
  "out of scope",
  "success signals",
  "open questions",
  "decision",
] as const;

const SPEC_HEADINGS = [
  "requirements",
  "user experience",
  "technical design",
  "security and privacy",
  "alternatives and non-goals",
  "areas of concern",
  "acceptance criteria",
  "decision",
] as const;

const PLAN_HEADINGS = [
  "files and ownership",
  "order of work",
  "test-first proof",
  "visual or integration proof",
  "risks and mitigations",
  "rollback",
  "deviations",
  "decision",
] as const;

const VERIFICATION_HEADINGS = [
  "automated checks",
  "behavioral evidence",
  "visual evidence",
  "security and privacy evidence",
  "deviations and residual risk",
  "verdict",
  "review and release",
  "feedback",
] as const;

export interface StageBundle {
  id: string;
  dir: string;
  intent: Artifact;
  spec?: Artifact;
  plan?: Artifact;
  verification?: Artifact;
}

function display(path: string): string {
  return path.split(sep).join("/");
}

function requireHeading(artifact: Artifact, heading: string): string | null {
  if (!(heading in artifact.sections) || !artifact.sections[heading].trim()) {
    const title = heading.replace(/\b\w/g, (letter) => letter.toUpperCase());
    return `${display(artifact.path)}: missing required section ## ${title}`;
  }
  return null;
}

function requireNoPlaceholders(path: string, body: string): string | null {
  if (PLACEHOLDER_BODY_RE.test(body)) {
    return `${display(path)}: accepted or passed artifacts cannot contain placeholders`;
  }
  return null;
}

function validateApproval(file: Artifact, risk: string): string[] {
  const errors: string[] = [];
  const path = display(file.path);
  const approvedBy = file.metadata.approved_by ?? "";
  const approvedAt = file.metadata.approved_at ?? "";
  if (!isConcrete(approvedBy)) errors.push(`${path}: accepted stage requires approved_by`);
  if (!isValidDate(approvedAt)) errors.push(`${path}: accepted stage requires approved_at YYYY-MM-DD`);
  if (
    INDEPENDENT_RISK_LEVELS.has(risk) &&
    normalizedActor(approvedBy) === normalizedActor(file.metadata.owner)
  ) {
    errors.push(`${path}: ${risk} risk requires an approver other than the owner`);
  }
  const placeholder = requireNoPlaceholders(file.path, readFileSync(file.path, "utf8"));
  if (placeholder) errors.push(placeholder);
  return errors;
}

function validateStageCommon(
  artifact: Artifact,
  expectedStage: string,
  allowedStatuses: Set<string>,
  bundleId: string,
): string[] {
  const errors: string[] = [];
  const path = display(artifact.path);
  if (artifact.metadata.stage !== expectedStage) errors.push(`${path}: stage must be ${expectedStage}`);
  if (artifact.metadata.schema !== SCHEMA_V3) errors.push(`${path}: schema 3 is required`);
  if (artifact.metadata.id !== bundleId) errors.push(`${path}: id must match bundle ${bundleId}`);
  const status = artifact.metadata.status ?? "";
  if (!allowedStatuses.has(status)) errors.push(`${path}: invalid status ${JSON.stringify(status)}`);
  if (!isValidDate(artifact.metadata.created ?? "")) errors.push(`${path}: created must be YYYY-MM-DD`);
  if (!isConcrete(artifact.metadata.owner) && !new Set(["draft", "pending"]).has(status)) {
    errors.push(`${path}: requires an assigned owner`);
  }
  if (expectedStage !== "verification" && !RISK_LEVELS.has(artifact.metadata.risk ?? "")) {
    errors.push(`${path}: invalid risk`);
  }
  return errors;
}

function validateAcceptanceCriteria(spec: Artifact): string[] {
  const errors: string[] = [];
  const path = display(spec.path);
  const criteria = v2Criteria(spec.sections["acceptance criteria"] ?? "");
  if (criteria.length === 0) errors.push(`${path}: spec requires AC-N acceptance criteria`);
  for (const id of duplicates(criteria.map((item) => item.id))) {
    errors.push(`${path}: duplicate acceptance criterion ${id}`);
  }
  return errors;
}

function validateVerificationEvidence(intent: Artifact, spec: Artifact, verification: Artifact): string[] {
  const errors: string[] = [];
  const path = display(verification.path);
  const status = verification.metadata.status ?? "";
  if (status !== "passed" && status !== "failed") return errors;

  const criteria = v2Criteria(spec.sections["acceptance criteria"] ?? "");
  const evidenceText = `${verification.sections["automated checks"] ?? ""}\n${verification.sections["behavioral evidence"] ?? ""}`;
  // Historical bundles repeat identical mappings in both evidence sections.
  const evidence = Array.from(
    new Map(v2Evidence(evidenceText).map((item) => [JSON.stringify(item), item])).values(),
  );
  for (const id of duplicates(evidence.map((item) => item.id))) {
    errors.push(`${path}: duplicate verification evidence ${id}`);
  }
  const evidenceById = new Map(evidence.map((item) => [item.id, item]));
  const criterionIds = new Set(criteria.map((item) => item.id));

  for (const criterion of criteria) {
    const item = evidenceById.get(criterion.id);
    if (!item) {
      errors.push(`${path}: missing verification evidence for ${criterion.id}`);
      continue;
    }
    if (status === "passed" && item.outcome !== "PASS") {
      errors.push(`${path}: passed verification requires PASS for ${criterion.id}`);
    }
    if (!isConcrete(item.detail) || (!item.detail.includes("`") && linkTargets(item.detail).length === 0)) {
      errors.push(`${path}: ${criterion.id} evidence must cite a command or linked artifact`);
    }
  }
  for (const item of evidence) {
    if (!criterionIds.has(item.id)) errors.push(`${path}: evidence ${item.id} has no matching criterion`);
  }
  if (status === "failed" && !evidence.some((item) => item.outcome === "FAIL")) {
    errors.push(`${path}: failed verification requires at least one FAIL mapping`);
  }

  const verdict = (labelValue(verification.sections.verdict ?? "", "Verdict") ?? "")
    .toLowerCase()
    .replace(/\.+$/, "");
  if (status === "passed" && verdict !== "verified") {
    errors.push(`${path}: passed verification requires 'Verdict: verified'`);
  }
  if (status === "failed" && verdict !== "failed") {
    errors.push(`${path}: failed verification requires 'Verdict: failed'`);
  }
  const residual = labelValue(verification.sections["deviations and residual risk"] ?? "", "Residual risk");
  if (status === "passed" && !isConcrete(residual)) {
    errors.push(`${path}: passed verification requires concrete Residual risk`);
  }
  if (status === "passed" && !hasVerificationEvidence(evidenceText)) {
    errors.push(`${path}: passed verification requires actual evidence`);
  }
  const mode = verification.metadata.verification_mode ?? "";
  if (status === "passed" && !VERIFICATION_MODES.has(mode)) {
    errors.push(`${path}: passed verification requires verification_mode`);
  }
  if (status === "passed" && !isConcrete(verification.metadata.verified_by)) {
    errors.push(`${path}: passed verification requires verified_by`);
  }
  if (status === "passed" && !isValidDate(verification.metadata.verified_at ?? "")) {
    errors.push(`${path}: passed verification requires verified_at`);
  }
  if (
    status === "passed" &&
    INDEPENDENT_RISK_LEVELS.has(intent.metadata.risk ?? "") &&
    normalizedActor(verification.metadata.verified_by) === normalizedActor(intent.metadata.owner)
  ) {
    errors.push(`${path}: high/critical verification requires an independent verifier`);
  }
  return errors;
}

export function validateStageBundle(root: string, bundleDir: string): { bundle: StageBundle | null; errors: string[] } {
  const errors: string[] = [];
  const bundleId = basename(bundleDir);
  if (!CHANGE_ID_RE.test(bundleId)) {
    return { bundle: null, errors: [`${display(bundleDir)}: invalid change bundle id`] };
  }
  if (existsSync(join(bundleDir, "change.md"))) {
    errors.push(`${display(join(bundleDir, "change.md"))}: schema 3 bundles forbid legacy change.md`);
  }

  const stages: Partial<Record<(typeof STAGE_FILES)[number], Artifact>> = {};
  for (const fileName of STAGE_FILES) {
    const path = join(bundleDir, fileName);
    if (!existsSync(path)) continue;
    const parsed = parseArtifact(path);
    errors.push(...parsed.errors);
    if (parsed.artifact) stages[fileName] = parsed.artifact;
  }
  const intent = stages["intent.md"];
  if (!intent) return { bundle: null, errors: [...errors, `${display(bundleDir)}: missing intent.md`] };
  const spec = stages["spec.md"];
  const plan = stages["plan.md"];
  const verification = stages["verification.md"];
  const risk = intent.metadata.risk ?? "";
  const headings = [INTENT_HEADINGS, SPEC_HEADINGS, PLAN_HEADINGS, VERIFICATION_HEADINGS];

  for (const [index, fileName] of STAGE_FILES.entries()) {
    const stage = stages[fileName];
    if (!stage) continue;
    const name = fileName.replace(".md", "");
    const statuses = index === 3
      ? new Set(["pending", "in-progress", "passed", "failed"])
      : new Set(["draft", "in-review", "accepted", "rejected"]);
    errors.push(...validateStageCommon(stage, name, statuses, bundleId));
    for (const heading of headings[index]) errors.push(requireHeading(stage, heading) ?? "");
    if (index > 0) {
      const previousName = STAGE_FILES[index - 1];
      const previous = stages[previousName];
      if (!previous) errors.push(`${display(stage.path)}: requires preceding ${previousName}`);
      else if (previous.metadata.status !== "accepted") {
        errors.push(`${display(stage.path)}: ${previousName.replace(".md", "")} must be accepted before ${name}`);
      }
      if (stage.metadata.based_on !== previousName) {
        errors.push(`${display(stage.path)}: based_on must be ${previousName}`);
      }
    }
    if (index < 3) {
      if (stage.metadata.risk !== risk) errors.push(`${display(stage.path)}: risk must match intent`);
      if (stage.metadata.status === "accepted") errors.push(...validateApproval(stage, risk));
    }
  }
  if (spec) errors.push(...validateAcceptanceCriteria(spec));
  if (plan?.metadata.status === "accepted") {
    if (!isConcrete(plan.metadata.scope)) errors.push(`${display(plan.path)}: plan requires explicit scope`);
    else errors.push(...validateScope(plan.metadata.scope, display(plan.path)));
  }
  if (spec && verification) {
    errors.push(...validateVerificationEvidence(intent, spec, verification));
    if (verification.metadata.status === "passed") {
      errors.push(requireNoPlaceholders(verification.path, readFileSync(verification.path, "utf8")) ?? "");
    }
  }
  return {
    bundle: { id: bundleId, dir: bundleDir, intent, spec, plan, verification },
    errors: errors.filter(Boolean),
  };
}

export function discoverStageBundles(root: string): string[] {
  const changesRoot = join(root, "docs", "sdlc", "changes");
  if (!existsSync(changesRoot)) return [];
  return readdirSync(changesRoot)
    .map((entry) => join(changesRoot, entry))
    .filter((path) => existsSync(join(path, "intent.md")))
    .sort();
}

export function isCanonicalStagePath(path: string): boolean {
  return CHANGE_BUNDLE_RE.test(path);
}

export function planCoversPath(bundle: StageBundle, changedPath: string): boolean {
  return bundleIsImplementationReady(bundle) && scopeCovers(bundle.plan?.metadata.scope, changedPath);
}

export function bundleIsImplementationReady(bundle: StageBundle): boolean {
  return bundle.intent.metadata.status === "accepted"
    && bundle.spec?.metadata.status === "accepted"
    && bundle.plan?.metadata.status === "accepted";
}

export function validateLocalLinks(root: string, path: string): string[] {
  const errors: string[] = [];
  const displayPath = display(path);
  for (const target of linkTargets(readFileSync(path, "utf8"))) {
    let clean = target.trim().replace(/^<|>$/g, "");
    if (!clean || /^(?:#|https?:\/\/|mailto:)/.test(clean)) continue;
    clean = clean.split("#", 1)[0];
    const resolved = resolve(dirname(path), clean);
    const fromRoot = relative(root, resolved);
    if (fromRoot === ".." || fromRoot.startsWith(`..${sep}`)) {
      errors.push(`${displayPath}: local link escapes repository: ${target}`);
    } else if (!existsSync(resolved)) {
      errors.push(`${displayPath}: broken local link: ${target}`);
    }
  }
  return errors;
}
