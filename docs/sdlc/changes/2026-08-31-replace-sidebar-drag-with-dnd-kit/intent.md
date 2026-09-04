---
id: "2026-08-31-replace-sidebar-drag-with-dnd-kit"
stage: intent
schema: 3
status: accepted
owner: codex
created: 2026-08-31
source: direct user request with screenshot showing failed Project sorting and folder placement
risk: medium
approved_by: "[user]"
approved_at: "2026-08-31"
---

# Intent: Replace sidebar drag handling with dnd-kit

## Problem

The user reported that physical pointer dragging cannot reorder sidebar items or place a Project in
a user Section, and explicitly requested a mature library instead of another custom implementation.
The reproduced pointer path emitted `pointerdown` but never emitted the native HTML5 `dragstart`,
so the existing `dataTransfer` handlers did not reach the domain move operations. This change
replaces only the sidebar interaction layer; existing Section, Project, Task ordering and
persistence APIs remain authoritative. The follow-up `pr` authorizes PR creation for this verified
scope only; a broader sidebar redesign, merge, release, or deployment remains unauthorized.

## Proposed outcome

The user reported that physical pointer dragging cannot reorder sidebar items or place a Project in

## Affected users and systems

Migrated from legacy change.md.

## Constraints

The direct user request accepts this medium-risk Intent and the dependency choice. Human review
remains required before merge. No release or production action is authorized.

## Out of scope

Not recorded in the legacy single-file Artifact.

## Success signals

See Spec acceptance criteria.

## Open questions

None recorded in migration.

## Decision

The direct user request accepts this medium-risk Intent and the dependency choice. Human review
remains required before merge. No release or production action is authorized.
