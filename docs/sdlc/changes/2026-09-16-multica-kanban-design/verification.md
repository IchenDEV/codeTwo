---
id: 2026-09-16-multica-kanban-design
schema: 5
stage: verification
status: passed
owner: chenli
created: 2026-09-16
based_on: plan.md
revision: 7178600a (branch t3code/multica-kanban-design), based on 8d1f32d7
verification_mode: owner
verified_by: chenli
verified_at: 2026-09-16
release_target: none
cleanup_status: complete
---

# Verification: Borrow Multica's Kanban board design

## Verification

- AC-1: PASS — `bun test tests/taskBoardRendered.test.tsx` ("renders the dense board card
  contract with activity, labels, and overflow") asserts `TASK-1`, title, one-line description
  preview, `紧急`, the two visible label chips plus `+1`, `1 个会话`, and the `处理中` status badge
  in one card; the same case now also asserts the session count sits behind a chat mark
  (`[data-session-count]` contains an `svg`), and the earlier board test asserts the priority flag
  label, a label chip, `TASK-2`, and that a card with no Session renders no status badge and never
  prints zero counts. The board screenshots come from the session-less seed board (this standalone
  renderer has no Core session), so they show flag and label chips but no session mark. Evidence:
  [light board](evidence/board-light.png), [dark board](evidence/board-dark.png),
  [selected card](evidence/board-selected.png).
- AC-2: PASS — the same rendered suite asserts the new geometry contract in `task-board.css`
  (`--task-board-column-width: 17rem`, `flex: 0 0 var(--task-board-column-width)`, column
  `overflow-y: auto`), four `[data-task-column-cards]` scrollers, a per-lane `在队列中新建任务` /
  `在已完成中新建任务` button, and that creating from the Queue header stores the To do stage and
  renders in that lane. Live rendering at 1000×700 measured four 272px lanes, a board scroller of
  `scrollWidth 1128` inside `clientWidth 712`, and no document overflow; the filtered state shows
  `No tasks match these filters` in the three empty lanes. Evidence: [light board](evidence/board-light.png),
  [dark board](evidence/board-dark.png), [compact board](evidence/board-narrow.png),
  [filtered board](evidence/board-filtered.png).
- AC-3: PASS — `bun test tests/taskBoardDnd.test.ts` covers `boardDropTarget` (exact anchors,
  clamping, cross-lane status mapping, mixed `needs_you` skipping), `boardDropPreview`
  (before/after, background append, self-hover no-op, cross-lane) and `boardDropAfterKeyboard`;
  `bun test tests/taskBoard.test.ts` keeps the reducer's exact-`beforeId`/append/cross-column
  cases. Live in the running renderer, a keyboard drag moved a Queue card one position down
  (`seed-empty-state-copy` after `seed-session-link`), a second drag moved it into Running
  (`status: "in_progress"`, order 0, before `seed-local-persistence`), and Escape left storage
  byte-identical (`unchanged: true`).
- AC-4: PASS — live drag frames show the dimmed source slot (`data-dnd-placeholder` at 40%
  opacity), the dragged card lifted at `position: fixed`, the target lane's strengthened tint
  (measured `oklch(0.901 0.024 149)` against `oklch(0.981 0 0)` for an untargeted lane, with no
  outline rule left in `task-board.css`) and the insertion edge on the hovered card; after each
  drop the board persisted exactly one move, `data-dnd-dragging` and `data-dnd-placeholder` counts
  returned to zero, and the error log stayed empty (only the host's benign `ResizeObserver`
  notices). Evidence: [drag in progress](evidence/board-drag.png).
- AC-5: PASS — `taskBoard.test.ts` maps To do to `queue`, `in_progress→running` for both idle and
  running, `awaiting_input`/`failed → needs_you`, `in_review→needs_you`, `done→done`, plus
  `laneStatus` for all four lanes; `taskBoardWorkspaceModel.test.ts` expects the idle
  `in_progress` projection in `running`; the rendered suite shows the same split for a live
  Session awaiting input.
- AC-6: PASS — `taskBoard.test.ts` asserts `TASKBOARD_SNAPSHOT_VERSION === 4`, seed numbers 1–9,
  `nextTaskNumber` (empty, unnumbered, `max+1`), `assignTaskNumbers` repair of zero/NaN/duplicate/
  negative numbers (idempotent), the reducer creating `max+1`, v1 migration numbering, and a v4
  round trip that preserves an explicit number; the rendered suite persists created tasks and
  reloads them.
- AC-7: PASS — `bun test` passes 947 tests (3 skipped) across 167 files, including every existing
  list-view, editor, selection, inspector, filter and menu case. The new rendered case "highlights a
  board card only after the user picks it" asserts that a freshly rendered board has no
  `[data-task-card][data-selected]` while the inspector still names the first Task, and that picking
  the card highlights exactly it; the selected card and list row use the list's soft accent tint
  (`bg-accent/35`). [Selected card](evidence/board-selected.png) shows the resulting treatment.
- AC-8: PASS — six rendered states were produced in the Vite renderer at `localhost:1420` and
  inspected: [light board with all four lanes](evidence/board-light.png) (rail collapsed so every
  lane is visible, no card highlighted by default), [selected card](evidence/board-selected.png),
  [dark scheme](evidence/board-dark.png), [1000×700 compact layout](evidence/board-narrow.png) with
  the board as the only horizontal scroller, [a drag in progress](evidence/board-drag.png), and
  [a filtered board with three empty lanes](evidence/board-filtered.png). All were re-captured
  after the follow-up that removed the drag-time outline, added the session mark, and replaced the
  card's neutral selected fill with the list's accent tint, so the record holds no stale visual.

Checks:

- `bun test` from `apps/desktop`: 947 passed, 3 skipped, 0 failed (re-run after the follow-up).
- `bun run lint` and `bunx tsc --noEmit` from `apps/desktop`: clean (re-run after the follow-up).
- `bun run mutation:taskboard`: 100.00% mutation score for `src/taskboard/workspaceModel.ts`
  (thresholds 100/100/100), re-run after the final follow-up on the worktree.
- `bun run build:renderer` from `apps/desktop`: passed (lint, types, Vite production build),
  re-run after the follow-up.
- `bun script/verify/sdlc.ts --worktree` and `bun script/verify/docs.ts`: passed.

Verdict: verified.
Residual risk: the selection change drops the "first row looks current" cue the list had before
this pass; the inspector still names the fallback Task, and the list/board highlight now follows an
explicit pick only. Pointer drags could not be driven end-to-end in this session — synthetic
`PointerEvent`s cannot claim pointer capture, so the library cancels the gesture, and the
collaborative browser exposes no native drag input. The shared drop-resolution, reducer and
reconciliation paths were exercised through the keyboard sensor, which is the same code minus the
pointer sensor; the pointer-only part (the card following the cursor, auto-scroll) is library
behavior that the light/dark screenshots cannot prove. Board cards deliberately disable the
library's optimistic sorting plugin, so cards do not reflow live during a drag; the lane ring and
the insertion edge are the feedback instead. `needs_you` can still mix attention-carrying
`in_progress` cards with `in_review` ones, and reordering there clamps to the nearest same-status
position, which the drop-preview tests document.

## Cleanup

Removed: `.codex/run/instances/multica-kanban-design/` (Vite dev-server logs, the three mutation
logs, and the working copies of the screenshots) and its now-empty `instances/`/`run/` parents after
the six evidence PNGs were consolidated under
`docs/sdlc/changes/2026-09-16-multica-kanban-design/evidence/`; each render pass removed its
`apps/desktop/dist` (renderer build) and `apps/desktop/reports/taskboard-mutation.json` (4.5 MB
mutation report); every Stryker run removed its own `.stryker-tmp` sandbox; the scratch `multica`
clone and landing-page images under the session's temporary directory.
Retained: none. The committed evidence screenshots live in this change record and
`apps/desktop/node_modules` stays in place as the shared package install.
Processes: the task-owned Vite renderer dev server on port 1420 was stopped
(`lsof -nP -iTCP:1420 -sTCP:LISTEN` empty afterwards); no Core, desktop app, or user-owned
process was started, stopped, or connected.
Evidence: `ls` of the removed instance directory before removal, `lsof`/`pgrep` for port 1420 and
`vite`, and `git status` showing only the intended taskboard, i18n, test, and record paths.

## Review and release

Approval: implementation was requested directly by the user on 2026-09-16 (https://multica.ai/
借鉴一下这个产品的看板设计), with the scope and drag semantics confirmed in the same session.
Merge, release, and external actions are not authorized.
Rollback: revert the taskboard, i18n, and test edits plus the new modules; existing `localStorage`
snapshots keep loading because v4 parsing is additive and no persisted field was renamed.
Release: No release requested; merge and external actions require their own authorization.
Review: [PR #237](https://github.com/IchenDEV/codeTwo/pull/237) carries this change on branch
t3code/multica-kanban-design; the hosted Validate job passed on the code revision 7178600a
(run 35071350449) and on the record revision 788dd43a (run 35073185753).
Feedback: Link an Incident and regression Eval when a real failure occurs.
