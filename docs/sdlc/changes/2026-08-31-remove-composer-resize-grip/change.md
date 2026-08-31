---
id: change-2026-08-31-remove-composer-resize-grip
kind: change
schema: 2
status: verified
risk: low
owner: codex
approvers: [user]
approved_at: 2026-08-31
created: 2026-08-31
updated: 2026-09-01
source: direct user request with screenshot highlighting the non-working composer resize grip
inputs: current Composer grip, resize state, styles, and translated label
outputs: composer without the unusable top resize affordance or its dormant feature wiring
scope: apps/desktop/src/App.tsx, apps/desktop/src/session/Composer.tsx, apps/desktop/src/styles.css, apps/desktop/src/i18n/strings.ts, apps/desktop/tests/composerGeometryContract.test.ts, docs/sdlc/changes/2026-08-31-remove-composer-resize-grip
next_trigger: human review and merge decision on PR #208
verification_mode: owner
verified_by: codex
verified_at: 2026-09-01
---

# Remove the composer resize grip

## Intent

The user identified the small horizontal grip at the top center of the prompt Composer and asked
to remove it because it cannot actually be dragged in the product. Remove the misleading control
and its resize-only state rather than leaving an invisible or dormant interaction. Preserve the
Composer card, its bounded compact height, the explicit full-page toggle, editor content, and all
send controls. The follow-up `pr` authorizes PR creation for this verified scope only; a broader
Composer redesign, merge, or release remains unauthorized.

## Spec

The compact Composer has no top resize grip, resize cursor, drag handler, double-click target, or
resize accessibility label. Its document area retains the current 190 px default maximum and
continues to clamp against the available column height. Full-page mode remains available through
the existing explicit expand/collapse button. Remove the persisted and per-pane height mutation
wiring that only served the deleted grip.

### Acceptance criteria

- [x] AC-1: The highlighted top-center grip is absent from the rendered compact Composer without
      leaving extra top spacing or changing the card radius.
- [x] AC-2: Composer source, styles, translations, and App wiring contain no grip resize feature,
      while the explicit full-page control and bounded compact editor remain.
- [x] AC-3: Focused tests, full desktop tests, renderer build, rendered Browser inspection, and
      repository lifecycle checks pass.

## Decision and gates

The user's direct request accepts this low-risk deletion, and the follow-up `pr` authorizes PR
creation. Human review remains required before merge. No release, deployment, or external mutation
is authorized.

## Plan

1. Delete the grip element, resize hook, styles, label, and App-owned height mutation state.
2. Retain a fixed compact maximum with the existing available-column clamp and add a source
   contract preventing the affordance from returning.
3. Verify the rendered compact and full-page controls in an isolated renderer, then run repository
   tests, build, and lifecycle Gates.

Rollback restores the grip and its prior resize state.

## Build

Removed the `composer-grip` element, `useResizeHandle` binding, grip styles, focus selector, and
English/Chinese grip label. `App` no longer persists or maintains per-pane composer resize state,
and `Composer` no longer accepts height mutation props. The compact editor keeps the prior 190 px
default maximum and its available-column clamp; the existing explicit expand/collapse control is
unchanged.

## Verification

Verdict: verified

### Acceptance evidence

- AC-1: PASS — `Browser rendered compact Composer check` found zero `.composer-grip` elements.
  The first document child begins at the exact card top, proving the deleted 11 px grip did not
  leave a spacer, and computed card radius remains `24px` at 1280x720. The shared
  [narrow rendered shell](../2026-08-31-replace-sidebar-drag-with-dnd-kit/evidence/pr-review-narrow-dark.png)
  supplies the constrained-viewport evidence; the zero-element and geometry measurements are the
  acceptance evidence for the removed affordance itself.
- AC-2: PASS — `rg -n 'composer-grip|composer\.grip|codetwo\.composerHeight|composerHByPane'
  apps/desktop/src` returned no matches. `bun test tests/composerGeometryContract.test.ts` passed
  four tests and 34 expectations, including the fixed 190 px bound and explicit full-page button.
- AC-3: PASS — final `bun test` passed 806 tests and 3,841 expectations; `bunx tsc --noEmit` passed;
  `bun run build:renderer` completed lint, TypeScript, and the Vite production build. Browser page
  identity, meaningful content, compact/full-page interaction, framework-overlay inspection,
  screenshot inspection, and console checks passed with no relevant warnings or errors.

Residual risk: verification used the isolated renderer rather than restarting the user's existing
Core-backed desktop process. The changed surface is renderer-only, and no Core protocol or user
data path changed.

## Review and release

Approval: [PR #208](https://github.com/IchenDEV/codeTwo/pull/208) created by user authorization;
merge pending human review.
Release target: none.
Release identity: not applicable until released.
Smoke evidence: not applicable until released.
Rollback: revert this change bundle.
No release: PR creation is authorized; merge, deployment, and release remain unauthorized.

## Feedback

The highlighted screenshot and statement that the grip cannot be dragged are the direct defect
feedback for this change.
