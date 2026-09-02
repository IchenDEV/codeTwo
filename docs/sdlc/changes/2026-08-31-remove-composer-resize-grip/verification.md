---
id: "2026-08-31-remove-composer-resize-grip"
stage: verification
schema: 3
status: passed
owner: codex
created: 2026-08-31
based_on: plan.md
commit: ""
verification_mode: owner
verified_by: "codex"
verified_at: "2026-09-01"
release_target: none
release_identity: "not applicable until released."
---

# Verification: Remove the composer resize grip

## Automated checks

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

## Behavioral evidence

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

## Visual evidence

See bundle evidence/ when present.

## Security and privacy evidence

Not separately recorded unless present in legacy Verification.

## Deviations and residual risk

Residual risk: verification used the isolated renderer rather than restarting the user's existing

## Verdict

Verdict: verified.

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
