---
id: "2026-09-01-taskboard-mutation-gate"
stage: plan
schema: 3
status: accepted
owner: Codex
created: 2026-09-01
based_on: spec.md
risk: low
scope: apps/desktop/tests/taskBoardWorkspaceModel.test.ts, docs/sdlc/changes/2026-09-01-taskboard-mutation-gate
approved_by: "[chenli]"
approved_at: "2026-09-01"
---

# Plan: Restore the TaskBoard mutation Gate

## Files and ownership

apps/desktop/tests/taskBoardWorkspaceModel.test.ts, docs/sdlc/changes/2026-09-01-taskboard-mutation-gate

## Order of work

1. Reuse `taskBoardWorkspaceModel.test.ts` and add only the missing public-output assertions for
   AC-1 and AC-2.
2. Run the line-scoped mutation reproduction, targeted test, complete mutation Gate, desktop test
   suite, renderer build, and repository lifecycle checks for AC-3.
3. Record actual evidence and return the Artifact to human review. Roll back by reverting the
   tests and this Artifact; no production code or data changes are involved.

## Test-first proof

See legacy Verification section.

## Visual or integration proof

See legacy Verification section.

## Risks and mitigations

See legacy Decision and gates.

## Rollback

See legacy Review and release.

## Deviations

Implemented on `codex/git-next-action` as two regression additions to the existing workspace-model
test: explicit translated output for every lane and running-tone precedence for an archived
session. No production code, mutation configuration, threshold, dependency, or runtime behavior
changed.

## Decision

Chenli approved this correction by requesting “修复” after reviewing the failing PR #217 GitHub
Actions job. Codex owns implementation and verification. Human review and merge remain separate
Gates; this request does not authorize merge, release, deployment, or production mutation.
