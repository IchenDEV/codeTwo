import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { REQUIRED_FILES, validateRepository } from "./sdlc";

const ID = "2026-09-08-four-stage-contract";
const DIR = `docs/sdlc/changes/${ID}`;
const STAGES = ["intent", "spec", "plan", "verification"] as const;
type Stage = typeof STAGES[number];

function write(root: string, path: string, text: string) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
}

function edit(root: string, stage: Stage, from: string, to: string) {
  const path = `${DIR}/${stage}.md`;
  const before = readFileSync(join(root, path), "utf8");
  expect(before).toContain(from);
  write(root, path, before.replace(from, to));
}

function git(root: string, ...args: string[]) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout.trim();
}

function fixture(run: (root: string) => void, draft = false) {
  const root = mkdtempSync(join(tmpdir(), "codetwo-four-stage-"));
  try {
    for (const path of REQUIRED_FILES) write(root, path, "# Contract\n");
    const bodies: Record<Stage, string> = {
      intent: "## Intent\n\nAllow independent files to share one implementation authorization.\n",
      spec: "## Design\n\nPreserve authorization, scope and evidence gates.\n\n## Acceptance criteria\n\n- [x] AC-1: Ordinary changes reuse authorization.\n- [x] AC-2: Unsafe handoff is rejected.\n",
      plan: "## Plan\n\nUpdate the contract, run its regressions and inspect the result. Revert this diff to roll back.\n",
      verification: "## Verification\n\n- AC-1: PASS — `bun test script/verify/four-stage.test.ts` passed in a disposable repository.\n- AC-2: PASS — `bun test script/verify/checks.test.ts` passed in a disposable repository.\n\nVerdict: verified.\nResidual risk: deterministic checks do not authenticate human identity.\n\n## Review and release\n\nNo release: repository lifecycle only.\nApproval: pending.\nRollback: revert this diff.\n",
    };
    const fields: Record<Stage, string> = {
      intent: `source: user\nrisk: medium\napproved_by: ${draft ? '""' : "chenli"}\napproved_at: ${draft ? '""' : "2026-09-08"}\napproval_source: ${draft ? '""' : '"User requested the three lifecycle rules in this session."'}\n`,
      spec: "based_on: intent.md\ndesign_approved_by: \"\"\ndesign_approved_at: \"\"\ndesign_approval_source: \"\"\n",
      plan: "based_on: spec.md\nscope: README.md, script/verify/\n",
      verification: "based_on: plan.md\nrevision: worktree based on fixture-v1\nverification_mode: owner\nverified_by: implementer\nverified_at: 2026-09-08\nrelease_target: none\ncleanup_status: complete\n",
    };
    bodies.verification += "\n## Cleanup\n\nRemoved: none; fixture records only.\nRetained: none.\nProcesses: none started.\nEvidence: `fixture` uses a disposable directory removed in finally.\n";
    for (const stage of STAGES) {
      const status = draft ? (stage === "verification" ? "pending" : "draft") : stage === "verification" ? "passed" : "accepted";
      write(root, `${DIR}/${stage}.md`, `---\nid: ${ID}\nschema: 5\nstage: ${stage}\nstatus: ${status}\nowner: implementer\ncreated: 2026-09-08\nnext_trigger: Human review of verified changes.\n${fields[stage]}---\n\n# ${stage}\n\n${bodies[stage]}`);
    }
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function highRisk(root: string) {
  edit(root, "intent", "risk: medium", "risk: high");
  edit(root, "spec", 'design_approved_by: ""', "design_approved_by: chenli");
  edit(root, "spec", 'design_approved_at: ""', "design_approved_at: 2026-09-08");
  edit(root, "spec", 'design_approval_source: ""', 'design_approval_source: "User selected this bounded design."');
  edit(root, "verification", "verification_mode: owner", "verification_mode: fresh-context");
  edit(root, "verification", "verified_by: implementer", "verified_by: independent-reviewer");
}

test("schema 5 permits the entire draft chain before implementation authorization", () => {
  fixture(root => expect(validateRepository(root)).toEqual([]), true);
});

test("ordinary accepted stages reuse intent authorization without spec or plan approvals", () => {
  fixture(root => {
    expect(validateRepository(root)).toEqual([]);
    edit(root, "intent", "approved_by: chenli", 'approved_by: ""');
    expect(validateRepository(root).length).toBeGreaterThan(0);
  });
});

test("high risk needs a separate design decision and independent verification", () => {
  fixture(root => {
    edit(root, "intent", "risk: medium", "risk: high");
    expect(validateRepository(root).length).toBeGreaterThan(0);
    edit(root, "intent", "risk: high", "risk: medium");
    highRisk(root);
    expect(validateRepository(root)).toEqual([]);
    edit(root, "spec", "design_approved_by: chenli", "design_approved_by: implementer");
    expect(validateRepository(root).length).toBeGreaterThan(0);
    edit(root, "spec", "design_approved_by: implementer", "design_approved_by: chenli");
    edit(root, "verification", "verified_by: independent-reviewer", "verified_by: implementer");
    expect(validateRepository(root).length).toBeGreaterThan(0);
  });
});

test("authority fields have one owner and independent checks include the plan implementer", () => {
  for (const [stage, field] of [
    ["spec", "risk: low"],
    ["plan", "approved_by: chenli"],
    ["intent", "scope: README.md"],
    ["spec", "revision: fixture-v1"],
    ["verification", "design_approved_by: chenli"],
  ] as const) {
    fixture(root => {
      edit(root, stage, `stage: ${stage}`, `stage: ${stage}\n${field}`);
      expect(validateRepository(root).length).toBeGreaterThan(0);
    });
  }
  fixture(root => {
    highRisk(root);
    edit(root, "plan", "owner: implementer", "owner: second-implementer");
    expect(validateRepository(root)).toEqual([]);
    edit(root, "spec", "design_approved_by: chenli", "design_approved_by: second-implementer");
    expect(validateRepository(root).length).toBeGreaterThan(0);
    edit(root, "spec", "design_approved_by: second-implementer", "design_approved_by: chenli");
    edit(root, "verification", "verified_by: independent-reviewer", "verified_by: second-implementer");
    expect(validateRepository(root).length).toBeGreaterThan(0);
  });
});

test("acceptance and active verification require accepted predecessors", () => {
  for (const stage of ["intent", "spec", "plan"] as const) {
    fixture(root => {
      edit(root, stage, "status: accepted", "status: draft");
      expect(validateRepository(root).length).toBeGreaterThan(0);
    });
  }
  fixture(root => {
    edit(root, "verification", "status: pending", "status: in-progress");
    expect(validateRepository(root).length).toBeGreaterThan(0);
  }, true);
});

test("every stage is required and based_on follows the actual predecessor", () => {
  for (const stage of STAGES.slice(1)) {
    fixture(root => {
      rmSync(join(root, DIR, `${stage}.md`));
      expect(validateRepository(root).length).toBeGreaterThan(0);
    });
  }
  fixture(root => {
    edit(root, "verification", "based_on: plan.md", "based_on: intent.md");
    expect(validateRepository(root).length).toBeGreaterThan(0);
  });
});

test("orphan stages beside a valid bundle cannot hide a missing intent", () => {
  fixture(root => {
    const orphanId = "2026-09-08-orphan-contract";
    const spec = readFileSync(join(root, DIR, "spec.md"), "utf8").replace(ID, orphanId);
    write(root, `docs/sdlc/changes/${orphanId}/spec.md`, spec);
    expect(validateRepository(root).some(error => error.includes(orphanId) && error.includes("missing intent.md"))).toBe(true);
  });
});

test("accepted stage bodies cannot leave unfinished placeholders", () => {
  for (const stage of STAGES) {
    fixture(root => {
      edit(root, stage, `# ${stage}`, `# ${stage}\n\nTODO`);
      expect(validateRepository(root).length).toBeGreaterThan(0);
    });
  }
});

test("passed verification needs checked criteria and a concrete revision", () => {
  fixture(root => {
    edit(root, "spec", "[x] AC-2", "[ ] AC-2");
    expect(validateRepository(root).length).toBeGreaterThan(0);
    edit(root, "spec", "[ ] AC-2", "[x] AC-2");
    edit(root, "verification", "revision: worktree based on fixture-v1", 'revision: ""');
    expect(validateRepository(root).length).toBeGreaterThan(0);
  });
});

test("AC evidence rejects missing, duplicate, failed, unknown and unsupported mappings", () => {
  const mapping = "- AC-2: PASS — `bun test script/verify/checks.test.ts` passed in a disposable repository.";
  for (const replacement of ["", `${mapping}\n${mapping}`, mapping.replace("PASS", "FAIL"), mapping.replace("AC-2", "AC-3"), "- AC-2: PASS — Checked successfully."]) {
    fixture(root => {
      edit(root, "verification", mapping, replacement);
      expect(validateRepository(root).length).toBeGreaterThan(0);
    });
  }
  fixture(root => {
    edit(root, "spec", "- [x] AC-2: Unsafe handoff is rejected.", "- [x] AC-1: Duplicate criterion.");
    expect(validateRepository(root).length).toBeGreaterThan(0);
  });
});

test("failed verification retains each AC mapping and at least one real failure", () => {
  fixture(root => {
    edit(root, "verification", "status: passed", "status: failed");
    edit(root, "verification", "Verdict: verified", "Verdict: failed");
    expect(validateRepository(root).length).toBeGreaterThan(0);
    edit(root, "verification", "AC-2: PASS", "AC-2: FAIL");
    expect(validateRepository(root)).toEqual([]);
  });
});

test("schema 5 rejects mixed schema stage files and competing change.md", () => {
  fixture(root => {
    edit(root, "plan", "schema: 5", "schema: 3");
    expect(validateRepository(root).length).toBeGreaterThan(0);
  });
  fixture(root => {
    write(root, `${DIR}/change.md`, "---\nschema: 4\n---\n");
    expect(validateRepository(root).length).toBeGreaterThan(0);
  });
});

test("four-stage release retains separate target, authorization and rollback gates", () => {
  fixture(root => {
    expect(validateRepository(root, undefined, ID).length).toBeGreaterThan(0);
    edit(root, "verification", "release_target: none", "release_target: versioned macOS release");
    expect(validateRepository(root, undefined, ID).length).toBeGreaterThan(0);
    edit(root, "verification", "Approval: pending.", "Approval: chenli authorized this fixture release on 2026-09-08.");
    expect(validateRepository(root, undefined, ID)).toEqual([]);
    edit(root, "verification", "Rollback: revert this diff.", "Rollback: pending.");
    expect(validateRepository(root, undefined, ID).length).toBeGreaterThan(0);
  });
});

test("changed plan scope covers actual diff and Ready still requires passed verification", () => {
  fixture(root => {
    git(root, "init", "-q");
    git(root, "config", "user.name", "SDLC Fixture");
    git(root, "config", "user.email", "sdlc@example.invalid");
    git(root, "add", ".");
    git(root, "commit", "-qm", "baseline");
    write(root, "README.md", "changed behavior\n");
    expect(validateRepository(root, undefined, undefined, true).length).toBeGreaterThan(0);
    edit(root, "plan", "Update the contract", "Update the four-stage contract");
    expect(validateRepository(root, undefined, undefined, true, true)).toEqual([]);
    write(root, "uncovered.txt", "outside authorization\n");
    expect(validateRepository(root, undefined, undefined, true).length).toBeGreaterThan(0);
    rmSync(join(root, "uncovered.txt"));
    edit(root, "verification", "status: passed", "status: in-progress");
    expect(validateRepository(root, undefined, undefined, true)).toEqual([]);
    expect(validateRepository(root, undefined, undefined, true, true).length).toBeGreaterThan(0);
  });
});


test("cleanup gate rejects unfinished cleanup, missing evidence and unowned retention", () => {
  fixture(root => {
    expect(validateRepository(root)).toEqual([]);
    edit(root, "verification", "Retained: none.", "Retained: none; fixture output is removed.");
    expect(validateRepository(root)).toEqual([]);
    edit(root, "verification", "cleanup_status: complete", "cleanup_status: pending");
    expect(validateRepository(root).some(e => e.includes("cleanup_status complete"))).toBe(true);
    edit(root, "verification", "cleanup_status: pending", "cleanup_status: complete");
    edit(root, "verification", "Evidence: `fixture` uses a disposable directory removed in finally.", "Evidence: pending.");
    expect(validateRepository(root).some(e => e.includes("cleanup Evidence"))).toBe(true);
  });
  fixture(root => {
    edit(root, "verification", "Retained: none.", "Retained: task-scoped failure trace.");
    expect(validateRepository(root).some(e => e.includes("Retention owner"))).toBe(true);
    edit(root, "verification", "Retained: task-scoped failure trace.", "Retained: task-scoped failure trace.\nRetention owner: implementer\nCleanup trigger: remove after the linked failure is resolved");
    expect(validateRepository(root)).toEqual([]);
  });
});

test("failed or blocked work must settle cleanup, while a genuine cleanup blocker stays reportable", () => {
  fixture(root => {
    edit(root, "verification", "status: passed", "status: blocked");
    edit(root, "verification", "cleanup_status: complete", "cleanup_status: pending");
    expect(validateRepository(root).some(e => e.includes("failed/blocked handoff"))).toBe(true);
    edit(root, "verification", "cleanup_status: pending", "cleanup_status: blocked");
    edit(root, "verification", "Retained: none.", "Retained: locked task output.\nRetention owner: implementer\nCleanup trigger: owning process exits\nBlocker: active build still holds its OS lock");
    expect(validateRepository(root)).toEqual([]);
  });
});

test("legacy records remain readable but changed records cannot omit cleanup", () => {
  fixture(root => {
    edit(root, "verification", "cleanup_status: complete\n", "");
    expect(validateRepository(root)).toEqual([]);
    git(root, "init", "-q");
    git(root, "config", "user.name", "Fixture");
    git(root, "config", "user.email", "fixture@example.invalid");
    git(root, "add", "."); git(root, "commit", "-qm", "legacy baseline");
    expect(validateRepository(root, undefined, undefined, true)).toEqual([]);
    edit(root, "plan", "Update the contract", "Update the cleanup contract");
    expect(validateRepository(root, undefined, undefined, true).some(e => e.includes("requires cleanup_status"))).toBe(true);
  });
  fixture(root => {
    edit(root, "verification", "cleanup_status: complete\n", "");
    expect(validateRepository(root, undefined, ID).some(e => e.includes("requires cleanup_status"))).toBe(true);
  });
});
