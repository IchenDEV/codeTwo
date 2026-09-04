---
id: "2026-09-01-unify-task-row-style"
stage: intent
schema: 3
status: accepted
owner: codex
created: 2026-09-01
source: direct user request comparing top-level and Project-grouped Task screenshots
risk: low
approved_by: "[user]"
approved_at: "2026-09-01"
---

# Intent: Unify ordinary Task row styling

## Problem

The user compared a three-line top-level Task with a two-line Project-grouped Task and requested
the latter style everywhere. The visual difference comes from top-level Tasks retaining a workspace
identity line even when no pull request needs a provenance row.

## Proposed outcome

The user compared a three-line top-level Task with a two-line Project-grouped Task and requested

## Affected users and systems

Migrated from legacy change.md.

## Constraints

The direct screenshot request approves this low-risk presentation correction. Ponytail selects the
existing provenance placement condition; no new row variant or state is introduced. The previous
decision to retain a workspace line for ordinary ungrouped Tasks is superseded by this request.

## Out of scope

Not recorded in the legacy single-file Artifact.

## Success signals

See Spec acceptance criteria.

## Open questions

None recorded in migration.

## Decision

The direct screenshot request approves this low-risk presentation correction. Ponytail selects the
existing provenance placement condition; no new row variant or state is introduced. The previous
decision to retain a workspace line for ordinary ungrouped Tasks is superseded by this request.
