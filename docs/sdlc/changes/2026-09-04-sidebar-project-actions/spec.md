---
id: "2026-09-04-sidebar-project-actions"
stage: spec
schema: 3
status: accepted
owner: kimi-code
created: "2026-09-04"
based_on: intent.md
risk: "low"
approved_by: "chenli"
approved_at: 2026-09-04
---

# Spec: Sidebar Project Actions

## Requirements

- Project removal from the rail menu:
  - `SessionRail` gains an `onRemoveProject: (path: string) => void` prop.
  - The project header dropdown renders a destructive `Trash2` item labeled with the existing
    `rail.removeProject` copy ("从列表移除（聊天记录会保留）" / "Remove from list (chats stay)"),
    separated from the Section actions above it.
  - The item renders only when the project exists in the `projects` registry prop; entries
    synthesized from live sessions hide it.
  - `App.tsx` wraps the existing `removeProjectEntry` with a native confirmation using the
    existing `settings.removeProjectConfirm` copy, and toasts `settings.projectSaveFailed` on
    failure.
- Handle-free project row dragging:
  - The hover grip button (`rail.dragProject` tooltip) is removed; the entire project header row
    becomes the drag handle (`handleRef` + `targetRef` on the header div, keeping the
    `data-project-drag-handle` marker).
  - Pointer activation requires movement (mouse: 4px distance; touch: 250ms hold with 5px
    tolerance) so the collapse toggle and "..." menu keep their click behavior. This overrides
    dnd-kit's default press-on-handle-immediately behavior for project rows only.
  - Keyboard reordering still works: the header row is the keyboard-sensor handle (Space starts,
    arrows move, Space/Enter drops), and the menu's 上移/下移 items remain.
  - Task rows and Section rows keep their existing grips and default sensors.

## User experience

- Removing a project: open the project's "..." menu → destructive remove item at the bottom →
  native confirmation dialog naming the project → project disappears from the rail; files and
  saved sessions remain.
- Reordering a project: press anywhere on the project header, drag beyond ~4px, drop on the new
  position. A plain click still collapses/expands; the "..." menu still opens.

## Technical design

- `src/components/ui/drag-drop.tsx` re-exports `PointerSensor`, `KeyboardSensor`
  (from `@dnd-kit/react`) and `PointerActivationConstraints` (from `@dnd-kit/dom`) so sensor
  configuration stays behind the shared boundary.
- `@dnd-kit/dom` becomes a direct `apps/desktop` dependency (already the resolved version of the
  transitive dependency).
- `SidebarSortable` accepts an optional `sensors` prop passed to `useSortable`.
- `SessionRail` defines a module-level `projectRowSensors` (`PointerSensor.configure` with
  distance/delay activation + default `KeyboardSensor`) and passes it to the project sortable.

## Security and privacy

No new permissions, network calls, or persisted data. Removal keeps on-disk files and sessions.

## Alternatives and non-goals

- A bare "删除" label was rejected in favor of the existing honest copy that states chats stay.
- Removing grips from task/section rows is not part of this change.
- Hiding the remove action behind Settings only (status quo) was rejected by the user request.

## Areas of concern

- dnd-kit's Accessibility plugin marks the header row focusable with draggable role description;
  the row contains nested buttons (acceptable trade-off; menu reordering remains as an
  alternative).
- Dragging that starts on the "..." button itself still reorders after 4px; plain clicks are
  unaffected.

## Acceptance criteria

- [ ] AC-1: The project dropdown shows the destructive remove item only for registered projects,
  and confirming it removes the project via the existing `removeProjectEntry` flow.
- [ ] AC-2: Project rows drag-reorder without a grip handle; collapse toggle and "..." menu
  clicks still work (distance-gated pointer activation).
- [ ] AC-3: `cd apps/desktop && bunx tsc --noEmit` and eslint on changed files pass.
- [ ] AC-4: `bun test tests/sessionRailRendered.test.tsx` (30 tests, including the dnd keyboard
  guidance fixture on `data-project-drag-handle`), `windowChromeContract`, and
  `desktopPerformanceContract` pass.

## Decision

The user's direct implementation requests on 2026-09-04 accept this Spec, with user `chenli` as
named approver.
