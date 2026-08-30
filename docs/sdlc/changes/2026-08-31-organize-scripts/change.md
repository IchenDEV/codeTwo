---
id: change-2026-08-31-organize-scripts
kind: change
schema: 2
status: verified
risk: medium
owner: codex
approvers: user via the current 2026-08-31 script-organization and minimal-test request
approved_at: 2026-08-31
created: 2026-08-31
updated: 2026-08-31
source: current user request to organize scripts like docs and keep only the simplest efficient tests
inputs: the six current scripts, their repository callers, and the existing docs and SDLC Gates
outputs: purpose-based script directories, one test entry, and repaired canonical command paths
scope: script, .github, .codex, .agent-learning, AGENTS.md, README.md, docs, website
next_trigger: merge the approved pull request after required checks pass
verification_mode: owner
verified_by: codex
verified_at: 2026-08-31
---

# Organize scripts and trim Gate tests

## Intent

The `script/` root mixes development launchers, build helpers, validators, and two test files in one
flat list. The validators' twenty individual fixtures repeat setup and make a small script surface
look larger than it is. The user wants the same physical clarity as the docs cleanup and explicitly
prefers a minimal, efficient test set.

## Spec

- Keep only a short index at the `script/` root.
- Put the app launcher under `dev/`, the host builder under `build/`, and deterministic repository
  checks under `verify/`.
- Preserve launcher, builder, docs-checker, and SDLC-checker behavior and command arguments.
- Replace the two separate test files with one focused suite that covers the valid path and the
  essential fail-closed classes without retaining one test per validation rule.
- Update every repository-owned command, workflow, environment, document, and historical evidence
  reference to the canonical new path.
- Add no dependency, compatibility wrapper, framework, or generated test matrix.

### Acceptance criteria

- [x] AC-1: `script/` contains only its index and the `dev/`, `build/`, and `verify/` categories.
- [x] AC-2: Every executable/checker retains its public arguments and all repository callers use the new path.
- [x] AC-3: One compact test entry covers docs acceptance/rejection, SDLC acceptance/closure, branch scope, worktree scope, and release/incident/Eval fail-closed behavior.
- [x] AC-4: No obsolete script path remains and no runtime product source changes beyond path-bearing comments or documentation.
- [x] AC-5: The focused suite, live docs Gate, live SDLC Gate, worktree Gate, shell syntax, diff checks, and isolated committed-diff check pass.

## Decision and gates

The user's direct request approves this repository-local implementation. Risk is medium because CI
and local developer command paths move, even though runtime behavior does not. Commit, push, PR,
merge, release, deployment, and external mutation remain unauthorized.

## Plan

1. Move the four operational scripts into three purpose-based directories.
2. Consolidate repeated test fixtures into one readable high-value suite and delete the old tests.
3. Add a short script index and repair every caller and evidence path.
4. Run only the checks that protect moved commands, validators, shell parsing, and repository Gates.

Rollback is a repository revert restoring the flat paths and separate test files. No runtime data
or external cleanup is required.

## Build

[`script/README.md`](../../../../script/README.md) now exposes three direct categories. The macOS app
launcher moved to `dev/run.sh`, the host builder to `build/hosts.sh`, and the two Bun validators to
`verify/docs.ts` and `verify/sdlc.ts`. Moving the executable files preserved their modes and public
arguments; their repository-root calculation changed only from one parent to two parents.

The two prior Gate test files were replaced by one
[`verify/checks.test.ts`](../../../../script/verify/checks.test.ts). It reduces twenty individual
tests to five behavior-boundary tests and reduces test code from 528 to 330 lines. Shared fixture
creation is local to that file; no test library, compatibility wrapper, dependency, generated
matrix, or extra abstraction was added. The retained cases cover documentation drift, lifecycle
closure and authority, release/Incident/Eval evidence, committed branch schema/scope, and staged
plus untracked worktree scope.

Repository instructions, CI/release workflows, the local Codex run action, learning-loop commands,
README, website guidance, current contracts, and historical evidence now use the canonical paths.
CI invokes the consolidated suite once instead of twice. The validators' implementation and both
shell scripts are otherwise unchanged; no product runtime source or external state changed.

## Verification

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

## Review and release

Approval: user approved pull-request creation and merge on 2026-08-31.
Release target: none.
Release identity: not applicable until released.
Smoke evidence: not applicable until released.
Rollback: revert this script-organization diff.
No release: this repository-tooling change does not publish a product package.

Preparing or verifying this change does not authorize merge, push, deployment, or release.

## Feedback

The test suite should protect decisions and failure boundaries, not mirror every conditional in the
validator as a separate scenario.
