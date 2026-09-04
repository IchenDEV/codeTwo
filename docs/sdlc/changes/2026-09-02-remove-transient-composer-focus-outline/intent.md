---
id: "2026-09-02-remove-transient-composer-focus-outline"
stage: intent
schema: 3
status: accepted
owner: codex
created: 2026-09-02
source: direct Browser comment that the focused transient composer must not show a blue frame
risk: low
approved_by: "userthe direct 2026-09-02 Browser comment"
approved_at: "2026-09-02"
---

# Intent: Remove the transient composer blue focus outline

## Problem

The focused Quick Chat composer currently paints a blue inset outline around the whole input card.
The user asked to remove that frame. Quick Chat and Side Chat share the same transient composer, so
the correction must remain at that shared seam and must not introduce a Web-only or placement-only
variant.

The desired outcome is a quiet, non-blue focus state that keeps the textarea operable and visible.
The main task Composer, layout, controls, transport, and conversation behavior are out of scope.

## Proposed outcome

The focused Quick Chat composer currently paints a blue inset outline around the whole input card.

## Affected users and systems

Migrated from legacy change.md.

## Constraints

The user's direct Browser comment accepts this low-risk visual correction. Ponytail selected one
shared class replacement and one existing regression update; no new component, option, or Web UI
branch is justified.

Human review remains required before merge. Merge, release, deployment, and publication are not
authorized.

## Out of scope

Not recorded in the legacy single-file Artifact.

## Success signals

See Spec acceptance criteria.

## Open questions

None recorded in migration.

## Decision

The user's direct Browser comment accepts this low-risk visual correction. Ponytail selected one
shared class replacement and one existing regression update; no new component, option, or Web UI
branch is justified.

Human review remains required before merge. Merge, release, deployment, and publication are not
authorized.
