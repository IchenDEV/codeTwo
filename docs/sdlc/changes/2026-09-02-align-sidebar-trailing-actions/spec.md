---
id: "2026-09-02-align-sidebar-trailing-actions"
stage: spec
schema: 3
status: accepted
owner: codex
created: 2026-09-02
based_on: intent.md
risk: low
approved_by: "userthe direct 2026-09-02 screenshot feedback"
approved_at: "2026-09-02"
---

# Spec: Align sidebar trailing actions

## Requirements

The Quick Chat button and title-bar collapse button use the same effective 16px right inset as the
Search shortcut. The existing sidebar spacing tokens, shared SessionRail component, action
semantics, and focus behavior remain unchanged. Collapsed-rail layout and unrelated navigation rows
are out of scope.

## User experience

Not separately recorded in legacy change.md.

## Technical design

See Requirements and legacy Git history.

## Security and privacy

See migrated Decision and gates.

## Alternatives and non-goals

Not separately recorded in legacy change.md.

## Areas of concern

The user's direct screenshot feedback accepts this low-risk alignment correction. Ponytail selected
one existing spacing-token addition at the shared SessionRail seam plus one regression assertion; no
new wrapper, layout system, or Web-only variant is justified.

Human review remains required before merge. Merge, release, deployment, and publication are not
authorized.

## Acceptance criteria

- [x] AC-1: The Search shortcut, Quick Chat action, and title-bar collapse action share one rendered
      trailing centerline in the live Web UI, verified by Browser geometry and screenshots.
- [x] AC-2: The Quick Chat and collapse actions remain present, labeled, keyboard-focusable, and
      clickable, verified by the focused rendered regression and live Browser interactions.

## Decision

The user's direct screenshot feedback accepts this low-risk alignment correction. Ponytail selected
one existing spacing-token addition at the shared SessionRail seam plus one regression assertion; no
new wrapper, layout system, or Web-only variant is justified.

Human review remains required before merge. Merge, release, deployment, and publication are not
authorized.
