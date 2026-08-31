---
id: change-2026-08-31-align-sidebar-search-shortcut
kind: change
schema: 2
status: verified
risk: low
owner: codex
approvers: [user]
approved_at: 2026-08-31
created: 2026-08-31
updated: 2026-08-31
source: direct user request with screenshot highlighting the sidebar search shortcut alignment
inputs: SessionRail search launcher width and inset behavior
outputs: evenly inset search launcher with an aligned shortcut badge
scope: apps/desktop/src/sidebar/SessionRail.tsx, apps/desktop/tests/sessionRailRendered.test.tsx, docs/sdlc/changes/2026-08-31-align-sidebar-search-shortcut
next_trigger: PR review; merge and release remain pending
verification_mode: owner
verified_by: codex
verified_at: 2026-08-31
---

# Align the sidebar search shortcut

## Intent

The user highlighted the `⌘K` badge in the sidebar search launcher and requested an alignment fix.
The launcher currently combines the row Button's full width with horizontal margins, so its right
edge reaches the rail divider instead of matching the left inset.

## Spec

Keep the existing search icon, label, shortcut, click behavior, height, and visual treatment. Make
the search launcher consume the available rail width after both horizontal margins so its left and
right edges use equal insets. The shortcut remains vertically centered by the existing flex row.

### Acceptance criteria

- [x] AC-1: The search launcher has equal left and right insets inside the sidebar.
- [x] AC-2: The `⌘K` badge remains vertically centered and fully contained in the launcher.
- [x] AC-3: Search activation, titlebar controls, and feature rows remain unchanged.
- [x] AC-4: Focused tests, renderer build, rendered Browser geometry, and repository lifecycle
      checks pass.

## Decision and gates

The direct user request approves this low-risk layout correction. The follow-up `pr` authorizes PR
creation only. Human review remains required before merge; release, deployment, and external
mutation remain unauthorized.

## Plan

1. Lock the width-overflow symptom with a focused SessionRail regression assertion.
2. Override the row Button's full-width sizing only for the search launcher.
3. Measure both horizontal insets and shortcut containment in an isolated rendered sidebar.

Rollback restores the previous search launcher width class.

## Build

The search launcher now overrides the shared row Button's `w-full` with `w-auto`. As a stretched
flex item, its automatic width accounts for both `mx-2` margins instead of adding those margins to
a full-width row. No shortcut, typography, height, interaction, or shared Button styling changed.

## Verification

Verdict: verified.

### Acceptance evidence

- AC-1: PASS — the pre-fix `bun test tests/sessionRailRendered.test.tsx --test-name-pattern
  "equal rail insets"` failed because the launcher retained `w-full`; after the fix it passed.
  Browser geometry at 1280 x 720 measured equal `8 px` left and right rail insets.
- AC-2: PASS — Browser `playwright.evaluate(getBoundingClientRect)` measured the shortcut's
  vertical center delta from the launcher at `0 px` and confirmed all four shortcut bounds
  remained inside the launcher.
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
