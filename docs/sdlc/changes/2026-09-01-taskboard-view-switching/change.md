---
id: change-2026-09-01-taskboard-view-switching
kind: change
schema: 2
status: verified
risk: medium
owner: codex
approvers: user via the 2026-09-01 direct request to support different TaskBoard views
approved_at: 2026-09-01
created: 2026-09-01
updated: 2026-09-02
source: direct user requests after PR #216 merged into main, including live feedback that the added sidebar title spacer made the hierarchy more confusing and the 2026-09-02 annotated request for 340px minimum board lanes
inputs: the merged Task-to-Session list workspace, projected Task lanes, shared filters, selection, and responsive Inspector behavior
outputs: list and board presentations over the same Task projection with a persisted personal view preference and readable 340px minimum board lanes
scope: apps/desktop/src/i18n/strings.ts, apps/desktop/src/taskboard, apps/desktop/src/sidebar/SessionRail.tsx, apps/desktop/tests/taskBoardRendered.test.tsx, apps/desktop/tests/sessionRailRendered.test.tsx, docs/sdlc/changes/2026-09-01-taskboard-view-switching
next_trigger: human review; merge, release, and deployment remain unauthorized
verification_mode: owner
verified_by: codex
verified_at: 2026-09-02
---

# Add TaskBoard view switching

## Intent

The TaskBoard currently exposes only the merged flat Task-to-Session list. The user requested
different view modes and noted that merged PR #216 may conflict with new TaskBoard behavior. The
desired outcome is a direct switch between the detailed list and a lane-oriented board without
forking Task data, filters, selection, or Inspector state.

PR #216 is the required baseline. Its wide persistent Inspector and narrow in-place list/detail
navigation must remain intact. This change does not migrate Task persistence, add drag-and-drop,
change Task status semantics, or alter the shared collaboration transport.

## Spec

- The TaskBoard header offers an accessible List/Board view switcher.
- Both views consume the same filtered `ProjectedTask` collection; the existing list retains its
  progressive rendering optimization while the board renders the filtered lane contents.
- The board groups Tasks by the existing derived lanes: Queue, Running, Needs you, and Done.
- Selecting a board card updates the existing Inspector; switching views preserves the selected
  Task, selected Session, filters, list expansion state, and responsive Inspector behavior.
- The chosen view is a personal local preference. Missing, invalid, or unavailable storage falls
  back to List without affecting Task data.
- Existing Task actions, including edit, move, start, and delete, remain available in both views.

### Acceptance criteria

- [x] AC-1: The header switches between one flat Task list and four derived-lane board columns over
      the same filtered Task projection.
- [x] AC-2: View choice survives remount, invalid storage falls back safely, and Task persistence is
      unchanged.
- [x] AC-3: Selection, Inspector state, Task actions, and PR #216 wide/narrow navigation continue to
      work across view changes.
- [x] AC-4: Focused tests, renderer checks, documentation/SDLC Gates, and real light, dark, and narrow
      window interaction pass.
- [x] AC-5: At the standard C2 development window, the board exposes materially more lane context
      without changing the persistent Inspector contract or requiring a new control.
- [x] AC-6: Board cards remove redundant zero-value and repeated-lane metadata while retaining Task
      title, meaningful priority, active Session/PR counts, update time, selection, and actions.
- [x] AC-7: The optimized board passes focused tests, renderer checks, repository Gates, and a fresh
      native-window interaction after restart.
- [x] AC-8: Board lanes retain a readable minimum width, cards cannot overlap adjacent lanes, and
      horizontal overflow remains contained by the board scroller at standard and narrow widths.
- [x] AC-9: Project and nested Session titles preserve the established shared start line without
      changing disclosure, drag-and-drop, selection, or context-menu behavior.
- [x] AC-10: Focused rendered tests, the renderer build, repository Gates, Browser QA, and a fresh
      native-window interaction pass for the overflow and alignment follow-up.
- [x] AC-11: Remove the extra Session title spacer so a Project label and its child Session titles
      return to the established shared start line, while retaining the board overflow correction and
      all existing sidebar interactions.
- [x] AC-12: Every Board lane keeps a 340px minimum width while horizontal overflow remains contained
      by the existing board scroller at the annotated viewport.

## Decision and gates

The user approved implementation directly. Ponytail selected the smallest reuse path: the existing
business `ViewSwitcher`, Task projection, lane labels, Task action menu, selection hook, and
responsive Inspector stay authoritative. No new data model, dependency, route, or second page is
introduced.

This is medium risk because it changes the primary TaskBoard presentation while leaving data and
execution untouched. Merge, release, and deployment are not authorized.

The user's 2026-09-02 annotated request accepts reopening this change only to increase the existing
Board lane minimum from 14rem to 340px. The current four-lane grid and contained horizontal scroller
remain authoritative.

## Plan

1. Add the persisted personal view state and the existing header switcher.
2. Add a lane board renderer that reuses projected Tasks and existing Task actions.
3. Preserve the PR #216 Inspector contract and cover switching, persistence, selection, filters,
   actions, and narrow behavior with focused tests.
4. Run renderer and repository Gates, then exercise list/board switching in real light, dark, and
   narrow windows.
5. Increase the existing lane and four-track minimums to 340px, add focused contract coverage, and
   repeat rendered overflow inspection at the annotated viewport.

Rollback removes the board renderer and switcher and leaves the existing list as the fallback.
The local preference key is inert if the UI is reverted.

## Build

Added a persisted personal `list`/`board` preference, reused the existing business
`ViewSwitcher`, and introduced a four-lane board over the authoritative `ProjectedTask` data. Board
cards retain the existing Task action menu and route selection through the same Task/Session and
Inspector action used by the list. The list remains the default and keeps its progressive rendering
behavior.

The implementation was applied after updating the worktree baseline to PR #216's merge commit
`b7010aa4`. Its wide persistent Inspector and narrow in-place Task/Inspector navigation remain the
single responsive contract; no competing drawer, overlay, or Task state model was added.

The first optimization follow-up narrowed lane and card geometry, moved status indication from every
card to each lane header, suppressed zero Session/PR metadata, strengthened selected-card feedback,
and used a smaller Inspector measure only in Board view. After the user found that minimum too
narrow, the final follow-up set every lane to a readable 14 rem minimum, contained cards and their
metadata, and made the board surface the sole horizontal scroller. A subsequent sidebar spacer
experiment compounded the existing Project nesting and made the hierarchy less clear, so that
spacer was removed: Project labels and child Session titles again use the established shared start
line, while provider and workspace icons remain on metadata rows. No new view, preference, data
path, drag-and-drop behavior, or dependency was introduced.

The 2026-09-02 follow-up changes the existing four-lane grid minimum from 14rem to 340px and updates
the explicit four-track width accordingly. The same board shell remains the sole horizontal scroller;
the Task projection, cards, Inspector, responsive breakpoints, and view preference are unchanged.

## Verification

Verdict: verified

The owner verified the initial view-switching slice, the compact-board follow-up, the
overflow/minimum-width correction, and the sidebar spacer rollback on 2026-09-01, then verified the
340px lane-minimum follow-up on 2026-09-02. Human review remains the next Gate; merge, release, and
deployment are not authorized.

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

Residual risk: at very large Task counts, the board renders all filtered cards while the list keeps
its existing 40-row progressive window. The board deliberately prefers readable 340px lanes and
internal horizontal scrolling over compressing all four lanes into the viewport; drag-and-drop is
out of scope, so Task status changes remain explicit menu actions. The standard 1152 px native
window requires horizontal scrolling to reveal the whole fourth lane because the PR #216 Inspector
remains persistent. The 760 x 900 behavior was verified in the live renderer plus rendered component
tests because the native minimum window size prevents reaching that breakpoint.

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
