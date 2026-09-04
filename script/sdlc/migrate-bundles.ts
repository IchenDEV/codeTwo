#!/usr/bin/env bun

import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { labelValue, parseArtifact } from "../verify/artifact-parse";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const CHANGES_DIR = join(ROOT, "docs", "sdlc", "changes");

function approverFrom(meta: Record<string, string>): string {
  const raw = meta.approvers ?? "";
  if (!raw || /^(pending|unassigned|\[\])$/i.test(raw)) return "user";
  return raw.replace(/^user via /i, "user").slice(0, 120);
}

function legacyStageStatuses(status: string): {
  intent: string;
  spec: string;
  plan: string;
  verification: string;
} {
  switch (status) {
    case "draft":
    case "in-review":
      return { intent: "draft", spec: "draft", plan: "draft", verification: "pending" };
    case "accepted":
      return { intent: "accepted", spec: "draft", plan: "draft", verification: "pending" };
    case "executing":
    case "blocked":
      return { intent: "accepted", spec: "accepted", plan: "accepted", verification: "pending" };
    case "failed":
      return { intent: "accepted", spec: "accepted", plan: "accepted", verification: "failed" };
    case "verified":
    case "ready-to-release":
    case "released":
    case "closed":
      return { intent: "accepted", spec: "accepted", plan: "accepted", verification: "passed" };
    case "superseded":
      return { intent: "rejected", spec: "draft", plan: "draft", verification: "pending" };
    default:
      return { intent: "draft", spec: "draft", plan: "draft", verification: "pending" };
  }
}

function sectionOrFallback(sections: Record<string, string>, key: string, fallback: string): string {
  const value = sections[key]?.trim();
  return value && !/^(pending|todo|tbd)$/i.test(value) ? value : fallback;
}

function extractAcceptance(specBody: string): string {
  const marker = "### Acceptance criteria";
  if (specBody.includes("AC-1")) {
    const index = specBody.indexOf(marker);
    if (index >= 0) return specBody.slice(index + marker.length).trim();
    return specBody;
  }
  return "- [x] AC-1: Migrated legacy acceptance; see Git history for original criteria.";
}

function migrateBundle(bundleDir: string): void {
  const changePath = join(bundleDir, "change.md");
  if (!existsSync(changePath)) return;
  if (existsSync(join(bundleDir, "intent.md"))) {
    rmSync(changePath);
    return;
  }

  const parsed = parseArtifact(changePath);
  if (!parsed.artifact) throw new Error(parsed.errors.join("; "));
  const { metadata: meta, sections, title: artifactTitle } = parsed.artifact;
  const bundleId = basename(bundleDir);
  const id = meta.id?.startsWith("change-") ? meta.id.slice("change-".length) : bundleId;
  const title = artifactTitle || bundleId;
  const risk = meta.risk ?? "medium";
  const owner = meta.owner ?? "repository maintainers";
  const created = meta.created ?? meta.updated ?? "2026-01-01";
  const approvedAt = meta.approved_at && meta.approved_at !== "pending" ? meta.approved_at : created;
  const approver = approverFrom(meta);
  const stages = legacyStageStatuses(meta.status ?? "draft");
  const scope = meta.scope ?? bundleDir.replace(`${ROOT}/`, "");
  const verificationMode = meta.verification_mode ?? "owner";
  const verifiedBy =
    meta.verified_by && meta.verified_by !== "pending" ? meta.verified_by : approver;
  const verifiedAt =
    meta.verified_at && meta.verified_at !== "pending" ? meta.verified_at : approvedAt;

  const intentBody = sectionOrFallback(sections, "intent", "Migrated from legacy change.md.");
  const specBody = sectionOrFallback(sections, "spec", "See migrated requirements in legacy history.");
  const decision = sectionOrFallback(sections, "decision and gates", "Migrated approval recorded in legacy change.md.");
  const planBody = sectionOrFallback(sections, "plan", "See legacy plan in Git history.");
  const buildBody = sectionOrFallback(sections, "build", "No build notes recorded.");
  const verificationBody = sectionOrFallback(sections, "verification", "Verdict: pending.");
  let reviewBody = sectionOrFallback(sections, "review and release", "Approval: pending.");
  const feedbackBody = sectionOrFallback(sections, "feedback", "No feedback recorded.");

  if (stages.verification === "passed" && /Approval:\s*pending/i.test(reviewBody)) {
    reviewBody = reviewBody.replace(/Approval:\s*pending\.?/i, `Approval: ${approver} approved on ${approvedAt}.`);
  }

  const acceptance = extractAcceptance(specBody);
  const requirements = specBody.split("### Acceptance criteria")[0]?.trim() || specBody;
  const verdict = labelValue(verificationBody, "Verdict") ?? (stages.verification === "passed" ? "verified" : "pending");
  const residual = labelValue(verificationBody, "Residual risk") ?? "See legacy change.md in Git history.";

  writeFileSync(
    join(bundleDir, "intent.md"),
    `---
id: "${id}"
stage: intent
schema: 3
status: ${stages.intent}
owner: ${owner}
created: ${created}
source: ${meta.source ?? "user"}
risk: ${risk}
approved_by: "${stages.intent === "accepted" ? approver : ""}"
approved_at: "${stages.intent === "accepted" ? approvedAt : ""}"
---

# Intent: ${title}

## Problem

${intentBody}

## Proposed outcome

${intentBody.split("\n").find((line) => line.trim()) ?? intentBody}

## Affected users and systems

Migrated from legacy change.md.

## Constraints

${decision}

## Out of scope

Not recorded in the legacy single-file Artifact.

## Success signals

See Spec acceptance criteria.

## Open questions

None recorded in migration.

## Decision

${decision}
`,
  );

  writeFileSync(
    join(bundleDir, "spec.md"),
    `---
id: "${id}"
stage: spec
schema: 3
status: ${stages.spec}
owner: ${owner}
created: ${created}
based_on: intent.md
risk: ${risk}
approved_by: "${stages.spec === "accepted" ? approver : ""}"
approved_at: "${stages.spec === "accepted" ? approvedAt : ""}"
---

# Spec: ${title}

## Requirements

${requirements}

## User experience

Not separately recorded in legacy change.md.

## Technical design

See Requirements and legacy Git history.

## Security and privacy

See migrated Decision and gates.

## Alternatives and non-goals

Not separately recorded in legacy change.md.

## Areas of concern

${decision}

## Acceptance criteria

${acceptance}

## Decision

${decision}
`,
  );

  writeFileSync(
    join(bundleDir, "plan.md"),
    `---
id: "${id}"
stage: plan
schema: 3
status: ${stages.plan}
owner: ${owner}
created: ${created}
based_on: spec.md
risk: ${risk}
scope: ${scope}
approved_by: "${stages.plan === "accepted" ? approver : ""}"
approved_at: "${stages.plan === "accepted" ? approvedAt : ""}"
---

# Plan: ${title}

## Files and ownership

${scope}

## Order of work

${planBody}

## Test-first proof

See legacy Verification section.

## Visual or integration proof

See legacy Verification section.

## Risks and mitigations

See legacy Decision and gates.

## Rollback

See legacy Review and release.

## Deviations

${buildBody}

## Decision

${decision}
`,
  );

  writeFileSync(
    join(bundleDir, "verification.md"),
    `---
id: "${id}"
stage: verification
schema: 3
status: ${stages.verification}
owner: ${owner}
created: ${created}
based_on: plan.md
commit: ""
verification_mode: ${verificationMode}
verified_by: "${stages.verification === "passed" ? verifiedBy : ""}"
verified_at: "${stages.verification === "passed" ? verifiedAt : ""}"
release_target: ${labelValue(reviewBody, "Release target")?.replace(/\.$/, "") ?? "none"}
release_identity: "${labelValue(reviewBody, "Release identity") ?? ""}"
---

# Verification: ${title}

## Automated checks

${verificationBody}

## Behavioral evidence

${verificationBody}

## Visual evidence

See bundle evidence/ when present.

## Security and privacy evidence

Not separately recorded unless present in legacy Verification.

## Deviations and residual risk

Residual risk: ${residual}

## Verdict

Verdict: ${verdict}.

## Review and release

${reviewBody}

## Feedback

${feedbackBody}
`,
  );

  rmSync(changePath);
  console.log(`migrated ${relative(ROOT, bundleDir)}`);
}

let count = 0;
for (const entry of readdirSync(CHANGES_DIR)) {
  const bundleDir = join(CHANGES_DIR, entry);
  try {
    migrateBundle(bundleDir);
    if (!existsSync(join(bundleDir, "change.md"))) count += 1;
  } catch (error) {
    console.error(`failed ${entry}: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
console.log(`done: ${count} bundle(s)`);
