---
id: 2026-09-15-desktop-pet-projects-composer
schema: 5
stage: spec
status: accepted
owner: chenli
created: 2026-09-15
based_on: intent.md
---

# Spec: Desktop pet, empty-project add, composer tone

## Design

**Pet sizing.** `.codetwo-pet-mascot` is a shared `Button size="icon"` (32px box) wrapping a sprite
up to 136px. `pet.css` now sizes the button to its content (`width/height: fit-content`) so the
window layout reserves the whole sprite and the lower frames are no longer clipped at the window
edge.

**Pet dragging.** The mascot button carries `electrobun-webkit-app-region-drag`, so grabbing the pet
moves the window; `main.tsx` `protectInteractiveNode` no longer stamps `…-no-drag` onto elements
that explicitly opt into dragging. The plain click still starts the wave because Electrobun
dispatches `startWindowMove` over RPC rather than consuming the DOM events. The existing top handle
remains.

**Empty projects.** `SessionRail` gains `onAddProject`; the zero-project empty state renders
`rail.projectsEmpty` plus an `Add a project…` button, and the "All projects" header gains an add
icon button. `App.tsx` wires both to the existing `addProjectFolder`.

**Composer tone.** The Composer keeps its white/neutral surface (`bg-card` compact, `bg-surface`
document mode) with no accent tint. The compact card's focus treatment replaces the former 2px
neutral outline with the shared raised elevation (`focus-within:shadow-raised` plus the existing
`transition-shadow`), so focusing the input floats the card on a soft shadow instead of drawing a
black border. An accent-tinted draft was implemented and then reverted.

Boundaries: no new color tokens, no accent on the Composer, no change to selection semantics, no
Core/host changes.

## Acceptance criteria

- [x] AC-1: With the pet at `large`, the mascot and stage measure the full sprite and stay inside the
      window; the pet is no longer clipped.
- [x] AC-2: The pet mascot is a drag region and is not marked `…-no-drag`, so it can be dragged.
- [x] AC-3: With zero Projects, the rail shows "No projects yet…" and an "Add a project…" control
      that invokes `onAddProject`; the "All projects" header also offers add.
- [x] AC-4: The Composer keeps its white/neutral surface with no accent tint; focusing the compact
      card raises the floating elevation shadow instead of drawing a border.
- [x] AC-5: `bun test` on the affected suites, `tsc --noEmit`, `lint:styles` and code lint pass.
- [x] AC-6: The CI "Desktop tests" step passes: `pluginBridgeContract` and `t3RemoteContract` read the
      merged `crates/core/src/plugins/app/plugins/...` paths instead of the removed `crates/plugins/...`.
