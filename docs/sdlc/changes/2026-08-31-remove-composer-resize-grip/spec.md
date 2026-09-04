---
id: "2026-08-31-remove-composer-resize-grip"
stage: spec
schema: 3
status: accepted
owner: codex
created: 2026-08-31
based_on: intent.md
risk: low
approved_by: "[user]"
approved_at: "2026-08-31"
---

# Spec: Remove the composer resize grip

## Requirements

The compact Composer has no top resize grip, resize cursor, drag handler, double-click target, or
resize accessibility label. Its document area retains the current 190 px default maximum and
continues to clamp against the available column height. Full-page mode remains available through
the existing explicit expand/collapse button. Remove the persisted and per-pane height mutation
wiring that only served the deleted grip.

## User experience

Not separately recorded in legacy change.md.

## Technical design

See Requirements and legacy Git history.

## Security and privacy

See migrated Decision and gates.

## Alternatives and non-goals

Not separately recorded in legacy change.md.

## Areas of concern

The user's direct request accepts this low-risk deletion, and the follow-up `pr` authorizes PR
creation. Human review remains required before merge. No release, deployment, or external mutation
is authorized.

## Acceptance criteria

- [x] AC-1: The highlighted top-center grip is absent from the rendered compact Composer without
      leaving extra top spacing or changing the card radius.
- [x] AC-2: Composer source, styles, translations, and App wiring contain no grip resize feature,
      while the explicit full-page control and bounded compact editor remain.
- [x] AC-3: Focused tests, full desktop tests, renderer build, rendered Browser inspection, and
      repository lifecycle checks pass.

## Decision

The user's direct request accepts this low-risk deletion, and the follow-up `pr` authorizes PR
creation. Human review remains required before merge. No release, deployment, or external mutation
is authorized.
