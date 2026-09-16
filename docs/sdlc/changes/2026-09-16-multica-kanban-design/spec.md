---
id: 2026-09-16-multica-kanban-design
schema: 5
stage: spec
status: accepted
owner: chenli
created: 2026-09-16
based_on: intent.md
---

# Spec: Borrow Multica's Kanban board design

## Design

### Selection

A Task only looks selected after the user picks it: the fallback that gives the inspector its
content (the first visible Task) is never written into the selection state, and a selection whose
Task was deleted is cleared. The selected card and list row share one treatment — the list's soft
accent tint (`bg-accent/35`) — instead of the neutral `fill-selected` fill that read as a boxed
card on the board.

### Card content (borrowed row structure)

`TaskBoardCard` renders four rows inside the existing flat `surface` module (16px radius, 12px
inset, no border, no shadow change):

1. identity row — a decorative grip mark (visible on hover/focus, the whole card is the drag
   source), the stable task number `TASK-{number}` (metadata, muted), then the kebab `TaskActionsMenu`;
   when the latest Session is running, awaiting input, or failed, a `StatusBadge` chip
   (`session.running` / `session.awaitingInput` / `session.failed`, tones success/warning/destructive)
   sits before the kebab.
2. title — 2-line clamp, the existing selection button.
3. description preview — one muted line, only when the description is non-empty.
4. meta row — flag icon + `taskPriorityLabel` for any priority except `none` (icon carries the
   `aria-label`), label chips (first two + `+N`), the session count behind a small chat mark when
   `> 0`, the open-PR count when `> 0` and resolved, and the updated-at text pushed to the trailing
   edge. Zero counts stay hidden (unchanged contract).

Priority icons use the shared `Flag` glyph; the icon tone stays on the neutral text hierarchy
(medium/high/urgent are words, not colors) so no new color semantics are introduced.

### Column geometry and chrome

The board becomes four fixed-width lanes (`--task-board-column-width: 17rem`) in a flex row; the
board area is the only horizontal scroller (`overflow-x-auto`, `overflow-y-hidden`), and each lane
owns its vertical scroller (`overflow-y-auto`, `min-h-0`). Lane header: `StatusIndicator` (tone from
`LANE_TONES`) + lane label + count, and a hover/focus `Button` with the `Plus` icon that opens the
editor in that lane's durable status (`Add task to {status}` — reuses `taskboard.addInColumn`). Lane
background is the neutral `fill-quiet` plane mixed with the lane's status tone at low strength
through `color-mix` in `task-board.css`, so the four stages stay distinguishable without a new
token; the empty-lane copy and `data-task-column`/`data-task-card` hooks are preserved.

### Drag and drop

`TaskBoardKanban` wraps the board in the shared `DragDropRoot` boundary. Each card is a
`useDragDropSortable` item (`type`/`accept: "task"`, `group: lane`, `index`, data `{taskId, lane}`);
each lane's card scroller is a `useDragDropZone` (`accept: "task"`, lowest collision priority, data
`{lane}`) so empty lanes and lane background accept drops.

- Drag feedback: the source card dims while dragging (`isDragging`), the lane under the pointer
  strengthens its own status tint (no outline box around the card area), the hovered card carries a
  2px insertion edge, and the shared feedback plugin moves the card with the pointer and keeps a
  faint placeholder in the column.
- Drop resolution is pure and unit-tested (`boardDnd.ts`):
  `boardDropTarget(laneTasks, activeTaskId, index)` returns the durable status for the lane plus the
  optional exact `beforeId` anchor. The anchor is the first task at or after the insertion point
  whose durable status matches the lane's status; a drop on lane background appends
  (`beforeId` absent). The reducer's existing `move` already treats a supplied anchor as exact, so
  stale anchors no-op instead of appending.
- Cross-lane semantics: dropping on a lane sets `laneStatus(lane)` — `queue` writes To do,
  `running` In progress, `needs_you` In review, and `done` Done — and the drop position is applied
  inside that status group. Because a lane can mix durable statuses only in `needs_you`
  (`in_review` plus attention-carrying `in_progress`), the achievable position inside the group
  wins over the literal pixel position; this is deterministic and documented in the module.
- Blank-area left-drag on the board background pans horizontally (Trello/Linear pattern) through a
  small pointer hook; it never activates on cards, buttons, links, or form controls, and it leaves
  touch/pen to the browser.
- Keyboard, menu and editor paths are untouched: `TaskActionsMenu`'s "Move to {status}" and the
  editor's status field remain the non-drag path, and Escape or a canceled drag leaves all state
  unchanged.

### Lane projection alignment

`taskBoardLane` keeps its order of checks but no longer sends an idle `in_progress` task back to
`queue`: `done → done`, `in_review → needs_you`, To do → `queue`, `awaiting_input|failed → needs_you`,
otherwise `running`. Lanes therefore read as durable stages (`queue` ≈ To do, `running` ≈ In progress,
`needs_you ≈ in_review + attention`, `done`) and a drop's result stays visible instead of bouncing
back. `needs_you` remains the attention lane for `in_progress` sessions that await input or failed.

### Task number and snapshot v4

`BoardTask` gains `number: number`, a stable per-board display identity rendered as `TASK-{n}`.
`TASKBOARD_SNAPSHOT_VERSION` becomes `4`:

- `parseBoardSnapshot` still accepts versions 1–4. Tasks from v1–v3 (and v4 entries whose number is
  missing, non-positive, or duplicated) receive the next free number in stored order, so legacy
  boards migrate deterministically and a numbering glitch never discards user data.
- `nextTaskNumber(tasks)` is `max(number) + 1`; the reducer's `create` assigns it so two creations
  cannot collide, `useTaskBoardActions.saveEditor` and App's direct board writes pass it explicitly,
  and `seedTasks` numbers the starter board 1…9 in creation order.

## Acceptance criteria

- [x] AC-1: A board card shows the stable `TASK-{number}`, its title, a one-line description preview
      when the description exists, the priority flag plus label for every priority except `none`,
      up to two label chips with a `+N` overflow, the session count (with its mark) when non-zero,
      the open-PR count when non-zero and resolved, the updated-at text, and a `StatusBadge` only
      when the current Session is running, awaiting input, or failed.
- [x] AC-2: The four lanes are fixed-width columns with independent vertical scrolling; the board is
      the sole horizontal scroller; each lane header shows the lane status, count, and an add button
      that opens the editor in that lane's durable status; empty lanes keep their empty copy; the
      lane plane carries a subtle per-lane status tint in light and dark.
- [x] AC-3: Dragging a card within a lane reorders it and dropping it on another lane changes its
      durable stage (Queue writes To do, Running In progress, Needs you In review, Done Done) at
      the resolved anchor; a drop on lane background appends; dropping outside any lane or canceling
      the drag changes nothing.
- [x] AC-4: During a drag the source card is visibly dimmed, the lane under the pointer strengthens
      its tint (no outline box around the card area) while the hovered card shows the insertion
      edge, and releasing over a lane applies exactly one move (no duplicate dispatches).
- [x] AC-5: `taskBoardLane` maps To do to `queue`, `in_progress→running` (idle and running),
      `in_progress` with `awaiting_input`/`failed` → `needs_you`, `in_review→needs_you`,
      `done→done`.
- [x] AC-6: Snapshot v4 round-trips task numbers; v1/v2/v3 snapshots load with deterministic numbers
      in stored order; invalid or duplicate numbers are repaired without dropping the board; new
      tasks receive `max+1` and never collide.
- [x] AC-7: The list view, its 40-row progressive window, the kebab "Move to" path, the editor's
      status field and the inspector keep working; the board and list highlight a Task only after an
      explicit pick (soft accent tint, matching the list's existing selected row), while the
      inspector keeps its first-visible fallback content and a deleted selection is dropped instead
      of jumping to another row.
- [x] AC-8: Light, dark, and narrow renderings of the board were produced and inspected, including a
      drag-in-progress frame and a filtered/empty column state.
