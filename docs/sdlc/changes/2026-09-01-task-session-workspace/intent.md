---
id: "2026-09-01-task-session-workspace"
stage: intent
schema: 3
status: accepted
owner: codex
created: 2026-09-01
source: direct user requests following the approved Task, Session, worktree, and pull-request prototype, including the 2026-09-01 lint simplification follow-up
risk: medium
approved_by: "userthe 2026-09-01 approval of UI prototype option A and direct implementation request"
approved_at: "2026-09-01"
---

# Intent: Make TaskBoard a Task-to-Session workspace

## Problem

The user approved prototype option A after reviewing how a Task, AI Session, worktree, and pull
request should relate. The current TaskBoard renders four card columns and stores a Task-level pull
request link, which hides Session history and makes later worktrees or pull requests appear to
replace earlier execution. The production surface should instead keep the interaction simple: a
Task is the durable unit of intent, its Sessions are the execution history, and each Session can
show at most the pull request belonging to its own checkout.

The direct request accepts the Intent and visible design direction. It does not authorize a pull
request, merge, release, deployment, or production mutation.

## Proposed outcome

The user approved prototype option A after reviewing how a Task, AI Session, worktree, and pull

## Affected users and systems

Migrated from legacy change.md.

## Constraints

The user approved the option-A prototype and directly requested implementation. Ponytail review
selected reuse: ordered `sessionIds` already express Task history, SessionInfo already owns
worktree provenance, and the existing bounded GitHub lookup already resolves a checkout's current
pull request. No persisted Item, delivery, PR-history, or compatibility abstraction is added.

This is a medium-risk desktop UI change because it replaces the primary TaskBoard information
architecture while preserving existing local Task persistence. Human review remains required
before merge. Release and production Gates are not opened by this request.

## Out of scope

Not recorded in the legacy single-file Artifact.

## Success signals

See Spec acceptance criteria.

## Open questions

None recorded in migration.

## Decision

The user approved the option-A prototype and directly requested implementation. Ponytail review
selected reuse: ordered `sessionIds` already express Task history, SessionInfo already owns
worktree provenance, and the existing bounded GitHub lookup already resolves a checkout's current
pull request. No persisted Item, delivery, PR-history, or compatibility abstraction is added.

This is a medium-risk desktop UI change because it replaces the primary TaskBoard information
architecture while preserving existing local Task persistence. Human review remains required
before merge. Release and production Gates are not opened by this request.
