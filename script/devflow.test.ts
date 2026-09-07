import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SOURCE_ROOT = join(import.meta.dir, "..");
const CHANGE_ID = "2026-09-08-single-record-smoke";

function withRepository(check: (root: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), "codetwo-devflow-"));
  try {
    mkdirSync(join(root, "script"), { recursive: true });
    cpSync(join(SOURCE_ROOT, "script/devflow.ts"), join(root, "script/devflow.ts"));
    cpSync(join(SOURCE_ROOT, "script/verify"), join(root, "script/verify"), { recursive: true });
    mkdirSync(join(root, "docs/sdlc/changes"), { recursive: true });
    cpSync(join(SOURCE_ROOT, ".agents/skills"), join(root, ".agents/skills"), { recursive: true });
    writeFileSync(join(root, ".agents/skills/codetwo-develop/references/workflow.md"), "# Fixture workflow\n");
    check(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function run(root: string, args: string[], env: Record<string, string> = {}) {
  const result = spawnSync("bun", ["script/devflow.ts", ...args], {
    cwd: root, encoding: "utf8", env: { ...process.env, GITHUB_EVENT_PATH: "", DEVFLOW_DATE: "2026-09-08", ...env },
  });
  return { status: result.status, output: result.stdout + result.stderr };
}

function git(root: string, ...args: string[]): string {
  const r = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr);
  return r.stdout.trim();
}

function acceptedRecord(root: string): string {
  return readFileSync(join(root, "docs/sdlc/changes", CHANGE_ID, "change.md"), "utf8")
    .replaceAll("[fill]", "Concrete fixture requirement.")
    .replace("owner: unassigned", "owner: fixture")
    .replace("scope: pending", "scope: README.md")
    .replace('approved_by: ""', 'approved_by: "requester"')
    .replace('approved_at: ""', 'approved_at: "2026-09-08"')
    .replace('approval_source: ""', 'approval_source: "Fixture user explicitly requested this bounded change."')
    .replace("status: draft", "status: in-progress");
}

function passedRecord(accepted: string): string {
  return accepted.replace("status: in-progress", "status: passed")
    .replace("[ ] AC-1", "[x] AC-1")
    .replace('revision: ""', 'revision: "disposable worktree fixture"')
    .replace('verified_by: ""', 'verified_by: "fixture"')
    .replace('verified_at: ""', 'verified_at: "2026-09-08"')
    .replace("AC-1: BLOCKED — Acceptance has not been checked.", "AC-1: PASS — `fixture-check` passed in disposable worktree.")
    .replace("Verdict: pending.", "Verdict: verified.")
    .replace("Residual risk: pending.", "Residual risk: disposable fixture only.");
}

test("one record runs request, local work, honest failure, verification and Ready PR without stage approval commands", () => {
  withRepository(root => {
    expect(run(root, ["new", "single-record-smoke", "user", "low"]).status).toBe(0);
    const path = join(root, "docs/sdlc/changes", CHANGE_ID, "change.md");
    expect(existsSync(join(root, "docs/sdlc/changes", CHANGE_ID, "intent.md"))).toBe(false);
    expect(run(root, ["validate"]).status).toBe(0);
    const draft = { PR_BODY: `Change: docs/sdlc/changes/${CHANGE_ID}/change.md`, PR_IS_DRAFT: "true" };
    expect(run(root, ["check-pr"], draft).status).toBe(0);
    expect(run(root, ["check-pr"], { ...draft, PR_IS_DRAFT: "false" }).output).toContain("intent must be accepted");
    const accepted = acceptedRecord(root);
    writeFileSync(path, accepted);
    expect(run(root, ["validate"]).status).toBe(0);
    expect(run(root, ["check-pr"], { ...draft, PR_IS_DRAFT: "false" }).output).toContain("verification passed");
    writeFileSync(path, accepted.replace("status: in-progress", "status: failed")
      .replace("AC-1: BLOCKED — Acceptance has not been checked.", "AC-1: FAIL — `fixture-check` failed.")
      .replace("Verdict: pending.", "Verdict: failed."));
    expect(run(root, ["check-pr"], draft).status).toBe(0);
    expect(run(root, ["check-pr"], { ...draft, PR_IS_DRAFT: "false" }).status).not.toBe(0);
    writeFileSync(path, passedRecord(accepted));
    expect(run(root, ["check-pr"], { ...draft, PR_IS_DRAFT: "false" }).status).toBe(0);
    expect(run(root, ["status", CHANGE_ID]).output).toContain("change.md=passed");
  });
});

test("CI event checks every changed record and scopes implementation; PR text is data", () => {
  withRepository(root => {
    git(root, "init", "-q");
    git(root, "config", "user.name", "Fixture");
    git(root, "config", "user.email", "fixture@example.invalid");
    git(root, "add", ".");
    git(root, "commit", "-qm", "baseline");
    const base = git(root, "rev-parse", "HEAD");
    run(root, ["new", "single-record-smoke", "user", "medium"]);
    const path = join(root, "docs/sdlc/changes", CHANGE_ID, "change.md");
    const accepted = acceptedRecord(root);
    writeFileSync(path, accepted);
    writeFileSync(join(root, "README.md"), "Changed fixture.\n");
    git(root, "add", "."); git(root, "commit", "-qm", "in progress");
    const eventPath = join(root, "event.json");
    const event = { pull_request: { base: { sha: base }, draft: true,
      body: `Change: docs/sdlc/changes/${CHANGE_ID}/change.md\n$(touch should-not-exist)` } };
    const check = () => {
      writeFileSync(eventPath, JSON.stringify(event));
      return run(root, ["check-pr"], { GITHUB_EVENT_PATH: eventPath });
    };
    expect(check().status).toBe(0);
    event.pull_request.draft = false;
    expect(check().output).toContain("verification passed");
    writeFileSync(path, passedRecord(accepted));
    git(root, "add", "docs"); git(root, "commit", "-qm", "verified");
    expect(check().status).toBe(0);
    expect(existsSync(join(root, "should-not-exist"))).toBe(false);
    event.pull_request.base.sha = "";
    expect(check().output).toContain("requires a base SHA");
    event.pull_request.base.sha = base;
    run(root, ["new", "second-record", "user", "low"]);
    git(root, "add", "docs"); git(root, "commit", "-qm", "second draft");
    expect(check().output).toContain("Ready PR");
    event.pull_request.draft = true;
    expect(check().output).toContain("must link changed record");
    event.pull_request.body += "\nChange: docs/sdlc/changes/2026-09-08-second-record/change.md";
    expect(check().status).toBe(0);
    writeFileSync(join(root, "uncovered.txt"), "Uncovered implementation\n");
    git(root, "add", "uncovered.txt"); git(root, "commit", "-qm", "out of scope");
    expect(check().output).toContain("not covered");
  });
});

test("incident creates one follow-up and links it, without touching runtime state", () => {
  withRepository(root => {
    expect(run(root, ["incident", "provider-recovery", "monitor"]).status).toBe(0);
    const record = join(root, "docs/sdlc/changes/2026-09-08-provider-recovery/change.md");
    expect(existsSync(record)).toBe(true);
    expect(readFileSync(record, "utf8")).toContain("risk: high");
    const incident = readFileSync(join(root, "docs/sdlc/incidents/2026-09-08-provider-recovery.md"), "utf8");
    expect(incident).toContain("../changes/2026-09-08-provider-recovery/change.md");
    expect(run(root, ["validate"]).status).toBe(0);
    expect(run(root, ["incident", "provider-recovery", "monitor"]).status).not.toBe(0);
  });
});
