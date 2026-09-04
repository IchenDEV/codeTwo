---
id: "2026-08-31-align-sidebar-search-shortcut"
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

# Verification: Align the sidebar search shortcut

## Automated checks

Verdict: verified

### Acceptance evidence

- AC-1: PASS — the pre-fix `bun test tests/sessionRailRendered.test.tsx --test-name-pattern
  "equal rail insets"` failed because the launcher retained `w-full`; after the fix it passed.
  Browser geometry at 1280 x 720 measured equal `8 px` left and right rail insets.
- AC-2: PASS — Browser `playwright.evaluate(getBoundingClientRect)` measured the shortcut's
  vertical center delta from the launcher at `0 px` and confirmed all four shortcut bounds
  remained inside the launcher. The final [dark sidebar screenshot](../2026-08-31-replace-sidebar-drag-with-dnd-kit/evidence/pr-review-dark.png)
  records the contained `⌘K` badge and equal launcher insets.
- AC-3: PASS — `bun test tests/sessionRailRendered.test.tsx` passed 26 tests and 252 expectations;
  clicking the rendered launcher opened the Command palette and Browser console errors/warnings
  remained empty.
- AC-4: PASS — full `bun test` and `bun run build:renderer` passed. The renderer build completed
  lint, TypeScript, and the Vite production build. Browser page identity, non-blank DOM, overlay
  absence, console health, geometry, interaction, and 1280 x 720 screenshot inspection passed.
  `bun test script/verify/checks.test.ts`, `bun script/verify/docs.ts`,
  `bun script/verify/sdlc.ts`, and `bun script/verify/sdlc.ts --worktree` passed.

Residual risk: rendered QA used an isolated renderer on port 1421 and did not start or interfere
with the user's Core-backed desktop process. The correction is width-independent because the
browser validates the flex inset contract at the current 290 px rail width; no Core, persistence,
or protocol path changed.

## Behavioral evidence

Verdict: verified

### Acceptance evidence

- AC-1: PASS — the pre-fix `bun test tests/sessionRailRendered.test.tsx --test-name-pattern
  "equal rail insets"` failed because the launcher retained `w-full`; after the fix it passed.
  Browser geometry at 1280 x 720 measured equal `8 px` left and right rail insets.
- AC-2: PASS — Browser `playwright.evaluate(getBoundingClientRect)` measured the shortcut's
  vertical center delta from the launcher at `0 px` and confirmed all four shortcut bounds
  remained inside the launcher. The final [dark sidebar screenshot](../2026-08-31-replace-sidebar-drag-with-dnd-kit/evidence/pr-review-dark.png)
  records the contained `⌘K` badge and equal launcher insets.
- AC-3: PASS — `bun test tests/sessionRailRendered.test.tsx` passed 26 tests and 252 expectations;
  clicking the rendered launcher opened the Command palette and Browser console errors/warnings
  remained empty.
- AC-4: PASS — full `bun test` and `bun run build:renderer` passed. The renderer build completed
  lint, TypeScript, and the Vite production build. Browser page identity, non-blank DOM, overlay
  absence, console health, geometry, interaction, and 1280 x 720 screenshot inspection passed.
  `bun test script/verify/checks.test.ts`, `bun script/verify/docs.ts`,
  `bun script/verify/sdlc.ts`, and `bun script/verify/sdlc.ts --worktree` passed.

Residual risk: rendered QA used an isolated renderer on port 1421 and did not start or interfere
with the user's Core-backed desktop process. The correction is width-independent because the
browser validates the flex inset contract at the current 290 px rail width; no Core, persistence,
or protocol path changed.

## Visual evidence

See bundle evidence/ when present.

## Security and privacy evidence

Not separately recorded unless present in legacy Verification.

## Deviations and residual risk

Residual risk: rendered QA used an isolated renderer on port 1421 and did not start or interfere

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

The screenshot is the accepted symptom and scope indicator; no post-change feedback exists yet.
