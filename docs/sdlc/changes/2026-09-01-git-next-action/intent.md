---
id: "2026-09-01-git-next-action"
stage: intent
schema: 3
status: accepted
owner: Codex
created: 2026-09-01
source: User request in the current Codex task to implement the Superdot interaction recommendations in order, beginning with the state-aware Git primary action
risk: medium
approved_by: "[chenli]"
approved_at: "2026-09-01"
---

# Intent: State-aware Git primary action

## Problem

CodeTwo currently exposes Commit, Push, source control, pull-request checks, review, merge, and
worktree cleanup as separate controls. A user must interpret local Git state and forge state before
choosing the next step. The desired outcome is one honest primary action for the active worktree,
with only currently valid alternatives, while preserving the existing review and confirmation
surfaces.

This change affects the desktop Git projection, session header, and Git dock. It must preserve
workspace ownership during asynchronous refreshes, must not add a second Git state store, and must
not make a new destructive or forge mutation bypassing the existing handlers. Sidebar hover cards,
new review-thread state, GitLab merge-request inspection, and worktree lifecycle redesign are
non-goals for this slice.

## Proposed outcome

CodeTwo currently exposes Commit, Push, source control, pull-request checks, review, merge, and

## Affected users and systems

Migrated from legacy change.md.

## Constraints

Chenli approved implementation by asking CodeTwo to optimize the researched interactions in order.
Codex owns implementation and verification. Human review remains required before merge. No release,
deployment, or production mutation is authorized.

## Out of scope

Not recorded in the legacy single-file Artifact.

## Success signals

See Spec acceptance criteria.

## Open questions

None recorded in migration.

## Decision

Chenli approved implementation by asking CodeTwo to optimize the researched interactions in order.
Codex owns implementation and verification. Human review remains required before merge. No release,
deployment, or production mutation is authorized.
