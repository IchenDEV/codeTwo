import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SOURCE_ROOT = join(import.meta.dir, "..");
const CHANGE_ID = "2026-09-07-four-stage-smoke";

function withRepository(check: (root: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), "codetwo-devflow-"));
  try {
    mkdirSync(join(root, "script"), { recursive: true });
    cpSync(join(SOURCE_ROOT, "script/devflow.ts"), join(root, "script/devflow.ts"));
    cpSync(join(SOURCE_ROOT, "script/verify"), join(root, "script/verify"), { recursive: true });
    mkdirSync(join(root, "docs/sdlc/changes"), { recursive: true });
    cpSync(join(SOURCE_ROOT, "docs/sdlc/templates"), join(root, "docs/sdlc/templates"), { recursive: true });
    writeFileSync(join(root, "docs/sdlc/workflow.md"), "# Fixture workflow\n");
    check(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function run(root: string, args: string[], env: Record<string, string> = {}) {
  const result = spawnSync("bun", ["script/devflow.ts", ...args], {
    cwd: root, encoding: "utf8", env: { ...process.env, DEVFLOW_DATE: "2026-09-07", ...env },
  });
  return { status: result.status, output: result.stdout + result.stderr };
}

function fill(root: string, stage: string): void {
  const path = join(root, "docs/sdlc/changes", CHANGE_ID, `${stage}.md`);
  writeFileSync(path, readFileSync(path, "utf8")
    .replaceAll("[fill]", "Concrete fixture requirement.")
    .replace("owner: unassigned", "owner: fixture")
    .replace("scope: pending", "scope: README.md")
    .replace("status: draft", "status: in-review"));
}

test("devflow creates and validates sequential drafts and records explicit review approval", () => {
  withRepository(root => {
    expect(run(root, ["new", "four-stage-smoke", "user", "low"]).status).toBe(0);
    expect(existsSync(join(root, "docs/sdlc/changes", CHANGE_ID, "spec.md"))).toBe(false);
    expect(run(root, ["validate"]).status).toBe(0);
    expect(run(root, ["design", CHANGE_ID]).output).toContain("must be accepted");
    for (const [stage, next] of [["intent", "design"], ["spec", "plan"], ["plan", "verify"]]) {
      fill(root, stage);
      expect(run(root, ["validate"]).status).toBe(0);
      expect(run(root, ["approve", CHANGE_ID, stage, "reviewer"]).status).toBe(0);
      expect(run(root, [next, CHANGE_ID]).status).toBe(0);
      expect(run(root, ["validate"]).status).toBe(0);
    }
  });
});

test("Draft PRs can carry valid proposals while Ready PRs require approval and passing evidence", () => {
  withRepository(root => {
    run(root, ["new", "four-stage-smoke", "user", "low"]);
    const draft = { PR_BODY: `Change: docs/sdlc/changes/${CHANGE_ID}`, PR_IS_DRAFT: "true" };
    expect(run(root, ["check-pr"], draft).status).toBe(0);
    expect(run(root, ["check-pr"], { ...draft, PR_IS_DRAFT: "false" }).output).toContain("intent must be accepted");
    for (const [stage, next] of [["intent", "design"], ["spec", "plan"], ["plan", "verify"]]) {
      fill(root, stage);
      run(root, ["approve", CHANGE_ID, stage, "reviewer"]);
      run(root, [next, CHANGE_ID]);
    }
    const path = join(root, "docs/sdlc/changes", CHANGE_ID, "verification.md");
    const pending = readFileSync(path, "utf8");
    writeFileSync(path, pending.replace("status: pending", "status: in-progress").replace("owner: unassigned", "owner: fixture"));
    expect(run(root, ["check-pr"], draft).status).toBe(0);
    expect(run(root, ["check-pr"], { ...draft, PR_IS_DRAFT: "false" }).output).toContain("verification passed");
    writeFileSync(path, pending.replace("status: pending", "status: failed").replace("owner: unassigned", "owner: fixture"));
    expect(run(root, ["check-pr"], draft).status).not.toBe(0);
    writeFileSync(path, pending.replace("status: pending", "status: passed")
      .replace("owner: unassigned", "owner: fixture")
      .replace('verified_by: ""', 'verified_by: "fixture"').replace('verified_at: ""', 'verified_at: "2026-09-07"')
      .replace("[fill]", "- AC-1: PASS — `fixture-check` passed.")
      .replaceAll("[fill]", "Fixture evidence recorded above.")
      .replace("Residual risk: pending.", "Residual risk: disposable fixture only.")
      .replace("Verdict: pending.", "Verdict: verified."));
    expect(run(root, ["check-pr"], { ...draft, PR_IS_DRAFT: "false" }).status).toBe(0);
  });
});
