---
id: "2026-09-01-empty-heading-project-typography"
stage: intent
schema: 3
status: accepted
owner: codex
created: 2026-09-01
source: direct user report that the project name does not match the surrounding empty-task heading
risk: low
approved_by: "userdirect screenshot feedback on 2026-09-01"
approved_at: "2026-09-01"
---

# Intent: Match the empty-heading project typography

## Problem

The empty Task screen embeds the current Project as a dropdown trigger inside its greeting. The
shared Button typography currently remains smaller and lighter than the surrounding heading, and
the following Chinese phrase has no explicit separating space. The user requested that this inline
Project name match the title instead of reading like an unrelated control.

## Proposed outcome

The empty Task screen embeds the current Project as a dropdown trigger inside its greeting. The

## Affected users and systems

Migrated from legacy change.md.

## Constraints

The user directly approved this correction. Ponytail selected the smallest shared-seam fix: override
only the inline trigger's inherited typography and add the missing whitespace. The shared Button
component, heading size, dropdown implementation, and layout remain unchanged.

This is low risk because it changes presentation on one empty-state trigger without changing data or
execution. Merge, release, and deployment are not authorized.

## Out of scope

Not recorded in the legacy single-file Artifact.

## Success signals

See Spec acceptance criteria.

## Open questions

None recorded in migration.

## Decision

The user directly approved this correction. Ponytail selected the smallest shared-seam fix: override
only the inline trigger's inherited typography and add the missing whitespace. The shared Button
component, heading size, dropdown implementation, and layout remain unchanged.

This is low risk because it changes presentation on one empty-state trigger without changing data or
execution. Merge, release, and deployment are not authorized.
