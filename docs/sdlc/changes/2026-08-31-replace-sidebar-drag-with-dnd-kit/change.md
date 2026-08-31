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
updated: 2026-09-01
source: direct user request with screenshot showing failed Project sorting and folder placement
inputs: current desktop SessionRail drag behavior and physical pointer-drag reproduction
outputs: library-backed sidebar sorting and Project-to-Section placement
scope: apps/desktop/package.json, apps/desktop/bun.lock, apps/desktop/src/components/ui/drag-drop.tsx, apps/desktop/src/sidebar/SessionRail.tsx, apps/desktop/src/sidebar/sidebarDnd.tsx, apps/desktop/tests/sessionRailRendered.test.tsx, apps/desktop/tests/sidebarDnd.test.ts, docs/sdlc/changes/2026-08-31-replace-sidebar-drag-with-dnd-kit
next_trigger: human review and merge decision on PR #208
verification_mode: owner
verified_by: codex
verified_at: 2026-09-01
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
      keyboard drag support supplied by the library. Nested Task rows outrank their nonempty
      container, and dropping outside a compatible target cancels instead of reusing stale hover.
- [x] AC-4: Focused rendered tests, type checks, renderer build, lifecycle checks, and an isolated
      real rendered-window inspection pass.

## Decision and gates

The direct user request accepts this medium-risk Intent and the dependency choice. Human review
remains required before merge. No release or production action is authorized.

## Plan

1. Add the maintained `@dnd-kit/react` package behind a shared UI primitive and a small typed
   adapter for sidebar items and drop locations.
2. Replace native drag handlers with `DragDropProvider`, sortable rows, and explicit empty-list
   drop zones while retaining the existing state mutation callbacks.
3. Update focused rendered coverage and run type, unit, build, lifecycle, and physical pointer-drag
   verification in an isolated renderer.

Rollback removes the dependency and adapter and restores the previous sidebar drag interaction.

## Build

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

## Verification

Verdict: verified

Review-feedback corrections are included in this verdict.

### Acceptance evidence

- AC-1: PASS — `Browser physical pointer drag` used a paced Chromium pointer path in the isolated rendered desktop shell
  changed the root Project order from `codeTwo, open-mole, MacOS` to
  `open-mole, MacOS, codeTwo`; dnd-kit finalized the source at index 2 instead of retaining its
  stale hover index. See the [dark baseline](evidence/pr-review-dark.png) and
  [post-drag state](evidence/drag-result-dark.png).
- AC-2: PASS — physical pointer dragging moved `codeTwo` into the empty `Work` Section, and a
  separate drag moved `open-mole` from `Work` back to the root Project list. After the final
  sortable-row registration correction, an actual keyboard gesture (`Enter`, `ArrowUp`, `Enter`)
  also moved `codeTwo` into the empty `Work` Section.
- AC-3: PASS — `bun test tests/sessionRailRendered.test.tsx` verifies that Section, Project, and
  Task rows expose dedicated dnd-kit keyboard handles and no native `[draggable=true]` elements.
  `bun test tests/sidebarDnd.test.ts` additionally verifies that nonempty Task containers stay
  below Task-row priority and that null or incompatible drag targets clear the last destination.
  The broader destination suites verify finalized index mapping plus Section, Project, and Task
  decoding, including encoded paths. Existing typed domain move suites pass.
- AC-4: PASS — the final `bun test` passed 809 tests and 3,841 expectations; `bunx tsc --noEmit`
  and `bun run build` also passed. The isolated rendered pass covered same-list
  pointer sorting, empty-Section keyboard placement, the [narrow shell](evidence/pr-review-narrow-dark.png),
  and the final visual state without starting a second Core process.

The initial native-HTML5 baseline emitted `pointerdown` but not `dragstart`. During replacement,
the first library pass exposed two integration defects: optimistic same-list sorting reported the
source row as the final target, and Project/Task empty drop zones shared an ID. The final adapter
uses sortable destination metadata and kind-qualified drop-zone IDs; both failure paths were
retested after correction. The later review regressions were first reproduced by focused failing
tests, then passed after container-priority and stale-target normalization were corrected.

Residual risk: the user's live Core-backed profile was deliberately not opened because another
process owns it. Pointer and keyboard gestures were exercised in the isolated Chromium renderer;
the unchanged Core persistence operations are covered by domain tests rather than a second live
Core instance.

## Review and release

Approval: [PR #208](https://github.com/IchenDEV/codeTwo/pull/208) created by user authorization;
merge pending human review.
Release target: none.
Release identity: not applicable until released.
Smoke evidence: not applicable until released.
Rollback: revert this change bundle to restore the prior drag interaction.
No release: PR creation is authorized; merge, deployment, and release remain unauthorized.

Preparing this section does not authorize merge, deployment, release, or production mutation.

## Feedback

The screenshot and request are the direct defect feedback for this change. PR review later found
that nonempty Project/Section container zones could outrank nested Task rows and that leaving all
valid targets retained the last hover destination. The user explicitly requested both corrections.
