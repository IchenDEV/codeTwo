---
id: "2026-08-31-remove-composer-resize-grip"
stage: plan
schema: 3
status: accepted
owner: codex
created: 2026-08-31
based_on: spec.md
risk: low
scope: apps/desktop/src/App.tsx, apps/desktop/src/session/Composer.tsx, apps/desktop/src/styles.css, apps/desktop/src/i18n/strings.ts, apps/desktop/tests/composerGeometryContract.test.ts, docs/sdlc/changes/2026-08-31-remove-composer-resize-grip
approved_by: "[user]"
approved_at: "2026-08-31"
---

# Plan: Remove the composer resize grip

## Files and ownership

apps/desktop/src/App.tsx, apps/desktop/src/session/Composer.tsx, apps/desktop/src/styles.css, apps/desktop/src/i18n/strings.ts, apps/desktop/tests/composerGeometryContract.test.ts, docs/sdlc/changes/2026-08-31-remove-composer-resize-grip

## Order of work

1. Delete the grip element, resize hook, styles, label, and App-owned height mutation state.
2. Retain a fixed compact maximum with the existing available-column clamp and add a source
   contract preventing the affordance from returning.
3. Verify the rendered compact and full-page controls in an isolated renderer, then run repository
   tests, build, and lifecycle Gates.

Rollback restores the grip and its prior resize state.

## Test-first proof

See legacy Verification section.

## Visual or integration proof

See legacy Verification section.

## Risks and mitigations

See legacy Decision and gates.

## Rollback

See legacy Review and release.

## Deviations

Removed the `composer-grip` element, `useResizeHandle` binding, grip styles, focus selector, and
English/Chinese grip label. `App` no longer persists or maintains per-pane composer resize state,
and `Composer` no longer accepts height mutation props. The compact editor keeps the prior 190 px
default maximum and its available-column clamp; the existing explicit expand/collapse control is
unchanged.

## Decision

The user's direct request accepts this low-risk deletion, and the follow-up `pr` authorizes PR
creation. Human review remains required before merge. No release, deployment, or external mutation
is authorized.
