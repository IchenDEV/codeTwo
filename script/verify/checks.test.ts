import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { validateDocumentation } from "./docs";
import { REQUIRED_FILES, validateRepository } from "./sdlc";

const CHANGE_PATH = "docs/sdlc/changes/2026-08-30-example/change.md";

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

function change({
  status = "executing",
  risk = "medium",
  scope = "README.md",
  approvers = "user request on 2026-08-30",
  releaseApproved = false,
  releasedEvidence = false,
}: {
  status?: string;
  risk?: string;
  scope?: string;
  approvers?: string;
  releaseApproved?: boolean;
  releasedEvidence?: boolean;
} = {}): string {
  const closed = ["verified", "ready-to-release", "released", "closed"].includes(status);
  return `---
id: change-2026-08-30-example
kind: change
schema: 2
status: ${status}
risk: ${risk}
owner: repository maintainers
approvers: ${approvers}
approved_at: 2026-08-30
created: 2026-08-30
updated: 2026-08-30
source: user request
inputs: accepted intent and repository evidence
outputs: implementation and verification evidence
scope: ${scope}
next_trigger: verification runs
verification_mode: owner
verified_by: ${closed ? "repository maintainers" : "pending"}
verified_at: ${closed ? "2026-08-30" : "pending"}
---

# Example

## Intent
Real problem and desired outcome.

## Spec
Observable behavior.

### Acceptance criteria

- [${closed ? "x" : " "}] AC-1: The observable result is checked by \`example-check\`.

## Decision and gates
The user accepted the Intent. Merge and release remain separate Gates.

## Plan
Implement and verify the smallest change.

## Build
Implementation evidence is linked here.

## Verification
Verdict: ${closed ? "verified" : "pending"}.

### Acceptance evidence

- AC-1: ${closed ? "PASS — `example-check` passed in the fixed fixture." : "pending — the `example-check` result will be recorded."}

Residual risk: ${closed ? "the check covers only the fixture." : "pending."}

## Review and release
Approval: ${releaseApproved ? "product owner approved release on 2026-08-30." : "pending."}
Release target: ${releaseApproved ? "versioned macOS release." : "none."}
Release identity: ${releasedEvidence ? "v1.0.0 artifact sha256:fixture." : "not applicable until released."}
Smoke evidence: ${releasedEvidence ? "`smoke-check` passed." : "not applicable until released."}
Rollback: revert the implementation diff.

## Feedback
No feedback recorded yet.
`;
}

function sdlcRoot(): string {
  const root = temporaryRoot("codetwo-sdlc-");
  for (const path of REQUIRED_FILES) write(root, path, "# Contract\n");
  write(root, CHANGE_PATH, change());
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
Derived from the [example change](../changes/2026-08-30-example/change.md).

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
Track the [follow-up change](../changes/2026-08-30-example/change.md).

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
        {"classification":"change-record","authority":"historical-state","pattern":"^docs/sdlc/changes/.+/change\\\\.md$"},
        {"classification":"archive","authority":"historical-non-normative","pattern":"^docs/archive/"}
      ]}`,
    );
    write(root, "docs/reference/current.md", "# Current\n\n[Archive](../archive/README.md)\n");
    write(root, "docs/archive/README.md", "# Archive\n");
    expect(validateDocumentation(root)).toEqual([]);

    write(root, "docs/reference/current.md", "# Current\n\n[Missing](missing.md)\n");
    write(root, "docs/loose.md", "# Loose\n");
    write(root, "docs/archive/orphan.png", "fixture");
    write(root, "docs/sdlc/changes/2026-08-30-example/change.md", "---\nstatus: verified\n---\n");
    const errors = validateDocumentation(root);
    for (const fragment of ["unclassified", "broken local link", "unreferenced documentation image", "must use schema 2"]) {
      expect(errors.some((error) => error.includes(fragment))).toBe(true);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("SDLC Gate accepts complete changes and rejects incomplete closure or authority", () => {
  const root = sdlcRoot();
  try {
    expect(validateRepository(root)).toEqual([]);
    write(root, CHANGE_PATH, change({ status: "verified" }));
    expect(validateRepository(root)).toEqual([]);

    write(root, CHANGE_PATH, change({ status: "verified" }).replace("PASS —", "BLOCKED —"));
    expect(validateRepository(root).some((error) => error.includes("requires PASS evidence"))).toBe(true);

    write(root, CHANGE_PATH, change({ risk: "high", approvers: "repository maintainers" }));
    expect(validateRepository(root).some((error) => error.includes("approver other than"))).toBe(true);

    write(root, "docs/sdlc/changes/2026-08-30-duplicate/change.md", change());
    expect(validateRepository(root).some((error) => error.includes("duplicate artifact id"))).toBe(true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("release, Incident, and Eval Gates fail closed on missing evidence", () => {
  const root = sdlcRoot();
  try {
    write(root, CHANGE_PATH, change({ status: "ready-to-release" }));
    const releaseErrors = validateRepository(root, undefined, "change-2026-08-30-example");
    expect(releaseErrors.some((error) => error.includes("release Approval"))).toBe(true);
    expect(releaseErrors.some((error) => error.includes("Release target"))).toBe(true);

    write(root, CHANGE_PATH, change({ status: "released", releaseApproved: true }));
    const releasedErrors = validateRepository(root);
    expect(releasedErrors.some((error) => error.includes("Release identity"))).toBe(true);
    expect(releasedErrors.some((error) => error.includes("Smoke evidence"))).toBe(true);

    write(root, CHANGE_PATH, change());
    write(root, "docs/sdlc/incidents/2026-08-30-example.md", INCIDENT);
    write(root, "docs/sdlc/evals/example-gate.md", EVAL);
    expect(validateRepository(root)).toEqual([]);

    write(root, "docs/sdlc/incidents/2026-08-30-example.md", INCIDENT.replace("Track the [follow-up change](../changes/2026-08-30-example/change.md).", "Follow-up pending."));
    write(root, "docs/sdlc/evals/example-gate.md", EVAL.replace("Derived from the [example change](../changes/2026-08-30-example/change.md).", "Provenance pending.").replace("Result: pass.", "Result: pending."));
    const evidenceErrors = validateRepository(root);
    expect(evidenceErrors.some((error) => error.includes("linked follow-up change"))).toBe(true);
    expect(evidenceErrors.some((error) => error.includes("linked real-task"))).toBe(true);
    expect(evidenceErrors.some((error) => error.includes("Result: pass"))).toBe(true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("committed branch Gate requires a current scoped schema-2 change", () => {
  const root = sdlcRoot();
  try {
    git(root, "init", "-q");
    git(root, "config", "user.name", "SDLC Test");
    git(root, "config", "user.email", "sdlc-test@example.invalid");
    git(root, "add", ".");
    git(root, "commit", "-qm", "baseline");
    const base = git(root, "rev-parse", "HEAD");

    write(root, CHANGE_PATH, change().replace("Implementation evidence is linked here.", "Changed implementation evidence."));
    write(root, "notes.txt", "uncovered change\n");
    git(root, "add", ".");
    git(root, "commit", "-qm", "uncovered implementation");
    expect(validateRepository(root, base).some((error) => error.includes("notes.txt: changed path is not covered"))).toBe(true);

    write(root, CHANGE_PATH, change({ scope: "README.md, notes.txt" }).replace("Implementation evidence is linked here.", "Changed implementation evidence."));
    git(root, "add", CHANGE_PATH);
    git(root, "commit", "-qm", "cover implementation");
    expect(validateRepository(root, base)).toEqual([]);

    write(root, CHANGE_PATH, change({ scope: "README.md, notes.txt" }).replace("schema: 2\n", ""));
    git(root, "add", CHANGE_PATH);
    git(root, "commit", "-qm", "remove schema");
    expect(validateRepository(root, base).some((error) => error.includes("must use schema 2"))).toBe(true);
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

    write(
      root,
      CHANGE_PATH,
      change().replace("Implementation evidence is linked here.", "Changed implementation evidence."),
    );
    write(root, "README.md", "staged change\n");
    git(root, "add", "README.md");
    write(root, "notes.txt", "untracked change\n");
    expect(validateRepository(root, undefined, undefined, true).some((error) => error.includes("notes.txt: changed path is not covered"))).toBe(true);

    write(
      root,
      CHANGE_PATH,
      change({ scope: "README.md, notes.txt" }).replace(
        "Implementation evidence is linked here.",
        "Changed implementation evidence.",
      ),
    );
    expect(validateRepository(root, undefined, undefined, true)).toEqual([]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
