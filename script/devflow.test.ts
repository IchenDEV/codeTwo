import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..");
const CHANGE_ID = "2026-09-02-four-stage-smoke";

function runDevflow(args: string[], env: Record<string, string> = {}): { status: number; stdout: string; stderr: string } {
  const result = spawnSync("bun", ["script/devflow.ts", ...args], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  };
}

test("devflow new creates only intent.md", () => {
  const bundle = join(REPO_ROOT, "docs/sdlc/changes", CHANGE_ID);
  try {
    const created = runDevflow(["new", "four-stage-smoke", "user", "low"], { DEVFLOW_DATE: "2026-09-02" });
    expect(created.status).toBe(0);
    expect(created.stdout).toContain(`${CHANGE_ID}/intent.md`);
    expect(existsSync(join(bundle, "intent.md"))).toBe(true);
    expect(existsSync(join(bundle, "spec.md"))).toBe(false);
    const body = readFileSync(join(bundle, "intent.md"), "utf8");
    expect(body).toContain("schema: 3");
    expect(body).toContain("stage: intent");
  } finally {
    rmSync(bundle, { recursive: true, force: true });
  }
});

test("devflow enforces intent before spec creation", () => {
  const bundle = join(REPO_ROOT, "docs/sdlc/changes", CHANGE_ID);
  try {
    runDevflow(["new", "four-stage-smoke", "user", "low"], { DEVFLOW_DATE: "2026-09-02" });
    const rejected = runDevflow(["design", CHANGE_ID], { DEVFLOW_DATE: "2026-09-02" });
    expect(rejected.status).not.toBe(0);
    expect(rejected.stderr).toContain("must be accepted");
    runDevflow(["approve", CHANGE_ID, "intent", "reviewer"], { DEVFLOW_DATE: "2026-09-02" });
    const created = runDevflow(["design", CHANGE_ID], { DEVFLOW_DATE: "2026-09-02" });
    expect(created.status).toBe(0);
  } finally {
    rmSync(bundle, { recursive: true, force: true });
  }
});

test("devflow check-pr requires accepted intent spec plan", () => {
  const body = `Change: docs/sdlc/changes/2026-09-02-sdlc-devflow-and-skill-integration`;
  const result = runDevflow(["check-pr"], { PR_BODY: body, PR_IS_DRAFT: "true" });
  expect(result.status).toBe(0);
});
