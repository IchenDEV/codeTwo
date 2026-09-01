---
id: change-2026-09-01-taskboard-mutation-gate
kind: change
schema: 2
status: verified
risk: low
owner: Codex
approvers: [chenli]
approved_at: 2026-09-01
created: 2026-09-01
updated: 2026-09-01
source: User request in the current Codex task to fix the failing mutation Gate linked from PR #217
inputs: GitHub Actions job 99833531176 and the matching origin/main mutation failure
outputs: Regression assertions that kill every surviving TaskBoard workspace-model mutant
scope: apps/desktop/tests/taskBoardWorkspaceModel.test.ts, docs/sdlc/changes/2026-09-01-taskboard-mutation-gate
next_trigger: Human review of PR #217 and the refreshed GitHub Actions checks
verification_mode: owner
verified_by: Codex
verified_at: 2026-09-01
---

# Restore the TaskBoard mutation Gate

## Intent

The desktop design-system workflow requires a 100% TaskBoard workspace-model mutation score, but
the current `origin/main` baseline and PR #217 both report the same seven surviving mutants. The
desired outcome is to restore the deterministic Gate with regression assertions that distinguish
every public lane label and the running-status precedence for an archived session.

This is a tests-only correction. Production TaskBoard behavior, the mutation threshold, Git
next-action behavior, and unrelated test cleanup are non-goals.

## Spec

The existing workspace-model test suite must assert the translated label for all four projected
lanes. It must also prove that an actively running session uses the success tone even if its
persisted archived flag is set, so removing the explicit running branch changes an observed result.
The existing 100% mutation threshold remains unchanged.

### Acceptance criteria

- [x] AC-1: Workspace-model tests distinguish the queue, running, needs-you, and done lane labels.
- [x] AC-2: Workspace-model tests distinguish the running tone from the archived-session fallback.
- [x] AC-3: The narrowed reproduction and complete TaskBoard mutation Gate report zero surviving mutants, and the desktop regression suite remains green.

## Decision and gates

Chenli approved this correction by requesting “修复” after reviewing the failing PR #217 GitHub
Actions job. Codex owns implementation and verification. Human review and merge remain separate
Gates; this request does not authorize merge, release, deployment, or production mutation.

## Plan

1. Reuse `taskBoardWorkspaceModel.test.ts` and add only the missing public-output assertions for
   AC-1 and AC-2.
2. Run the line-scoped mutation reproduction, targeted test, complete mutation Gate, desktop test
   suite, renderer build, and repository lifecycle checks for AC-3.
3. Record actual evidence and return the Artifact to human review. Roll back by reverting the
   tests and this Artifact; no production code or data changes are involved.

## Build

Implemented on `codex/git-next-action` as two regression additions to the existing workspace-model
test: explicit translated output for every lane and running-tone precedence for an archived
session. No production code, mutation configuration, threshold, dependency, or runtime behavior
changed.

## Verification

Verdict: verified.

### Acceptance evidence

- AC-1: PASS — `bun test tests/taskBoardWorkspaceModel.test.ts` completed with 11 tests and 57 expectations; the line-scoped Stryker reproduction completed at 100% with zero surviving mutants.
- AC-2: PASS — `bun test tests/taskBoardWorkspaceModel.test.ts` and `bunx stryker run stryker.taskboard.config.json --mutate 'src/taskboard/workspaceModel.ts:78:1-85:100' --reporters clear-text --concurrency 2` killed the conditional mutant that removed running-tone precedence for an archived session.
- AC-3: PASS — `bun run mutation:taskboard` completed at 100% with 89 killed and zero surviving executable mutants; `bun test` completed with 851 tests, 5,040 expectations, and zero failures; `bun run build:renderer` passed lint, typecheck, and the 6,600-module production build. `bun test script/verify/checks.test.ts`, `bun script/verify/docs.ts`, `bun script/verify/sdlc.ts`, `bun script/verify/sdlc.ts --worktree`, and `git diff --check` passed.

Residual risk: GitHub Actions has not yet run against this local revision. Stryker reports 104
type-checker errors for invalid generated mutants, excludes them from the executable denominator,
and reports the remaining 89 mutants killed at the unchanged 100% threshold. Existing Base UI
`act(...)` warnings remain outside this tests-only correction.

## Review and release

Approval: pending.
Release target: none.
Release identity: not applicable until released.
Smoke evidence: not applicable; this change only strengthens deterministic tests.
Rollback: revert the regression assertions and this change Artifact.
No release: pending human review of PR #217; no release action is authorized.

Preparing this section does not authorize merge, deployment, release, or production mutation.

## Feedback

The triggering feedback is the failing GitHub Actions job linked by Chenli in the current task.
