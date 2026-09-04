---
id: "2026-09-01-floating-pr-inspector"
stage: intent
schema: 3
status: accepted
owner: codex
created: 2026-09-01
source: direct implementation request after reviewing change-2026-09-01-floating-pr-inspector-prototype
risk: low
approved_by: "userthe 2026-09-01 request to start implementing the approved floating Inspector"
approved_at: "2026-09-01"
---

# Intent: Promote the floating PR Inspector

## Problem

The UI Lab comparison established that a reserved floating card gives the PR Inspector clearer
hierarchy without obscuring review content. The user selected that direction and asked to begin
implementation. The production PR Workspace should now use the chosen floating treatment, while
the permanent UI Lab should return to rendering a single truthful production state instead of
retaining obsolete prototype controls.

This change is visual only. It must preserve Inspector content, semantics, width bounds, scrolling,
the 960px collapse rule, list/detail compact behavior, GitHub operations, and persisted state. It
must not keep A/C variants, add a presentation setting, change the conversation-side PR Dock, or
introduce another component abstraction.

## Proposed outcome

The UI Lab comparison established that a reserved floating card gives the PR Inspector clearer

## Affected users and systems

Migrated from legacy change.md.

## Constraints

The user's direct request after reviewing the prototype accepts Intent, Spec, and the visual design
Gate for production implementation. Codex owns implementation and owner verification. The user's
later `pr` request authorizes creating a branch, pushing this verified scope, and opening a Draft
PR. Merge, release, deployment, and production-environment mutation remain unauthorized.

## Out of scope

Not recorded in the legacy single-file Artifact.

## Success signals

See Spec acceptance criteria.

## Open questions

None recorded in migration.

## Decision

The user's direct request after reviewing the prototype accepts Intent, Spec, and the visual design
Gate for production implementation. Codex owns implementation and owner verification. The user's
later `pr` request authorizes creating a branch, pushing this verified scope, and opening a Draft
PR. Merge, release, deployment, and production-environment mutation remain unauthorized.
