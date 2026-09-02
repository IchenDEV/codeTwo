import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { validateDocumentation } from "./docs";
import { REQUIRED_FILES, validateRepository } from "./sdlc";

const BUNDLE_ID = "2026-08-30-example";
const BUNDLE_DIR = `docs/sdlc/changes/${BUNDLE_ID}`;

function write(root: string, path: string, body: string): void {
  const absolute = join(root, path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, body);
}

function temporaryRoot(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

function git(root: string, ...args: string[]): string {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || `git ${args.join(" ")} failed`);
  }
  return result.stdout.trim();
}

function stageSections(name: string): string {
  const common = (heading: string, body: string) => `## ${heading}\n\n${body}\n\n`;
  if (name === "intent") {
    return [
      common("Problem", "Real problem and desired outcome."),
      common("Proposed outcome", "Observable improvement."),
      common("Affected users and systems", "Repository maintainers."),
      common("Constraints", "Keep scope narrow."),
      common("Out of scope", "Product runtime."),
      common("Success signals", "Checks pass."),
      common("Open questions", "None."),
      common("Decision", "Accepted for fixture."),
    ].join("");
  }
  if (name === "spec") {
    return [
      common("Requirements", "Observable behavior."),
      common("User experience", "No user-facing change."),
      common("Technical design", "Fixture only."),
      common("Security and privacy", "Not applicable."),
      common("Alternatives and non-goals", "None."),
      common("Areas of concern", "None."),
      common("Acceptance criteria", "- [x] AC-1: The observable result is checked by `example-check`."),
      common("Decision", "Accepted for fixture."),
    ].join("");
  }
  if (name === "plan") {
    return [
      common("Files and ownership", "README.md"),
      common("Order of work", "Implement and verify."),
      common("Test-first proof", "`example-check`"),
      common("Visual or integration proof", "Not applicable."),
      common("Risks and mitigations", "Low risk."),
      common("Rollback", "Revert diff."),
      common("Deviations", "None."),
      common("Decision", "Accepted for fixture."),
    ].join("");
  }
  return [
    common("Automated checks", "- AC-1: PASS — `example-check` passed in the fixed fixture."),
    common("Behavioral evidence", "- AC-1: PASS — `example-check` passed in the fixed fixture."),
    common("Visual evidence", "Not applicable."),
    common("Security and privacy evidence", "Not applicable."),
    common("Deviations and residual risk", "Residual risk: the check covers only the fixture."),
    common("Verdict", "Verdict: verified."),
    common(
      "Review and release",
      "Approval: product owner approved on 2026-08-30.\nRelease target: none.\nRelease identity: not applicable until released.\nSmoke evidence: not applicable until released.\nRollback: revert diff.\nNo release: fixture only.",
    ),
    common("Feedback", "No feedback recorded yet."),
  ].join("");
}

function writeStageBundle(
  root: string,
  {
    planAccepted = true,
    verificationStatus = "passed",
    scope = "README.md",
    risk = "medium",
    approver = "reviewer",
    owner = "repository maintainers",
    acPass = true,
    releaseTarget = "none",
    releaseApproval = "pending",
  }: {
    planAccepted?: boolean;
    verificationStatus?: string;
    scope?: string;
    risk?: string;
    approver?: string;
    owner?: string;
    acPass?: boolean;
    releaseTarget?: string;
    releaseApproval?: string;
  } = {},
): void {
  const accepted = planAccepted ? "accepted" : "draft";
  const verificationBody = stageSections("verification")
    .replaceAll(
      "- AC-1: PASS — `example-check` passed in the fixed fixture.",
      acPass
        ? "- AC-1: PASS — `example-check` passed in the fixed fixture."
        : "- AC-1: BLOCKED — missing proof.",
    )
    .replace("Verdict: verified.", verificationStatus === "passed" ? "Verdict: verified." : "Verdict: pending.");
  write(
    root,
    `${BUNDLE_DIR}/intent.md`,
    `---\nid: "${BUNDLE_ID}"\nstage: intent\nschema: 3\nstatus: accepted\nowner: ${owner}\ncreated: 2026-08-30\nsource: user\nrisk: ${risk}\napproved_by: "${approver}"\napproved_at: "2026-08-30"\n---\n\n# Intent: Example\n\n${stageSections("intent")}`,
  );
  write(
    root,
    `${BUNDLE_DIR}/spec.md`,
    `---\nid: "${BUNDLE_ID}"\nstage: spec\nschema: 3\nstatus: accepted\nowner: ${owner}\ncreated: 2026-08-30\nbased_on: intent.md\nrisk: ${risk}\napproved_by: "${approver}"\napproved_at: "2026-08-30"\n---\n\n# Spec: Example\n\n${stageSections("spec")}`,
  );
  write(
    root,
    `${BUNDLE_DIR}/plan.md`,
    `---\nid: "${BUNDLE_ID}"\nstage: plan\nschema: 3\nstatus: ${accepted}\nowner: ${owner}\ncreated: 2026-08-30\nbased_on: spec.md\nrisk: ${risk}\nscope: ${scope}\napproved_by: "${planAccepted ? approver : ""}"\napproved_at: "${planAccepted ? "2026-08-30" : ""}"\n---\n\n# Plan: Example\n\n${stageSections("plan")}`,
  );
  write(
    root,
    `${BUNDLE_DIR}/verification.md`,
    `---\nid: "${BUNDLE_ID}"\nstage: verification\nschema: 3\nstatus: ${verificationStatus}\nowner: ${owner}\ncreated: 2026-08-30\nbased_on: plan.md\ncommit: ""\nverification_mode: owner\nverified_by: "${verificationStatus === "passed" ? approver : ""}"\nverified_at: "${verificationStatus === "passed" ? "2026-08-30" : ""}"\nrelease_target: ${releaseTarget}\nrelease_identity: ""\n---\n\n# Verification: Example\n\n${verificationBody.replace("Approval: product owner approved on 2026-08-30.", `Approval: ${releaseApproval}.`)}`,
  );
}

function sdlcRoot(): string {
  const root = temporaryRoot("codetwo-sdlc-");
  for (const path of REQUIRED_FILES) write(root, path, "# Contract\n");
  writeStageBundle(root);
  return root;
}

const EVAL = `---
id: eval-example-gate
kind: eval
status: active
owner: repository maintainers
approvers: repository maintainers
created: 2026-08-30
updated: 2026-08-30
source: real change fixture
inputs: fixed temporary repository
outputs: deterministic assertion result
next_trigger: lifecycle contract changes
---

# Example gate

## Provenance
Derived from the [example change](../changes/2026-08-30-example/intent.md).

## Fixed input and environment
Temporary Git repository at a fixed baseline.

## Allowed actions
Read the fixture and write only inside its temporary directory.

## Observable acceptance
The invalid fixture fails and the valid fixture passes.

## Scoring and failure classes
Exact process exit and error assertions.

## Last result
Result: pass.
Revision: fixture-v1.
Evidence: \`bun test script/verify/checks.test.ts\`.
`;

const INCIDENT = `---
id: incident-2026-08-30-example
kind: incident
status: resolved
owner: repository maintainers
approvers: repository maintainers
created: 2026-08-30
updated: 2026-08-30
source: deterministic alert fixture
inputs: alert and diagnostic evidence
outputs: recovery, follow-up change, and regression eval
next_trigger: follow-up change executes
---

# Example incident

## Detection and impact
A deterministic fixture alert detected the failure.

## Timeline
The fixture records detection and recovery order.

## Diagnosis
The fixture establishes the cause.

## Mitigation and recovery
Recovery verdict: recovered.

The recovery assertion passed.

## Follow-ups
Track the [follow-up change](../changes/2026-08-30-example/intent.md).

## Regression eval
Run the [gate Eval](../evals/example-gate.md).
`;

test("documentation Gate accepts the catalog and rejects unsafe drift", () => {
  const root = temporaryRoot("codetwo-docs-");
  try {
    write(
      root,
      "docs/catalog.json",
      `{"schema":1,"rules":[
        {"classification":"catalog","authority":"current","paths":["docs/catalog.json"]},
        {"classification":"contract","authority":"current","paths":["docs/reference/current.md"]},
        {"classification":"change-record","authority":"historical-state","pattern":"^docs/sdlc/changes/.+/intent\\\\.md$"},
        {"classification":"change-evidence","authority":"historical-evidence","pattern":"^docs/sdlc/changes/.+/evidence/"},
        {"classification":"archive","authority":"historical-non-normative","pattern":"^docs/archive/"}
      ]}`,
    );
    write(root, "docs/reference/current.md", "# Current\n\n[Archive](../archive/README.md)\n");
    write(root, "docs/archive/README.md", "# Archive\n");
    write(
      root,
      "docs/sdlc/changes/2026-08-30-example/intent.md",
      "---\nschema: 3\nstage: intent\n---\n\n![Evidence](evidence/window.png)\n",
    );
    write(root, "docs/sdlc/changes/2026-08-30-example/evidence/window.png", "fixture");
    expect(validateDocumentation(root)).toEqual([]);

    write(root, "docs/reference/current.md", "# Current\n\n[Missing](missing.md)\n");
    write(root, "docs/loose.md", "# Loose\n");
    write(root, "docs/archive/orphan.png", "fixture");
    write(root, "docs/sdlc/changes/2026-08-30-example/intent.md", "---\nstatus: accepted\n---\n");
    const errors = validateDocumentation(root);
    for (const fragment of ["unclassified", "broken local link", "unreferenced documentation image", "must use schema 3"]) {
      expect(errors.some((error) => error.includes(fragment))).toBe(true);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("SDLC Gate accepts complete stage bundles and rejects missing approval", () => {
  const root = sdlcRoot();
  try {
    expect(validateRepository(root)).toEqual([]);
    writeStageBundle(root, { acPass: false, verificationStatus: "passed" });
    expect(validateRepository(root).some((error) => error.includes("requires PASS for AC-1"))).toBe(true);
    writeStageBundle(root, { risk: "high", approver: "repository maintainers", owner: "repository maintainers" });
    expect(validateRepository(root).some((error) => error.includes("approver other than"))).toBe(true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("release, Incident, and Eval Gates fail closed on missing evidence", () => {
  const root = sdlcRoot();
  try {
    writeStageBundle(root, { releaseTarget: "versioned macOS release", releaseApproval: "pending" });
    expect(
      validateRepository(root, undefined, BUNDLE_ID).some((error) => error.includes("release Approval")),
    ).toBe(true);

    write(root, "docs/sdlc/incidents/2026-08-30-example.md", INCIDENT);
    write(root, "docs/sdlc/evals/example-gate.md", EVAL);
    writeStageBundle(root);
    expect(validateRepository(root)).toEqual([]);

    write(
      root,
      "docs/sdlc/incidents/2026-08-30-example.md",
      INCIDENT.replace("../changes/2026-08-30-example/intent.md", "Follow-up pending."),
    );
    write(
      root,
      "docs/sdlc/evals/example-gate.md",
      EVAL.replace("Result: pass.", "Result: pending."),
    );
    const evidenceErrors = validateRepository(root);
    expect(evidenceErrors.some((error) => error.includes("linked follow-up change"))).toBe(true);
    expect(evidenceErrors.some((error) => error.includes("requires Result pass"))).toBe(true);

    write(
      root,
      "docs/sdlc/evals/example-gate.md",
      EVAL.replace(
        "Derived from the [example change](../changes/2026-08-30-example/intent.md).",
        "Provenance pending.",
      ),
    );
    expect(
      validateRepository(root).some((error) => error.includes("linked provenance")),
    ).toBe(true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("committed branch Gate requires accepted plan scope", () => {
  const root = sdlcRoot();
  try {
    git(root, "init", "-q");
    git(root, "config", "user.name", "SDLC Test");
    git(root, "config", "user.email", "sdlc-test@example.invalid");
    git(root, "add", ".");
    git(root, "commit", "-qm", "baseline");
    const base = git(root, "rev-parse", "HEAD");

    writeStageBundle(root, { scope: "README.md" });
    write(root, "notes.txt", "uncovered change\n");
    git(root, "add", ".");
    git(root, "commit", "-qm", "uncovered implementation");
    expect(validateRepository(root, base).some((error) => error.includes("notes.txt: changed path is not covered"))).toBe(true);

    writeStageBundle(root, { scope: "README.md, notes.txt" });
    git(root, "add", `${BUNDLE_DIR}/plan.md`);
    git(root, "commit", "-qm", "cover implementation");
    expect(validateRepository(root, base)).toEqual([]);

    write(
      root,
      `${BUNDLE_DIR}/intent.md`,
      readFileSync(join(root, `${BUNDLE_DIR}/intent.md`), "utf8").replace("schema: 3", "schema: 2"),
    );
    git(root, "add", `${BUNDLE_DIR}/intent.md`);
    git(root, "commit", "-qm", "remove schema");
    expect(validateRepository(root, base).some((error) => error.includes("schema 3 is required"))).toBe(true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("worktree Gate includes staged and untracked paths", () => {
  const root = sdlcRoot();
  try {
    git(root, "init", "-q");
    git(root, "config", "user.name", "SDLC Test");
    git(root, "config", "user.email", "sdlc-test@example.invalid");
    git(root, "add", ".");
    git(root, "commit", "-qm", "baseline");

    writeStageBundle(root, { scope: "README.md" });
    write(root, "README.md", "staged change\n");
    git(root, "add", "README.md");
    write(root, "notes.txt", "untracked change\n");
    expect(
      validateRepository(root, undefined, undefined, true).some((error) =>
        error.includes("notes.txt: changed path is not covered"),
      ),
    ).toBe(true);

    writeStageBundle(root, { scope: "README.md, notes.txt" });
    expect(validateRepository(root, undefined, undefined, true)).toEqual([]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
