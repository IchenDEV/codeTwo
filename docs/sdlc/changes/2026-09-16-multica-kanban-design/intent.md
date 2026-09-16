---
id: 2026-09-16-multica-kanban-design
schema: 5
stage: intent
status: accepted
owner: chenli
created: 2026-09-16
source: user
risk: medium
approved_by: chenli
approved_at: 2026-09-16
approval_source: "Direct request: https://multica.ai/ 借鉴一下这个产品的看板设计. Scope confirmed in the same session: 完整借鉴（卡片信息密度 + 列布局与列内新建 + 拖拽）with 对齐投影 for cross-lane drag semantics. Follow-up in the same session: 不要这种聚集边框，另外最底下 session 前面是不是有个图标会比较好 — the drag-time outline was replaced by a stronger lane tint and the session count gained a chat mark."
next_trigger: Implement, verify, and hand off; merge and release need their own authorization.
---

# Intent: Borrow Multica's Kanban board design

## Intent

The user asked to borrow the kanban design of [multica.ai](https://multica.ai/) for the desktop Task
Board (`apps/desktop/src/taskboard/`). The reference product's board (open source at
`github.com/multica-ai/multica`, `packages/views/issues/components/board-*.tsx`) was read before
planning. Its board differs from ours in three user-visible ways:

1. Cards are information-dense: identifier, title, description preview, priority, labels, agent
   activity badge, dates, child progress — while our `TaskBoardKanban` renders title, a priority
   word, a session count, a PR count and a timestamp.
2. Lanes are fixed-width columns with their own vertical scroll, a tinted column plane, a
   header (status + count) and a per-column add button; our board uses four equal-width columns that
   share one scroll area and have no column actions.
3. Cards are draggable between lanes (changing status) and within a lane (changing order) with drag
   feedback and blank-area drag-to-pan; our board has no drag path at all — moves go through the
   card menu only, and an unused drag affordance (`taskboard.dragTask*`, `taskboard.addInColumn`,
   the reducer's exact `beforeId` anchor, the `@dnd-kit/react` wrapper) is already in the tree.

Outcome: the board view adopts the reference board's density, column geometry and direct
manipulation while keeping CodeTwo's own design standard, data model, and non-drag paths.

Constraints: the desktop design standard (`Design.md`, `docs/design/system.md`) still owns shape,
color, typography, motion and shared components; no new dependency is added (the bundled
`@dnd-kit/react` + `useBoardDragPan`-style pointer handling is enough); task data stays local
(`localStorage` snapshot) and no server/team board is introduced; the existing list view, editor,
inspector and "Move to" menu remain the accessible, non-drag path; the shared 100%-mutation gate on
`workspaceModel.ts` must stay green.

Non-goals: swimlane/grouping views, assignees/collaborators, start/due dates, sub-task progress,
saved-view filters, hiding or reordering lanes, live agent streaming on cards, and any change to the
list view's information architecture.

## Non-goals

- No swimlane, grouping, table, or gantt view; no lane show/hide/reorder.
- No assignee, date, or sub-task fields on `BoardTask`.
- No server-side or shared task board; the desktop board stays `localStorage`-backed.
- No list-view redesign and no change to the editor, inspector, or PR linking.
