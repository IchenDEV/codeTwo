---
id: "2026-09-01-taskboard-mutation-gate"
stage: intent
schema: 3
status: accepted
owner: Codex
created: 2026-09-01
source: User request in the current Codex task to fix the failing mutation Gate linked from PR #217
risk: low
approved_by: "[chenli]"
approved_at: "2026-09-01"
---

# Intent: Restore the TaskBoard mutation Gate

## Problem

The desktop design-system workflow requires a 100% TaskBoard workspace-model mutation score, but
the current `origin/main` baseline and PR #217 both report the same seven surviving mutants. The
desired outcome is to restore the deterministic Gate with regression assertions that distinguish
every public lane label and the running-status precedence for an archived session.

This is a tests-only correction. Production TaskBoard behavior, the mutation threshold, Git
next-action behavior, and unrelated test cleanup are non-goals.

## Proposed outcome

The desktop design-system workflow requires a 100% TaskBoard workspace-model mutation score, but

## Affected users and systems

Migrated from legacy change.md.

## Constraints

Chenli approved this correction by requesting “修复” after reviewing the failing PR #217 GitHub
Actions job. Codex owns implementation and verification. Human review and merge remain separate
Gates; this request does not authorize merge, release, deployment, or production mutation.

## Out of scope

Not recorded in the legacy single-file Artifact.

## Success signals

See Spec acceptance criteria.

## Open questions

None recorded in migration.

## Decision

Chenli approved this correction by requesting “修复” after reviewing the failing PR #217 GitHub
Actions job. Codex owns implementation and verification. Human review and merge remain separate
Gates; this request does not authorize merge, release, deployment, or production mutation.
