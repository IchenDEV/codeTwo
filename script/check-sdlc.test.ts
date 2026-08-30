import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

import { REQUIRED_FILES, validateRepository } from "./check-sdlc";

const VALID_CHANGE = `---
id: change-2026-08-30-example
kind: change
status: executing
owner: repository maintainers
approvers: user request on 2026-08-30
created: 2026-08-30
updated: 2026-08-30
source: user request
inputs: accepted intent and repository evidence
outputs: implementation and verification evidence
next_trigger: verification runs
---

# Example

## Intent
Real problem and desired outcome.

## Spec
Observable behavior.

### Acceptance criteria

- [ ] The observable result is checked by \`example-check\`.

## Decision and gates
The user accepted the Intent. Merge and release remain separate Gates.

## Plan
Implement and verify the smallest change.

## Build
Implementation is linked here.

## Verification
Verdict: pending.

The actual \`example-check\` result will be recorded.

Residual risk: pending.

## Review and release
Approval: pending.
Release target: none.
Rollback: revert the implementation diff.

## Feedback
No feedback recorded yet.
`;

const VALID_EVAL = `---
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
Derived from the [example change](../changes/2026-08-30-example.md).

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
Evidence: \`bun test script/check-sdlc.test.ts\`.
`;

const VALID_INCIDENT = `---
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
Track the [follow-up change](../changes/2026-08-30-example.md).

## Regression eval
Run the [gate Eval](../evals/example-gate.md).
`;

function verifiedChange(): string {
  return VALID_CHANGE.replace("status: executing", "status: verified")
    .replace("- [ ]", "- [x]")
    .replace("Verdict: pending.", "Verdict: verified.")
    .replace("Residual risk: pending.", "Residual risk: the check covers only the fixture.");
}

function readyChange(): string {
  return verifiedChange()
    .replace("status: verified", "status: ready-to-release")
    .replace("Approval: pending.", "Approval: product owner approved release on 2026-08-30.")
    .replace("Release target: none.", "Release target: versioned macOS release.");
}

function write(root: string, path: string, contents: string): void {
  const absolute = join(root, path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, contents);
}

function git(root: string, ...args: string[]): string {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || `git ${args.join(" ")} failed`);
  }
  return result.stdout.trim();
}

describe("AI-native SDLC contract", () => {
  let root = "";
  const changePath = "docs/sdlc/changes/2026-08-30-example.md";

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "codetwo-sdlc-"));
    for (const path of REQUIRED_FILES) write(root, path, "# Contract\n");
    write(root, changePath, VALID_CHANGE);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test("accepts an executing canonical change", () => {
    expect(validateRepository(root)).toEqual([]);
  });

  test("rejects superseded lifecycle sources", () => {
    for (const path of [
      "docs/superpowers/specs/retired.md",
      "docs/sdlc/changes/2026-08-29-sdlc-bootstrap.md",
      "docs/sdlc/evals/legacy-workflow-single-source.md",
    ]) {
      write(root, path, "retired\n");
      expect(validateRepository(root).some((error) => error.includes("superseded lifecycle path"))).toBe(true);
      rmSync(join(root, path));
      if (path.startsWith("docs/superpowers")) rmSync(join(root, "docs/superpowers"), { recursive: true });
    }
  });

  test("rejects duplicate ids and missing sections", () => {
    write(root, "docs/sdlc/changes/2026-08-30-duplicate.md", VALID_CHANGE);
    expect(validateRepository(root).some((error) => error.includes("duplicate artifact id"))).toBe(true);
    rmSync(join(root, "docs/sdlc/changes/2026-08-30-duplicate.md"));

    write(root, changePath, VALID_CHANGE.replace("## Feedback\nNo feedback recorded yet.\n", ""));
    expect(validateRepository(root).some((error) => error.includes("missing required section ## Feedback"))).toBe(true);
  });

  test("requires closed acceptance and evidence for verified changes", () => {
    write(root, changePath, VALID_CHANGE.replace("status: executing", "status: verified"));
    const errors = validateRepository(root);
    expect(errors.some((error) => error.includes("every acceptance criterion checked"))).toBe(true);
    expect(errors.some((error) => error.includes("Verdict: verified"))).toBe(true);
    expect(errors.some((error) => error.includes("concrete Residual risk"))).toBe(true);

    write(root, changePath, verifiedChange());
    expect(validateRepository(root)).toEqual([]);
  });

  test("requires approval, target, and rollback at the release gate", () => {
    write(root, changePath, verifiedChange().replace("status: verified", "status: ready-to-release"));
    const incomplete = validateRepository(root, undefined, "change-2026-08-30-example");
    expect(incomplete.some((error) => error.includes("release Approval"))).toBe(true);
    expect(incomplete.some((error) => error.includes("Release target"))).toBe(true);

    write(root, changePath, readyChange());
    expect(validateRepository(root, undefined, "change-2026-08-30-example")).toEqual([]);

    write(root, changePath, readyChange().replace("Rollback: revert the implementation diff.", "Rollback: pending."));
    expect(validateRepository(root).some((error) => error.includes("concrete Rollback path"))).toBe(true);
  });

  test("requires identity and smoke evidence for released changes", () => {
    write(root, changePath, readyChange().replace("status: ready-to-release", "status: released"));
    const errors = validateRepository(root);
    expect(errors.some((error) => error.includes("Release identity"))).toBe(true);
    expect(errors.some((error) => error.includes("Smoke evidence"))).toBe(true);
  });

  test("requires recovery, change, and eval links for resolved incidents", () => {
    write(root, "docs/sdlc/incidents/2026-08-30-example.md", VALID_INCIDENT);
    write(root, "docs/sdlc/evals/example-gate.md", VALID_EVAL);
    expect(validateRepository(root)).toEqual([]);

    write(
      root,
      "docs/sdlc/incidents/2026-08-30-example.md",
      VALID_INCIDENT.replace(
        "Track the [follow-up change](../changes/2026-08-30-example.md).",
        "Blocked: pending.",
      ),
    );
    expect(validateRepository(root).some((error) => error.includes("linked follow-up change"))).toBe(true);
  });

  test("requires real provenance and a result for active evals", () => {
    write(
      root,
      "docs/sdlc/evals/example-gate.md",
      VALID_EVAL.replace(
        "Derived from the [example change](../changes/2026-08-30-example.md).",
        "Derived from an unspecified task.",
      ).replace("Result: pass.", "Result: pending."),
    );
    const errors = validateRepository(root);
    expect(errors.some((error) => error.includes("linked real-task"))).toBe(true);
    expect(errors.some((error) => error.includes("Result: pass"))).toBe(true);
  });

  test("allows an artifact-only draft but blocks implementation before acceptance", () => {
    git(root, "init", "-q");
    git(root, "config", "user.name", "SDLC Test");
    git(root, "config", "user.email", "sdlc-test@example.invalid");
    git(root, "add", ".");
    git(root, "commit", "-qm", "baseline");
    const base = git(root, "rev-parse", "HEAD");

    write(
      root,
      changePath,
      VALID_CHANGE.replace("status: executing", "status: draft")
        .replace("owner: repository maintainers", "owner: unassigned")
        .replace("approvers: user request on 2026-08-30", "approvers: []"),
    );
    git(root, "add", changePath);
    git(root, "commit", "-qm", "propose draft intent");
    expect(validateRepository(root, base)).toEqual([]);

    write(root, "README.md", "implementation change\n");
    git(root, "add", "README.md");
    git(root, "commit", "-qm", "build before intent acceptance");
    expect(validateRepository(root, base).some((error) => error.includes("branch implementation changes require"))).toBe(true);

    write(
      root,
      changePath,
      VALID_CHANGE.replace(
        "Implementation is linked here.",
        "Implementation evidence for the current branch is linked here.",
      ),
    );
    git(root, "add", changePath);
    git(root, "commit", "-qm", "accept and execute change");
    expect(validateRepository(root, base)).toEqual([]);
  });

  test("requires a changed change artifact for branch implementation", () => {
    git(root, "init", "-q");
    git(root, "config", "user.name", "SDLC Test");
    git(root, "config", "user.email", "sdlc-test@example.invalid");
    git(root, "add", ".");
    git(root, "commit", "-qm", "baseline");
    const base = git(root, "rev-parse", "HEAD");

    write(root, "README.md", "material repository change\n");
    git(root, "add", "README.md");
    git(root, "commit", "-qm", "change without artifact");
    expect(validateRepository(root, base).some((error) => error.includes("added or updated canonical file"))).toBe(true);
  });
});
