---
id: "2026-09-02-align-sidebar-trailing-actions"
stage: intent
schema: 3
status: accepted
owner: codex
created: 2026-09-02
source: direct screenshot feedback that the Search shortcut, New task trailing action, and title-bar collapse action must align
risk: low
approved_by: "userthe direct 2026-09-02 screenshot feedback"
approved_at: "2026-09-02"
---

# Intent: Align sidebar trailing actions

## Problem

The first screenshot showed that the Search shortcut and the Quick Chat action at the end of the New
task row did not share the same right edge. After that 4px correction, the user's follow-up screenshot
shows the title-bar collapse action still sitting farther right. Live geometry confirms its icon
center is 8px to the right of the other two controls. The desired outcome is one quiet vertical
trailing baseline without changing row height, icon size, labels, shortcuts, or interactions.

## Proposed outcome

The first screenshot showed that the Search shortcut and the Quick Chat action at the end of the New

## Affected users and systems

Migrated from legacy change.md.

## Constraints

The user's direct screenshot feedback accepts this low-risk alignment correction. Ponytail selected
one existing spacing-token addition at the shared SessionRail seam plus one regression assertion; no
new wrapper, layout system, or Web-only variant is justified.

Human review remains required before merge. Merge, release, deployment, and publication are not
authorized.

## Out of scope

Not recorded in the legacy single-file Artifact.

## Success signals

See Spec acceptance criteria.

## Open questions

None recorded in migration.

## Decision

The user's direct screenshot feedback accepts this low-risk alignment correction. Ponytail selected
one existing spacing-token addition at the shared SessionRail seam plus one regression assertion; no
new wrapper, layout system, or Web-only variant is justified.

Human review remains required before merge. Merge, release, deployment, and publication are not
authorized.
