---
id: "2026-08-31-replace-sidebar-drag-with-dnd-kit"
stage: plan
schema: 3
status: accepted
owner: codex
created: 2026-08-31
based_on: spec.md
risk: medium
scope: apps/desktop/package.json, apps/desktop/bun.lock, apps/desktop/src/components/ui/drag-drop.tsx, apps/desktop/src/sidebar/SessionRail.tsx, apps/desktop/src/sidebar/sidebarDnd.tsx, apps/desktop/tests/sessionRailRendered.test.tsx, apps/desktop/tests/sidebarDnd.test.ts, docs/sdlc/changes/2026-08-31-replace-sidebar-drag-with-dnd-kit
approved_by: "[user]"
approved_at: "2026-08-31"
---

# Plan: Replace sidebar drag handling with dnd-kit

## Files and ownership

apps/desktop/package.json, apps/desktop/bun.lock, apps/desktop/src/components/ui/drag-drop.tsx, apps/desktop/src/sidebar/SessionRail.tsx, apps/desktop/src/sidebar/sidebarDnd.tsx, apps/desktop/tests/sessionRailRendered.test.tsx, apps/desktop/tests/sidebarDnd.test.ts, docs/sdlc/changes/2026-08-31-replace-sidebar-drag-with-dnd-kit

## Order of work

1. Add the maintained `@dnd-kit/react` package behind a shared UI primitive and a small typed
   adapter for sidebar items and drop locations.
2. Replace native drag handlers with `DragDropProvider`, sortable rows, and explicit empty-list
   drop zones while retaining the existing state mutation callbacks.
3. Update focused rendered coverage and run type, unit, build, lifecycle, and physical pointer-drag
   verification in an isolated renderer.

Rollback removes the dependency and adapter and restores the previous sidebar drag interaction.

## Test-first proof

See legacy Verification section.

## Visual or integration proof

See legacy Verification section.

## Risks and mitigations

See legacy Decision and gates.

## Rollback

See legacy Review and release.

## Deviations

Added the pinned `@dnd-kit/react` dependency behind the shared `components/ui/drag-drop` primitive
and a typed sidebar adapter for sortable rows and explicit drop zones. `SessionRail` now registers
the complete Section, Project, and Task row as each sortable element, exposes a dedicated keyboard
drag handle, and preserves the existing domain operations for persisted moves. Feature code no
longer imports the third-party package directly. Native HTML5 `draggable`, `dragstart`,
`dataTransfer`, and `drop` handling was removed.

Project moves decode the library's finalized sortable group and index so a same-list sort, a
cross-Section move, and a move back to root all resolve against the actual destination rather than
a stale hover row. Group components are URI-encoded, so paths and Section IDs containing colons
remain unambiguous. Empty Section and empty root drop zones have distinct IDs and explicit
collision priority, so another item kind cannot overwrite the registered target.

Nonempty Project and Section Task containers stay below their nested Task rows in collision
priority while empty containers retain the stronger target needed for first-item placement.
Drag-over normalization also clears the remembered destination on a missing or incompatible
target, so a release outside the sidebar cannot mutate the last valid destination.

## Decision

The direct user request accepts this medium-risk Intent and the dependency choice. Human review
remains required before merge. No release or production action is authorized.
