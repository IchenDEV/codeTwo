---
id: "2026-09-04-sidebar-project-actions"
stage: plan
schema: 3
status: accepted
owner: kimi-code
created: "2026-09-04"
based_on: spec.md
risk: "low"
scope: apps/desktop/package.json, apps/desktop/src/App.tsx, apps/desktop/src/components/ui/drag-drop.tsx, apps/desktop/src/i18n/strings.ts, apps/desktop/src/sidebar/SessionRail.tsx, apps/desktop/src/sidebar/sidebarDnd.tsx, apps/desktop/tests/sessionRailRendered.test.tsx, docs/sdlc/changes/2026-09-04-sidebar-project-actions, docs/sdlc/changes/2026-09-03-migrate-cn-engine
approved_by: "chenli"
approved_at: 2026-09-04
---

# Plan: Sidebar Project Actions

## Files and ownership

- `apps/desktop/src/sidebar/SessionRail.tsx` — remove menu item + handle-free project drag (owner: kimi-code)
- `apps/desktop/src/App.tsx` — `requestProjectRemoval` confirmation wrapper + prop wiring
- `apps/desktop/src/components/ui/drag-drop.tsx` — sensor re-exports behind the shared boundary
- `apps/desktop/src/sidebar/sidebarDnd.tsx` — optional `sensors` prop on `SidebarSortable`
- `apps/desktop/src/i18n/strings.ts` — drop the unused `rail.dragProject` entries (en + zh)
- `apps/desktop/package.json` — promote `@dnd-kit/dom` 0.5.0 to a direct dependency
- `docs/sdlc/changes/2026-09-04-sidebar-project-actions/` — this change bundle

## Order of work

1. Add `onRemoveProject` prop and destructive menu item in `SessionRail`; wire
   `requestProjectRemoval` in `App.tsx`.
2. Re-export sensor primitives from `drag-drop.tsx`; add `sensors` to `SidebarSortable`.
3. Define `projectRowSensors`, remove the grip button, and make the header row the drag handle.
4. Remove the unused `rail.dragProject` strings; add the `@dnd-kit/dom` dependency.
5. Verify (typecheck, lint, tests, repository Gates) and record `verification.md`.

## Test-first proof

- New focused test in `sessionRailRendered.test.tsx`: the project menu shows "Remove from list"
  for a registered project, invokes `onRemoveProject` with its path, and hides the item for a
  project entry synthesized from sessions.
- Existing suites must keep passing without expectation changes:
  `sessionRailRendered.test.tsx` (row layout, clipboard, dnd keyboard guidance on
  `data-project-drag-handle`), `windowChromeContract.test.ts`, `desktopPerformanceContract.test.ts`.

## Visual or integration proof

`tsc --noEmit` + eslint on changed files; the rendered-rail tests mount `SessionRail` and assert
the drag-handle fixture still exposes dnd-kit keyboard guidance.

## Risks and mitigations

- Row drag swallowing clicks — mitigated by distance-gated pointer activation (4px mouse,
  250ms touch hold), covered by code review against dnd-kit's `PointerSensor` defaults.
- Removing an unregistered synthesized project — mitigated by only showing the item for
  registry projects.

## Rollback

Revert the branch; no data or persisted-state changes are involved.

## Deviations

- Scope grew by `apps/desktop/tests/sessionRailRendered.test.tsx` (new focused menu test) and
  `docs/sdlc/changes/2026-09-03-migrate-cn-engine/` — the legacy schema-2 `change.md` there failed
  `bun script/verify/sdlc.ts` and `bun script/verify/docs.ts` on `main` already, so it was
  migrated verbatim into schema-3 stage files to unblock the repository Gates for this PR.

## Decision

The user's direct implementation requests on 2026-09-04 accept this Plan, with user `chenli` as
named approver.
