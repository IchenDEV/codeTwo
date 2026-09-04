---
id: "2026-09-04-sidebar-project-actions"
stage: intent
schema: 3
status: accepted
owner: kimi-code
created: "2026-09-04"
source: "user"
risk: "low"
approved_by: "chenli"
approved_at: 2026-09-04
---

# Intent: Sidebar Project Actions

## Problem

Two direct user requests in the current 2026-09-04 session:

1. A Project's "..." menu in the sidebar rail offered reorder and Section placement only; there
   was no way to remove a Project from the list without opening Settings. The user asked for a
   delete capability in that menu (screenshot of the MacOS project menu).
2. Project drag sorting required a hover-only grip handle. The user asked for handle-free
   sorting: grab the project row itself.

## Proposed outcome

- The project menu gains a destructive remove action that confirms natively and removes the
  project from the rail while keeping files and saved sessions on disk (same semantics as the
  existing Settings → Project removal).
- A project row is draggable by pressing anywhere on its header; a small movement threshold
  keeps the collapse toggle and menu button clicks intact. The hover grip disappears.

## Affected users and systems

Desktop sidebar rail (`apps/desktop`). No Core, server, or protocol changes; no data migration.

## Constraints

- Reuse the existing `removeProject` bridge, `removeProjectEntry` flow, and the Settings
  confirmation copy instead of inventing a second removal path.
- Keep dnd-kit behind the shared `@/components/ui/drag-drop` boundary.
- Row-level dragging must not break click-to-collapse or the "..." menu; keyboard reordering
  stays available (dnd-kit keyboard sensor on the row, plus the menu's 上移/下移 items).
- Only registered Projects can be removed; entries synthesized from live sessions would
  reappear on refresh, so the action stays hidden for them.

## Out of scope

- Task-row and Section-row grip handles (unchanged).
- Deleting sessions or files from disk.
- Multi-instance/profile work from AGENTS.md.

## Success signals

- Project menu shows a remove item that removes the project after confirmation.
- A project row reorders under pointer drag without a grip; collapse and menu clicks still work.
- `tsc --noEmit`, eslint, and the sidebar test suites pass.

## Open questions

None.

## Decision

The user's two direct implementation requests on 2026-09-04 accept this Intent, with user
`chenli` as named approver. Merge/PR creation is requested by the user ("pr"); release Gates do
not apply to this desktop-only UI change.
