---
id: "2026-09-01-taskboard-view-switching"
stage: verification
schema: 3
status: passed
owner: codex
created: 2026-09-01
based_on: plan.md
commit: ""
verification_mode: owner
verified_by: "codex"
verified_at: "2026-09-02"
release_target: none
release_identity: "not applicable until released."
---

# Verification: Add TaskBoard view switching

## Automated checks

Verdict: verified

The owner verified the initial view-switching slice, the compact-board follow-up, the
overflow/minimum-width correction, and the sidebar spacer rollback on 2026-09-01, then verified the
340px lane-minimum and empty Session row follow-ups on 2026-09-02. Human review remains the next
Gate; merge, release, and deployment are not authorized.

### Acceptance evidence

- AC-1: PASS — `bun test tests/taskBoardRendered.test.tsx` passed 23 tests and 102 assertions,
  including shared filters and the four derived board lanes. Wide native-window interaction showed
  the list and board over the same 27 projected Tasks.
- AC-2: PASS — `bun test tests/taskBoardRendered.test.tsx` proved valid preference restoration,
  remount persistence, and invalid storage fallback to List. The preference is isolated to
  `codetwo.taskboard.view.v1` and does not mutate Task data.
- AC-3: PASS — `bun test tests/taskBoardRendered.test.tsx` covered board-card selection, existing
  Task actions, Details, and the PR #216 narrow Show Inspector / Back to tasks path while preserving
  board view and selection.
- AC-4: PASS — the full desktop suite passed 843 tests and 5,035 assertions; `bun run
  build:renderer` passed ESLint, Stylelint, TypeScript, and Vite production build; repository Gate
  checks passed 5 tests. Final follow-up validation passed 843 tests and 5,041 assertions. Native
  light interaction and 1280 x 900 plus 760 x 900 Browser windows passed with zero page overflow,
  no console errors, in-place Inspector navigation, and an intentionally scrollable board surface.
- AC-5: PASS — `bun run dev:renderer -- --host 127.0.0.1` powered native-sized Browser inspection.
  The final 1280 px renderer shows three readable lanes while retaining the integrated Inspector;
  the standard native window shows two full lanes plus the third-lane entry, and both expose all four
  lanes through the contained board scroller.
- AC-6: PASS — `bun test tests/taskBoardRendered.test.tsx` passed 23 tests and 105 assertions,
  including one status indicator per lane and absence of `0 sessions` / `PR 0` card noise. Browser
  DOM and screenshots confirmed compact meaningful metadata, selection, and Task details.
- AC-7: PASS — `bun test` passed 843 tests and 5,035 assertions; `bun run build:renderer` passed
  ESLint, Stylelint, TypeScript, and Vite production build; repository Gate checks passed 5 tests.
  The final native application was restarted from the rebuilt bundle with one Core listening on
  port 50000, and Browser console inspection reported no warnings or errors.
- AC-8: PASS — `bun run dev:renderer -- --host 127.0.0.1` powered Browser geometry checks at 1280 x
  900 and 760 x 900. Every lane measured 224 px, zero cards or metadata rows had `scrollWidth`
  greater than `clientWidth`, and document `scrollWidth` equaled viewport width. A horizontal gesture
  changed only the board scroller from 0 to 235 px while document scroll stayed at 0. The fresh
  native light window reproduced the same contained clipping boundary with long Chinese titles and
  metadata.
- AC-9: PASS — `bun test tests/taskBoardRendered.test.tsx tests/sessionRailRendered.test.tsx`
  passed 49 tests and 361 assertions after the spacer rollback. The rebuilt native window showed the
  `codeTwo` Project label and its child `hi` Session titles on the established shared start line.
  Existing disclosure, DnD, selection, and context-menu tests stayed green.
- AC-10: PASS — `bun test` passed 843 tests and 5,041 assertions; `bun run build:renderer` passed
  ESLint, Stylelint, TypeScript, and Vite; documentation and SDLC Gates passed; Gate tests passed 5
  tests and 23 assertions. Browser page identity, nonblank content, overlay detection, console health,
  screenshot evidence, and internal-scroll interaction passed. The rebuilt native application is
  running with exactly one Core on port 50000.
- AC-11: PASS — `bun test tests/sessionRailRendered.test.tsx tests/taskBoardRendered.test.tsx`
  passed 49 tests and 361 assertions; the final `bun test` desktop suite passed 843 tests and 5,028
  assertions. Browser geometry remained four 224 px lanes with zero overflowing cards and document
  width equal to viewport width. The freshly rebuilt native window confirmed the extra title spacer
  is gone, and exactly one Core is listening on port 50000.
- AC-12: PASS — `bun test ./tests/taskBoardRendered.test.tsx` passed 23 tests and 111 expectations,
  including the 340px grid contract. Playwright at 1247 x 1576 measured all four lanes at exactly
  340px, the board scroller at 671px client / 1416px scroll width, and a successful internal scroll
  from 0px to 500px while document client and scroll widths both remained 1247px. Card selection,
  page identity, nonblank content, and framework-overlay checks passed. `bun run build:renderer` and
  `git diff --check` also passed; the only console errors were the known unpaired static Web UI
  transport messages.
- AC-13: PASS — `bun test ./tests/taskBoardRendered.test.tsx` passed 23 tests and 113 expectations,
  proving empty Session stacks omit the fill and populated stacks retain it. Playwright at 1247 x
  1576 measured both the empty stack and its row as transparent `rgba(0, 0, 0, 0)`, confirmed No
  Sessions and Start task remain visible, exercised expand and collapse, and found no document
  overflow or framework overlay. `bun run build:renderer` and `git diff --check` passed; the only
  console errors were the known unpaired static Web UI transport messages.

Residual risk: at very large Task counts, the board renders all filtered cards while the list keeps
its existing 40-row progressive window. The board deliberately prefers readable 340px lanes and
internal horizontal scrolling over compressing all four lanes into the viewport; drag-and-drop is
out of scope, so Task status changes remain explicit menu actions. The standard 1152 px native
window requires horizontal scrolling to reveal the whole fourth lane because the PR #216 Inspector
remains persistent. The 760 x 900 behavior was verified in the live renderer plus rendered component
tests because the native minimum window size prevents reaching that breakpoint.

## Behavioral evidence

Verdict: verified

The owner verified the initial view-switching slice, the compact-board follow-up, the
overflow/minimum-width correction, and the sidebar spacer rollback on 2026-09-01, then verified the
340px lane-minimum and empty Session row follow-ups on 2026-09-02. Human review remains the next
Gate; merge, release, and deployment are not authorized.

### Acceptance evidence

- AC-1: PASS — `bun test tests/taskBoardRendered.test.tsx` passed 23 tests and 102 assertions,
  including shared filters and the four derived board lanes. Wide native-window interaction showed
  the list and board over the same 27 projected Tasks.
- AC-2: PASS — `bun test tests/taskBoardRendered.test.tsx` proved valid preference restoration,
  remount persistence, and invalid storage fallback to List. The preference is isolated to
  `codetwo.taskboard.view.v1` and does not mutate Task data.
- AC-3: PASS — `bun test tests/taskBoardRendered.test.tsx` covered board-card selection, existing
  Task actions, Details, and the PR #216 narrow Show Inspector / Back to tasks path while preserving
  board view and selection.
- AC-4: PASS — the full desktop suite passed 843 tests and 5,035 assertions; `bun run
  build:renderer` passed ESLint, Stylelint, TypeScript, and Vite production build; repository Gate
  checks passed 5 tests. Final follow-up validation passed 843 tests and 5,041 assertions. Native
  light interaction and 1280 x 900 plus 760 x 900 Browser windows passed with zero page overflow,
  no console errors, in-place Inspector navigation, and an intentionally scrollable board surface.
- AC-5: PASS — `bun run dev:renderer -- --host 127.0.0.1` powered native-sized Browser inspection.
  The final 1280 px renderer shows three readable lanes while retaining the integrated Inspector;
  the standard native window shows two full lanes plus the third-lane entry, and both expose all four
  lanes through the contained board scroller.
- AC-6: PASS — `bun test tests/taskBoardRendered.test.tsx` passed 23 tests and 105 assertions,
  including one status indicator per lane and absence of `0 sessions` / `PR 0` card noise. Browser
  DOM and screenshots confirmed compact meaningful metadata, selection, and Task details.
- AC-7: PASS — `bun test` passed 843 tests and 5,035 assertions; `bun run build:renderer` passed
  ESLint, Stylelint, TypeScript, and Vite production build; repository Gate checks passed 5 tests.
  The final native application was restarted from the rebuilt bundle with one Core listening on
  port 50000, and Browser console inspection reported no warnings or errors.
- AC-8: PASS — `bun run dev:renderer -- --host 127.0.0.1` powered Browser geometry checks at 1280 x
  900 and 760 x 900. Every lane measured 224 px, zero cards or metadata rows had `scrollWidth`
  greater than `clientWidth`, and document `scrollWidth` equaled viewport width. A horizontal gesture
  changed only the board scroller from 0 to 235 px while document scroll stayed at 0. The fresh
  native light window reproduced the same contained clipping boundary with long Chinese titles and
  metadata.
- AC-9: PASS — `bun test tests/taskBoardRendered.test.tsx tests/sessionRailRendered.test.tsx`
  passed 49 tests and 361 assertions after the spacer rollback. The rebuilt native window showed the
  `codeTwo` Project label and its child `hi` Session titles on the established shared start line.
  Existing disclosure, DnD, selection, and context-menu tests stayed green.
- AC-10: PASS — `bun test` passed 843 tests and 5,041 assertions; `bun run build:renderer` passed
  ESLint, Stylelint, TypeScript, and Vite; documentation and SDLC Gates passed; Gate tests passed 5
  tests and 23 assertions. Browser page identity, nonblank content, overlay detection, console health,
  screenshot evidence, and internal-scroll interaction passed. The rebuilt native application is
  running with exactly one Core on port 50000.
- AC-11: PASS — `bun test tests/sessionRailRendered.test.tsx tests/taskBoardRendered.test.tsx`
  passed 49 tests and 361 assertions; the final `bun test` desktop suite passed 843 tests and 5,028
  assertions. Browser geometry remained four 224 px lanes with zero overflowing cards and document
  width equal to viewport width. The freshly rebuilt native window confirmed the extra title spacer
  is gone, and exactly one Core is listening on port 50000.
- AC-12: PASS — `bun test ./tests/taskBoardRendered.test.tsx` passed 23 tests and 111 expectations,
  including the 340px grid contract. Playwright at 1247 x 1576 measured all four lanes at exactly
  340px, the board scroller at 671px client / 1416px scroll width, and a successful internal scroll
  from 0px to 500px while document client and scroll widths both remained 1247px. Card selection,
  page identity, nonblank content, and framework-overlay checks passed. `bun run build:renderer` and
  `git diff --check` also passed; the only console errors were the known unpaired static Web UI
  transport messages.
- AC-13: PASS — `bun test ./tests/taskBoardRendered.test.tsx` passed 23 tests and 113 expectations,
  proving empty Session stacks omit the fill and populated stacks retain it. Playwright at 1247 x
  1576 measured both the empty stack and its row as transparent `rgba(0, 0, 0, 0)`, confirmed No
  Sessions and Start task remain visible, exercised expand and collapse, and found no document
  overflow or framework overlay. `bun run build:renderer` and `git diff --check` passed; the only
  console errors were the known unpaired static Web UI transport messages.

Residual risk: at very large Task counts, the board renders all filtered cards while the list keeps
its existing 40-row progressive window. The board deliberately prefers readable 340px lanes and
internal horizontal scrolling over compressing all four lanes into the viewport; drag-and-drop is
out of scope, so Task status changes remain explicit menu actions. The standard 1152 px native
window requires horizontal scrolling to reveal the whole fourth lane because the PR #216 Inspector
remains persistent. The 760 x 900 behavior was verified in the live renderer plus rendered component
tests because the native minimum window size prevents reaching that breakpoint.

## Visual evidence

See bundle evidence/ when present.

## Security and privacy evidence

Not separately recorded unless present in legacy Verification.

## Deviations and residual risk

Residual risk: at very large Task counts, the board renders all filtered cards while the list keeps

## Verdict

Verdict: verified.

## Review and release

Draft PR: [#218](https://github.com/IchenDEV/codeTwo/pull/218).
Approval: the user approved implementation on 2026-09-01.
Release target: none.
Release identity: not applicable until released.
Smoke evidence: not applicable until released.
Rollback: revert this change; the existing list remains the default and Task data is unchanged.
No release: no merge, release, or deployment was requested.

## Feedback

The user requested a visual/interaction optimization after seeing the launched board, then reported
that its lane minimum had become too narrow and that sidebar rows were not aligned. After the first
alignment attempt added an extra title spacer, the user reported that the hierarchy became more
confusing. The spacer was removed without changing the board fix: lanes remain readable, overflow is
contained, and Project/Session titles use their established shared start line.
