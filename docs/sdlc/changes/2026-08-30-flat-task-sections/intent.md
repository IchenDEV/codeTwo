---
id: "2026-08-30-flat-task-sections"
stage: intent
schema: 3
status: accepted
owner: codex
created: 2026-08-30
source: user-supplied sidebar references and PR #183
risk: medium
approved_by: "userthe 2026-08-30 sidebar requests and explicit PR merge authorization"
approved_at: "2026-08-30"
---

# Intent: Flatten recent Tasks and add sidebar Sections

## Problem

The user supplied three macOS sidebar references on 2026-08-30 and asked that recent Tasks stop
being grouped or filtered by Project/folder. Tasks should appear in one cross-project feed, with
optional Sections as the only organizational layer. Users need to create and manage their own
Sections, while the system may maintain explainable automatic Sections. Disclosure controls should
sit immediately after each Section title as in the supplied references.

In a follow-up reference on the same date, the user explicitly removed the entire redundant
`Recent chats`/Project-switcher row. The Task area now begins directly with Highlight, manual
Sections, or flat Tasks; Section creation remains available from a Task's context menu.

The affected surface is the desktop SessionRail and its local organization state. This change does
not alter Task ownership, Project selection for new work, working directories, provider Sessions,
archive semantics, or any external system. The direct user request is accepted Intent and design
approval; it does not authorize a PR, merge, release, or production mutation.

## Proposed outcome

The user supplied three macOS sidebar references on 2026-08-30 and asked that recent Tasks stop

## Affected users and systems

Migrated from legacy change.md.

## Constraints

The user's request accepts the Intent and visible design. The implementation uses deterministic
automatic grouping so the system cannot silently reclassify work by model inference. Local UI
persistence matches existing rail width/fold preferences and avoids changing Core Task data. Human
review remains the next gate after verification.

## Out of scope

Not recorded in the legacy single-file Artifact.

## Success signals

See Spec acceptance criteria.

## Open questions

None recorded in migration.

## Decision

The user's request accepts the Intent and visible design. The implementation uses deterministic
automatic grouping so the system cannot silently reclassify work by model inference. Local UI
persistence matches existing rail width/fold preferences and avoids changing Core Task data. Human
review remains the next gate after verification.
