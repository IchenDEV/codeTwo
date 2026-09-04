---
id: "2026-09-04-sidebar-project-actions"
stage: verification
schema: 3
status: passed
owner: kimi-code
created: "2026-09-04"
based_on: plan.md
commit: ""
verification_mode: owner
verified_by: "kimi-code"
verified_at: "2026-09-04"
release_target: none
release_identity: ""
---

# Verification: Sidebar Project Actions

## Automated checks

- AC-1: PASS — new focused test in `bun test tests/sessionRailRendered.test.tsx`
  ("project menu removes registered projects and hides removal for synthesized ones") opens the
  project dropdown, asserts the "Remove from list" item only for the registered project, clicks it,
  and observes `onRemoveProject("/tmp/repo")`; the App wiring calls the existing
  `removeProjectEntry` after `confirmNative`.
- AC-3: PASS — `cd apps/desktop && bunx tsc --noEmit` and
  `bunx eslint src/sidebar/SessionRail.tsx src/sidebar/sidebarDnd.tsx src/components/ui/drag-drop.tsx src/App.tsx src/i18n/strings.ts --max-warnings 0`
  both exit clean.
- AC-4: PASS — `bun test tests/sessionRailRendered.test.tsx tests/windowChromeContract.test.ts tests/desktopPerformanceContract.test.ts`
  → `50 pass 0 fail` combined (31 rail tests including the two dnd fixtures).
- Repository Gates: `bun script/verify/docs.ts`, `bun script/verify/sdlc.ts`, and
  `bun script/verify/sdlc.ts --worktree` all pass.

## Behavioral evidence

- AC-2: PASS — the dnd keyboard-guidance test in `bun test tests/sessionRailRendered.test.tsx`
  finds `[data-project-drag-handle]` on the project header row (grip button removed) and asserts
  dnd-kit's draggable role description without native HTML5 drag attributes; pointer activation is
  distance-gated via `projectRowSensors` in `src/sidebar/SessionRail.tsx` (4px mouse / 250ms touch),
  which keeps collapse-toggle and menu clicks intact per dnd-kit's `ActivationController` semantics
  (immediate activation would `preventDefault` the pointerdown and swallow the click).

## Visual evidence

Not captured — interaction change verified through rendered-DOM tests; no screenshot harness was
run for this PR.

## Security and privacy evidence

No new network, storage, or permission surface; project removal keeps on-disk files and sessions
and confirms natively before acting.

## Deviations and residual risk

Residual risk: drag-from-row interplay with text selection inside the row and long-press touch
behavior were verified by code review against dnd-kit's sensor defaults, not by manual device
testing; the legacy `2026-09-03-migrate-cn-engine` bundle was migrated verbatim to schema-3 to
unblock the Gates (recorded in plan.md Deviations).

## Verdict

Verdict: verified.

## Review and release

Approval: pending human merge review.
Release target: none.
Release identity: not applicable until released.
Smoke evidence: not applicable until released.
Rollback: revert the merge commit; no data or persisted-state changes are involved.
No release: desktop UI change only; no product release is required to close after merge.

## Feedback

No feedback yet.
