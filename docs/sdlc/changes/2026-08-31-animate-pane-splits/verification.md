---
id: "2026-08-31-animate-pane-splits"
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

# Verification: Animate new pane splits

## Automated checks

Verdict: verified

### Acceptance evidence

- AC-1: PASS — `Browser Split right / Split down interaction` created `pane-2` with
  `data-pane-entrance="right"` and `pane-3` with `data-pane-entrance="bottom"`; both rendered
  `animation-name: pane-tile-enter`. The [light final split state](../2026-08-31-replace-sidebar-drag-with-dnd-kit/evidence/split-animation-end-light.png)
  records the stable end geometry; live interaction and computed styles prove the motion itself.
- AC-2: PASS — `bun test tests/paneTiles.test.tsx tests/paneChrome.test.tsx` verifies that the
  initial pane has no entrance marker, existing pane DOM identity is preserved across rerender,
  and only newly added leaves receive an entrance class.
- AC-3: PASS — `Browser computed-style inspection` measured `0.22s` and
  `cubic-bezier(0.16, 1, 0.3, 1)` for both menu actions. The focused test covers left, right, top,
  and bottom. Setting Appearance → Reduce motion → On reduced a fresh split to `1e-05s`.
- AC-4: PASS — the focused pane suites passed nine tests and 49 expectations; `bunx tsc --noEmit`
  and targeted ESLint passed; final full `bun test` passed 806 tests and 3,841 expectations; and
  `bun run build:renderer` completed lint, TypeScript, and the Vite production build. Browser page
  identity, meaningful content, menu interaction, screenshot inspection, and console checks passed
  with no relevant warnings or errors.

Residual risk: a static screenshot proves the final tiled geometry while computed styles and live
interaction prove the short entrance itself; the renderer-only QA did not restart the user's
existing Core-backed desktop process. No Core protocol or persistence path changed.

## Behavioral evidence

Verdict: verified

### Acceptance evidence

- AC-1: PASS — `Browser Split right / Split down interaction` created `pane-2` with
  `data-pane-entrance="right"` and `pane-3` with `data-pane-entrance="bottom"`; both rendered
  `animation-name: pane-tile-enter`. The [light final split state](../2026-08-31-replace-sidebar-drag-with-dnd-kit/evidence/split-animation-end-light.png)
  records the stable end geometry; live interaction and computed styles prove the motion itself.
- AC-2: PASS — `bun test tests/paneTiles.test.tsx tests/paneChrome.test.tsx` verifies that the
  initial pane has no entrance marker, existing pane DOM identity is preserved across rerender,
  and only newly added leaves receive an entrance class.
- AC-3: PASS — `Browser computed-style inspection` measured `0.22s` and
  `cubic-bezier(0.16, 1, 0.3, 1)` for both menu actions. The focused test covers left, right, top,
  and bottom. Setting Appearance → Reduce motion → On reduced a fresh split to `1e-05s`.
- AC-4: PASS — the focused pane suites passed nine tests and 49 expectations; `bunx tsc --noEmit`
  and targeted ESLint passed; final full `bun test` passed 806 tests and 3,841 expectations; and
  `bun run build:renderer` completed lint, TypeScript, and the Vite production build. Browser page
  identity, meaningful content, menu interaction, screenshot inspection, and console checks passed
  with no relevant warnings or errors.

Residual risk: a static screenshot proves the final tiled geometry while computed styles and live
interaction prove the short entrance itself; the renderer-only QA did not restart the user's
existing Core-backed desktop process. No Core protocol or persistence path changed.

## Visual evidence

See bundle evidence/ when present.

## Security and privacy evidence

Not separately recorded unless present in legacy Verification.

## Deviations and residual risk

Residual risk: a static screenshot proves the final tiled geometry while computed styles and live

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

The screenshot is the accepted scope indicator; no post-change feedback exists yet.
