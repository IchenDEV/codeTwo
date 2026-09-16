---
id: 2026-09-16-multica-kanban-design
schema: 5
stage: plan
status: accepted
owner: chenli
created: 2026-09-16
based_on: spec.md
scope: apps/desktop/src/App.tsx, apps/desktop/src/components/ui/drag-drop.tsx, apps/desktop/src/taskboard, apps/desktop/src/i18n/strings.ts, apps/desktop/tests/taskBoard.test.ts, apps/desktop/tests/taskBoardDnd.test.ts, apps/desktop/tests/taskBoardRendered.test.tsx, apps/desktop/tests/taskBoardWorkspaceModel.test.ts, docs/sdlc/changes/2026-09-16-multica-kanban-design
---

# Plan: Borrow Multica's Kanban board design

## Plan

1. `apps/desktop/src/taskboard/taskBoard.ts` — add `number` to `BoardTask`, bump the snapshot to v4
   with deterministic migration/repair, add `nextTaskNumber`, `laneStatus`, and the aligned
   `taskBoardLane`; `createBoardTask` accepts an optional `number`.
2. `apps/desktop/src/taskboard/boardDnd.ts` (new) — the pure drag contract: lane data/group parsing,
   sortable snapshot narrowing, and `boardDropTarget` (lane → durable status + exact `beforeId`
   anchor), so drop math is unit-testable without a DOM.
3. `apps/desktop/src/taskboard/useBoardDragPan.ts` (new) — blank-area horizontal pan for the board
   scroller, with the interactive-element exemption as a pure exported predicate.
4. `apps/desktop/src/taskboard/TaskBoardCard.tsx` (new) — the four-row card from the Spec
   (identity/activity row, title, description preview, meta row).
5. `apps/desktop/src/taskboard/TaskBoardColumn.tsx` (new) — fixed-width lane, header with count and
   add button, vertical scroller doubling as the drop zone, empty state, drop highlight.
6. `apps/desktop/src/taskboard/TaskBoardKanban.tsx` — replace the current grouping-only board with
   the `DragDropRoot` board built from the two new components; resolve drops through `boardDnd.ts`
   and report them as `onMoveTask(task, status, beforeId?)`.
7. `apps/desktop/src/taskboard/{TaskBoardCollection,TaskBoardPage,TaskBoardList}.tsx` — widen the
   move callback with the optional anchor and keep every existing menu/editor call site working.
8. `apps/desktop/src/taskboard/task-board.css` — fixed-width lane geometry, per-lane tone tint,
   column scroller, drag/drop feedback, and the reduced-motion guard.
9. `apps/desktop/src/i18n/strings.ts` — the new card/column/drag keys in `en` and `zhCN`.
10. Tests: update `tests/taskBoard.test.ts` (numbers, migration, lane mapping, reducer anchors),
    `tests/taskBoardWorkspaceModel.test.ts` (aligned projection), `tests/taskBoardRendered.test.tsx`
    (new card/column contracts), and add `tests/taskBoardDnd.test.ts` for the pure drop contract.

Checks by risk and affected behavior:

- Desktop renderer: `bun run lint`, `bunx tsc --noEmit`, `bun test` from `apps/desktop`.
- Mutation gate: `bun run mutation:taskboard` must stay at 100% for `workspaceModel.ts`.
- Rendered board (AC-1…AC-4, AC-7, AC-8): the DOM-rendered suite covers structure, counts, add
  button, empty states and the drag source markup; the visual/interactive acceptance runs the Vite
  renderer (`bun run dev:renderer`, port 1420) in the session browser for light/dark/narrow
  screenshots and a real pointer drag, because a passing DOM test cannot prove layout or drag
  feedback. If the collaborative browser cannot reach the local port, the attempt is recorded as
  residual risk instead of being claimed.
- Repository: `bun script/verify/sdlc.ts --worktree` and `bun script/verify/docs.ts` before handoff.

Temporary resources: `.codex/run/instances/multica-kanban-design/` holds the Vite dev-server log and
any screenshots produced during rendered acceptance; the Vite process on port 1420 is stopped before
handoff, and the retained screenshots (when produced) are linked as evidence. `apps/desktop/node_modules`
stays in place as the shared package install; the checker's `reports/` output from the mutation run is
disposable.

Rollback: revert the taskboard, i18n, and test edits (the board returns to the previous
grouping-only view); existing `localStorage` snapshots keep loading because v4 parsing is additive
and no persisted field is renamed or removed.
