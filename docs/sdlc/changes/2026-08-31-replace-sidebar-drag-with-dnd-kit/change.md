---
id: change-2026-08-31-replace-sidebar-drag-with-dnd-kit
kind: change
schema: 2
status: verified
risk: medium
owner: codex
approvers: [user]
approved_at: 2026-08-31
created: 2026-08-31
updated: 2026-08-31
source: direct user request with screenshot showing failed Project sorting and folder placement
inputs: current desktop SessionRail drag behavior and physical pointer-drag reproduction
outputs: library-backed sidebar sorting and Project-to-Section placement
scope: apps/desktop/package.json, apps/desktop/bun.lock, apps/desktop/src/sidebar/SessionRail.tsx, apps/desktop/src/sidebar/sidebarDnd.tsx, apps/desktop/tests/sessionRailRendered.test.tsx, docs/sdlc/changes/2026-08-31-replace-sidebar-drag-with-dnd-kit
next_trigger: PR review; merge and release remain pending
verification_mode: owner
verified_by: codex
verified_at: 2026-08-31
---

# Replace sidebar drag handling with dnd-kit

## Intent

The user reported that physical pointer dragging cannot reorder sidebar items or place a Project in
a user Section, and explicitly requested a mature library instead of another custom implementation.
The reproduced pointer path emitted `pointerdown` but never emitted the native HTML5 `dragstart`,
so the existing `dataTransfer` handlers did not reach the domain move operations. This change
replaces only the sidebar interaction layer; existing Section, Project, Task ordering and
persistence APIs remain authoritative. The follow-up `pr` authorizes PR creation for this verified
scope only; a broader sidebar redesign, merge, release, or deployment remains unauthorized.

## Spec

Use `@dnd-kit/react` to provide pointer and keyboard drag input for Section, Project, and Task rows.
Projects can reorder within a root or Section list, move into a Section including an empty Section,
and move back to the root list. Existing Task and Section moves continue to call the current domain
operations. The implementation must not depend on native HTML5 `draggable`, `dragstart`, or
`dataTransfer` handlers.

### Acceptance criteria

- [x] AC-1: A physical pointer drag reorders Projects in the root list and persists the new order.
- [x] AC-2: A physical pointer drag moves a Project into a user Section and back to the root list,
      including a Section without existing Projects.
- [x] AC-3: Section and Task drag targets continue to map to the existing move operations, with
      keyboard drag support supplied by the library.
- [x] AC-4: Focused rendered tests, type checks, renderer build, lifecycle checks, and an isolated
      real rendered-window inspection pass.

## Decision and gates

The direct user request accepts this medium-risk Intent and the dependency choice. Human review
remains required before merge. No release or production action is authorized.

## Plan

1. Add the maintained `@dnd-kit/react` package and a small typed adapter for sidebar items and
   drop locations.
2. Replace native drag handlers with `DragDropProvider`, sortable rows, and explicit empty-list
   drop zones while retaining the existing state mutation callbacks.
3. Update focused rendered coverage and run type, unit, build, lifecycle, and physical pointer-drag
   verification in an isolated renderer.

Rollback removes the dependency and adapter and restores the previous sidebar drag interaction.

## Build

Added the pinned `@dnd-kit/react` dependency and a typed sidebar adapter for sortable rows and
explicit drop zones. `SessionRail` now wraps Section, Project, and Task rows in the library's
provider and preserves the existing domain operations for persisted moves. Native HTML5
`draggable`, `dragstart`, `dataTransfer`, and `drop` handling was removed.

Project moves decode the library's final sortable group and index so a same-list sort, a
cross-Section move, and a move back to root all resolve against the actual destination rather than
the optimistic source row. Empty Section and empty root drop zones have distinct IDs and explicit
collision priority, so another item kind cannot overwrite the registered target.

## Verification

Verdict: verified.

### Acceptance evidence

- AC-1: PASS — `Browser physical pointer drag` in the isolated rendered desktop shell changed the root
  Project order from `open-mole, codeTwo, MacOS` to `open-mole, MacOS, codeTwo`; a hard reload kept
  the persisted renderer state.
- AC-2: PASS — physical pointer dragging moved `codeTwo` into the empty `Work` Section, and a
  separate pointer drag moved `open-mole` from `Work` back to the root Project list.
- AC-3: PASS — `bun test tests/sessionRailRendered.test.tsx tests/sidebarProjects.test.ts
  tests/sidebarSections.test.ts` verifies the rendered DOM exposes dnd-kit's draggable semantics
  and keyboard instructions
  while containing no native sidebar `[draggable=true]` elements. Section, Project, and Task rows
  retain their existing typed move callbacks; the Project and Section domain suites pass.
- AC-4: PASS — focused sidebar suites passed 31 tests and 262 expectations; `bunx tsc --noEmit`
  passed; the full desktop suite passed 795 tests and 3,787 expectations; and
  `bun run build:renderer` completed lint, TypeScript, and the Vite production build. The isolated
  rendered pass covered same-list sorting, placement into an empty Section, return to root, and
  the final visual state without starting a second Core process.

The initial native-HTML5 baseline emitted `pointerdown` but not `dragstart`. During replacement,
the first library pass exposed two integration defects: optimistic same-list sorting reported the
source row as the final target, and Project/Task empty drop zones shared an ID. The final adapter
uses sortable destination metadata and kind-qualified drop-zone IDs; both failure paths were
retested after correction.

Residual risk: the isolated renderer verified library-provided keyboard semantics and instructions,
but the complete keyboard reorder gesture was not manually exercised. The user's live Core-backed
profile was deliberately not opened because another process owns it; the unchanged persistence
operations are covered by domain tests, and renderer persistence was checked across reload.

## Review and release

Approval: PR creation authorized by the user's follow-up `pr`; merge pending human review.
Release target: none.
Release identity: not applicable until released.
Smoke evidence: not applicable until released.
Rollback: revert this change bundle to restore the prior drag interaction.
No release: PR creation is authorized; merge, deployment, and release remain unauthorized.

Preparing this section does not authorize merge, deployment, release, or production mutation.

## Feedback

The screenshot and request are the direct defect feedback for this change. No post-change feedback
exists yet.
