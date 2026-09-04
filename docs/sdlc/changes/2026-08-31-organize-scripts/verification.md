---
id: "2026-08-31-organize-scripts"
stage: verification
schema: 3
status: passed
owner: codex
created: 2026-08-31
based_on: plan.md
commit: ""
verification_mode: owner
verified_by: "codex"
verified_at: "2026-08-31"
release_target: none
release_identity: "not applicable until released."
---

# Verification: Organize scripts and trim Gate tests

## Automated checks

Verdict: verified.

### Acceptance evidence

- AC-1: PASS — `find script -maxdepth 2` found only the root README plus `dev/run.sh`, `build/hosts.sh`, and the three `verify/` files.
- AC-2: PASS — `bash -n script/dev/run.sh script/build/hosts.sh` passed; `bun script/verify/docs.ts`, `bun script/verify/sdlc.ts`, and `bun script/verify/sdlc.ts --worktree` exercised the moved default-root and CLI paths successfully.
- AC-3: PASS — `bun test script/verify/checks.test.ts` passed all 5 focused tests with 23 assertions in 0.42 seconds on the final live run.
- AC-4: PASS — `rg 'script/(build_and_run|build_rust_hosts|check-docs|check-sdlc)'` found no obsolete path, while the diff audit found only tooling callers, documentation, workflow configuration, and the governing Artifact changed for this organization step.
- AC-5: PASS — shell syntax, the focused suite, docs Gate, plain SDLC Gate, worktree Gate, `git diff --check`, and `git diff --cached --check` passed. A temporary committed copy of all tracked and untracked changes passed the same shell, test, docs, lifecycle `--base HEAD~1`, and diff checks.

The first consolidated worktree test failed because its fixture rewrote the Change Artifact with
identical content, so the Gate correctly did not consider that Artifact part of the worktree diff.
The fixture now changes its Build evidence before testing uncovered paths; all five tests then pass.

Residual risk: the app launcher and host builder were syntax-checked but not executed because doing
so would build packages and start or replace a desktop development process, which is disproportionate
for path-only moves and conflicts with the user's minimal-test direction. Their executable bits,
arguments, bodies, and resolved two-parent repository layout were inspected. Hosted CI and human
review have not run for this unpushed worktree.

## Behavioral evidence

Verdict: verified.

### Acceptance evidence

- AC-1: PASS — `find script -maxdepth 2` found only the root README plus `dev/run.sh`, `build/hosts.sh`, and the three `verify/` files.
- AC-2: PASS — `bash -n script/dev/run.sh script/build/hosts.sh` passed; `bun script/verify/docs.ts`, `bun script/verify/sdlc.ts`, and `bun script/verify/sdlc.ts --worktree` exercised the moved default-root and CLI paths successfully.
- AC-3: PASS — `bun test script/verify/checks.test.ts` passed all 5 focused tests with 23 assertions in 0.42 seconds on the final live run.
- AC-4: PASS — `rg 'script/(build_and_run|build_rust_hosts|check-docs|check-sdlc)'` found no obsolete path, while the diff audit found only tooling callers, documentation, workflow configuration, and the governing Artifact changed for this organization step.
- AC-5: PASS — shell syntax, the focused suite, docs Gate, plain SDLC Gate, worktree Gate, `git diff --check`, and `git diff --cached --check` passed. A temporary committed copy of all tracked and untracked changes passed the same shell, test, docs, lifecycle `--base HEAD~1`, and diff checks.

The first consolidated worktree test failed because its fixture rewrote the Change Artifact with
identical content, so the Gate correctly did not consider that Artifact part of the worktree diff.
The fixture now changes its Build evidence before testing uncovered paths; all five tests then pass.

Residual risk: the app launcher and host builder were syntax-checked but not executed because doing
so would build packages and start or replace a desktop development process, which is disproportionate
for path-only moves and conflicts with the user's minimal-test direction. Their executable bits,
arguments, bodies, and resolved two-parent repository layout were inspected. Hosted CI and human
review have not run for this unpushed worktree.

## Visual evidence

See bundle evidence/ when present.

## Security and privacy evidence

Not separately recorded unless present in legacy Verification.

## Deviations and residual risk

Residual risk: the app launcher and host builder were syntax-checked but not executed because doing

## Verdict

Verdict: verified..

## Review and release

Approval: user approved pull-request creation and merge on 2026-08-31.
Pull request: [#189](https://github.com/IchenDEV/codeTwo/pull/189).
Release target: none.
Release identity: not applicable until released.
Smoke evidence: not applicable until released.
Rollback: revert this script-organization diff.
No release: this repository-tooling change does not publish a product package.

Preparing or verifying this change does not authorize merge, push, deployment, or release.

## Feedback

The test suite should protect decisions and failure boundaries, not mirror every conditional in the
validator as a separate scenario.
