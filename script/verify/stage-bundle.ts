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
  /^docs\/sdlc\/changes\/\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*\/(change|intent|spec|plan|verification)\.md$/;
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
  schema = SCHEMA_V3,
): string[] {
  const errors: string[] = [];
  const path = display(artifact.path);
  if (artifact.metadata.stage !== expectedStage) errors.push(`${path}: stage must be ${expectedStage}`);
  if (artifact.metadata.schema !== schema) errors.push(`${path}: schema ${schema} is required`);
  if (artifact.metadata.id !== bundleId) errors.push(`${path}: id must match bundle ${bundleId}`);
  const status = artifact.metadata.status ?? "";
  if (!allowedStatuses.has(status)) errors.push(`${path}: invalid status ${JSON.stringify(status)}`);
  if (!isValidDate(artifact.metadata.created ?? "")) errors.push(`${path}: created must be YYYY-MM-DD`);
  if (!isConcrete(artifact.metadata.owner) && !new Set(["draft", "pending"]).has(status)) {
    errors.push(`${path}: requires an assigned owner`);
  }
  if ((schema === SCHEMA_V3 ? expectedStage !== "verification" : expectedStage === "intent") && !RISK_LEVELS.has(artifact.metadata.risk ?? "")) {
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

// Schema 4 stores the lifecycle once. Section views reuse the existing scope,
// evidence, and release Gates without manufacturing additional persisted stages.
function validateChangeRecord(root: string, dir: string): { bundle: StageBundle | null; errors: string[] } {
  const path = join(dir, "change.md");
  const parsed = parseArtifact(path);
  const errors = [...parsed.errors];
  const record = parsed.artifact;
  if (!record) return { bundle: null, errors };
  const m = record.metadata;
  const id = basename(dir);
  const status = m.status ?? "";
  const executing = ["accepted", "in-progress", "passed", "failed"].includes(status);
  if (STAGE_FILES.some(file => existsSync(join(dir, file)))) errors.push(`${path}: do not mix change.md with stage files`);
  if (m.schema !== "4") errors.push(`${path}: change.md requires schema 4; legacy records are not accepted`);
  if (m.id !== id) errors.push(`${path}: id must match bundle ${id}`);
  if (!isValidDate(m.created ?? "")) errors.push(`${path}: created must be YYYY-MM-DD`);
  if (!RISK_LEVELS.has(m.risk ?? "")) errors.push(`${path}: invalid risk`);
  if (!["draft", "accepted", "in-progress", "blocked", "passed", "failed", "rejected", "superseded"].includes(status)) {
    errors.push(`${path}: invalid change status ${JSON.stringify(status)}`);
  }
  for (const heading of ["intent", "acceptance criteria", "plan", "verification", "review and release"]) {
    errors.push(requireHeading(record, heading) ?? "");
  }
  if (executing) {
    for (const key of ["owner", "source", "approved_by", "approval_source", "next_trigger"]) {
      if (!isConcrete(m[key])) errors.push(`${path}: execution requires ${key}`);
    }
    if (!isValidDate(m.approved_at ?? "")) errors.push(`${path}: execution requires approved_at YYYY-MM-DD`);
    if (!isConcrete(m.scope)) errors.push(`${path}: execution requires explicit scope`);
    else errors.push(...validateScope(m.scope, path));
    for (const heading of ["intent", "acceptance criteria", "plan"]) {
      errors.push(requireNoPlaceholders(path, record.sections[heading] ?? "") ?? "");
    }
    if (INDEPENDENT_RISK_LEVELS.has(m.risk)) {
      if (normalizedActor(m.approved_by) === normalizedActor(m.owner)) errors.push(`${path}: high/critical requires an approver other than the owner`);
      if (!isConcrete(m.design_approved_by) || normalizedActor(m.design_approved_by) === normalizedActor(m.owner)
        || !isValidDate(m.design_approved_at ?? "") || !isConcrete(m.design_approval_source)) {
        errors.push(`${path}: high/critical requires independent design approval, date, and source`);
      }
    }
  }
  if (["blocked", "rejected", "superseded"].includes(status) && !isConcrete(m.next_trigger)) {
    errors.push(`${path}: ${status} requires a concrete next_trigger`);
  }
  const view = (sections: Record<string, string>, viewStatus: string): Artifact => ({
    ...record, metadata: { ...m, status: viewStatus }, sections,
  });
  const intent = view(record.sections, executing ? "accepted" : "draft");
  const spec = view(record.sections, intent.metadata.status);
  const plan = view(record.sections, intent.metadata.status);
  const evidence = record.sections.verification ?? "";
  const verification = view({
    "automated checks": evidence,
    "deviations and residual risk": evidence,
    verdict: evidence,
    "review and release": record.sections["review and release"] ?? "",
  }, ["passed", "failed"].includes(status) ? status : "in-progress");
  errors.push(...validateAcceptanceCriteria(spec));
  errors.push(...validateVerificationEvidence(intent, spec, verification));
  for (const id of duplicates(v2Evidence(evidence).map(item => item.id))) {
    errors.push(`${path}: duplicate verification evidence ${id}`);
  }
  if (status === "passed") {
    errors.push(requireNoPlaceholders(path, readFileSync(path, "utf8")) ?? "");
    for (const criterion of v2Criteria(spec.sections["acceptance criteria"] ?? "")) {
      if (criterion.mark.toLowerCase() !== "x") errors.push(`${path}: passed change requires checked ${criterion.id}`);
    }
    if (!isConcrete(m.revision)) errors.push(`${path}: passed change requires verified revision or worktree baseline`);
  }
  errors.push(...validateLocalLinks(root, path));
  return { bundle: { id, dir, intent, spec, plan, verification }, errors: errors.filter(Boolean) };
}

// Existing untouched records remain readable. Worktree/PR gates require adoption on changed
// schema-5 bundles, so deleting the cleanup fields cannot bypass the handoff check.
export function validateCleanup(verification: Artifact, required = false): string[] {
  const status = verification.metadata.cleanup_status;
  if (status === undefined && !required) return [];
  const path = display(verification.path);
  const errors: string[] = [];
  if (!["pending", "complete", "blocked"].includes(status ?? "")) {
    return [`${path}: requires cleanup_status pending, complete, or blocked`];
  }
  const section = verification.sections.cleanup ?? "";
  if (!section.trim()) errors.push(`${path}: requires ## Cleanup`);
  if (verification.metadata.status === "passed" && status !== "complete") {
    errors.push(`${path}: passed verification requires cleanup_status complete`);
  }
  if (["failed", "blocked"].includes(verification.metadata.status) && status === "pending") {
    errors.push(`${path}: failed/blocked handoff must record cleanup complete or blocked`);
  }
  if (status === "pending") return errors;
  for (const label of ["Removed", "Retained", "Processes", "Evidence"]) {
    if (!isConcrete(labelValue(section, label))) errors.push(`${path}: Cleanup requires concrete ${label}`);
  }
  const retained = labelValue(section, "Retained") ?? "";
  if (status === "blocked" || !/^none(?:[.;:\s—-]|$)/i.test(retained)) {
    for (const label of ["Retention owner", "Cleanup trigger"]) {
      if (!isConcrete(labelValue(section, label))) errors.push(`${path}: retained resources require ${label}`);
    }
  }
  if (status === "blocked" && !isConcrete(labelValue(section, "Blocker"))) {
    errors.push(`${path}: blocked cleanup requires Blocker`);
  }
  const evidence = labelValue(section, "Evidence") ?? "";
  if (!evidence.includes("`") && linkTargets(evidence).length === 0) {
    errors.push(`${path}: cleanup Evidence must cite an inspection/cleanup command or linked artifact`);
  }
  return errors;
}

// Schema 5 separates facts into four files while reusing evidence/scope/release Gates.
function validateFourStageBundle(root: string, dir: string, stages: Partial<Record<(typeof STAGE_FILES)[number], Artifact>>): { bundle: StageBundle | null; errors: string[] } {
  const errors: string[] = [];
  const id = basename(dir);
  const intent = stages["intent.md"]!;
  const spec = stages["spec.md"];
  const plan = stages["plan.md"];
  const verification = stages["verification.md"];
  const risk = intent.metadata.risk ?? "";
  const headings = [["intent"], ["design", "acceptance criteria"], ["plan"], ["verification", "review and release"]];
  const fieldOwners: Record<string, string> = {
    source: "intent", risk: "intent", approved_by: "intent", approved_at: "intent", approval_source: "intent",
    design_approved_by: "spec", design_approved_at: "spec", design_approval_source: "spec",
    scope: "plan", revision: "verification", verification_mode: "verification",
    verified_by: "verification", verified_at: "verification", release_target: "verification", cleanup_status: "verification",
  };
  const implementationOwners = [intent, plan].filter(Boolean).map(stage => normalizedActor(stage!.metadata.owner));
  for (const [index, fileName] of STAGE_FILES.entries()) {
    const stage = stages[fileName];
    if (!stage) { errors.push(`${dir}: missing ${fileName}`); continue; }
    const name = fileName.replace(".md", "");
    const status = stage.metadata.status ?? "";
    const active = index === 3 ? ["in-progress", "passed", "failed"].includes(status) : status === "accepted";
    errors.push(...validateStageCommon(stage, name, new Set(index === 3
      ? ["pending", "in-progress", "blocked", "passed", "failed"]
      : ["draft", "in-review", "accepted", "rejected"]), id, "5"));
    for (const heading of headings[index]) errors.push(requireHeading(stage, heading) ?? "");
    for (const [field, owner] of Object.entries(fieldOwners)) {
      if (field in stage.metadata && owner !== name) errors.push(`${stage.path}: ${field} belongs only in ${owner}.md`);
    }
    if (index > 0) {
      const previousName = STAGE_FILES[index - 1];
      if (stage.metadata.based_on !== previousName) errors.push(`${stage.path}: based_on must be ${previousName}`);
      if (active && stages[previousName]?.metadata.status !== "accepted") errors.push(`${stage.path}: ${previousName} must be accepted before ${name}`);
    }
    if (status === "accepted" || status === "passed") errors.push(requireNoPlaceholders(stage.path, readFileSync(stage.path, "utf8")) ?? "");
    if ((status === "blocked" || status === "rejected") && !isConcrete(stage.metadata.next_trigger)) errors.push(`${stage.path}: ${status} requires a concrete next_trigger`);
    errors.push(...validateLocalLinks(root, stage.path));
  }
  if (intent.metadata.status === "accepted") {
    errors.push(...validateApproval(intent, risk));
    for (const key of ["source", "approval_source"]) {
      if (!isConcrete(intent.metadata[key])) errors.push(`${intent.path}: accepted intent requires ${key}`);
    }
    if (INDEPENDENT_RISK_LEVELS.has(risk) && implementationOwners.includes(normalizedActor(intent.metadata.approved_by))) errors.push(`${intent.path}: high/critical authorization requires an independent approver`);
  }
  if (spec) {
    errors.push(...validateAcceptanceCriteria(spec));
    if (spec.metadata.status === "accepted" && INDEPENDENT_RISK_LEVELS.has(risk)) {
      const m = spec.metadata;
      if (!isConcrete(m.design_approved_by) || implementationOwners.includes(normalizedActor(m.design_approved_by))
        || !isValidDate(m.design_approved_at ?? "") || !isConcrete(m.design_approval_source)) errors.push(`${spec.path}: high/critical requires independent design approval, date, and source`);
    }
  }
  if (plan?.metadata.status === "accepted") {
    if (!isConcrete(plan.metadata.scope)) errors.push(`${plan.path}: plan requires explicit scope`);
    else errors.push(...validateScope(plan.metadata.scope, plan.path));
  }
  if (verification) errors.push(...validateCleanup(verification));
  // Expose section views only in memory; evidence still lives solely in verification.md.
  let evidenceView = verification;
  if (spec && verification) {
    const evidence = verification.sections.verification ?? "";
    evidenceView = { ...verification, sections: { ...verification.sections,
      "automated checks": evidence, "deviations and residual risk": evidence, verdict: evidence } };
    errors.push(...validateVerificationEvidence(intent, spec, evidenceView));
    for (const criterion of duplicates(v2Evidence(evidence).map(item => item.id))) errors.push(`${verification.path}: duplicate verification evidence ${criterion}`);
    if (verification.metadata.status === "passed") {
      for (const criterion of v2Criteria(spec.sections["acceptance criteria"] ?? "")) {
        if (criterion.mark.toLowerCase() !== "x") errors.push(`${spec.path}: passed verification requires checked ${criterion.id}`);
      }
      if (!isConcrete(verification.metadata.revision)) errors.push(`${verification.path}: passed verification requires verified revision or worktree baseline`);
      if (INDEPENDENT_RISK_LEVELS.has(risk) && implementationOwners.includes(normalizedActor(verification.metadata.verified_by))) errors.push(`${verification.path}: high/critical verification requires an independent verifier`);
    }
  }
  return { bundle: { id, dir, intent, spec, plan, verification: evidenceView }, errors: errors.filter(Boolean) };
}

export function validateStageBundle(root: string, bundleDir: string): { bundle: StageBundle | null; errors: string[] } {
  const errors: string[] = [];
  const bundleId = basename(bundleDir);
  if (!CHANGE_ID_RE.test(bundleId)) {
    return { bundle: null, errors: [`${display(bundleDir)}: invalid change bundle id`] };
  }
  if (existsSync(join(bundleDir, "change.md"))) return validateChangeRecord(root, bundleDir);

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
  if (Object.values(stages).some(stage => stage.metadata.schema === "5")) {
    const result = validateFourStageBundle(root, bundleDir, stages);
    return { bundle: result.bundle, errors: [...errors, ...result.errors] };
  }
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
    .filter((path) => [...STAGE_FILES, "change.md"].some(file => existsSync(join(path, file))))
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
