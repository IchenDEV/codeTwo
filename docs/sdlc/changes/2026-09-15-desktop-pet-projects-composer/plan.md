---
id: 2026-09-15-desktop-pet-projects-composer
schema: 5
stage: plan
status: accepted
owner: chenli
created: 2026-09-15
based_on: spec.md
scope: apps/desktop/src/pet/pet.css, apps/desktop/src/pet/CodeTwoPet.tsx, apps/desktop/src/main.tsx, apps/desktop/src/sidebar/SessionRail.tsx, apps/desktop/src/session/Composer.tsx, apps/desktop/src/App.tsx, apps/desktop/tests/sessionRailRendered.test.tsx, apps/desktop/tests/composerGeometryContract.test.ts, apps/desktop/tests/pluginBridgeContract.test.ts, apps/desktop/tests/t3RemoteContract.test.ts, docs/sdlc/changes/2026-09-15-desktop-pet-projects-composer
---

# Plan: Desktop pet, empty-project add, composer tone

## Plan

1. `pet.css`: size `.codetwo-pet-mascot` to its sprite content.
2. `CodeTwoPet.tsx`: add `electrobun-webkit-app-region-drag` to the mascot.
3. `main.tsx`: skip `…-no-drag` for explicitly draggable elements.
4. `SessionRail.tsx`: add `onAddProject`, the empty-state prompt/button, and the header add button.
5. `App.tsx`: pass `onAddProject={() => void addProjectFolder()}`.
6. `Composer.tsx` compact card: keep the neutral `bg-card`, and replace `focus-within:focus-ring-inset`
   with `focus-within:shadow-raised` so focus floats the card instead of drawing a border. An
   accent-tinted draft (`bg-card`/`bg-surface` → `bg-accent`) was implemented, rendered, then
   reverted after the user asked to keep the input white.
7. Add a rail empty-project regression test and update the composer geometry contract string.
8. Fix the CI failure reported in run 34988233344: the `pluginBridgeContract` and `t3RemoteContract`
   suites still read the removed `crates/plugins/...` paths, so point them at the merged
   `crates/core/src/plugins/app/plugins/...` locations.

Checks by risk (low, renderer-only): `bun test` on the affected suites, `bunx tsc --noEmit`,
`bun run lint:styles`, scoped `ultracite check`, plus rendered measurement in the Vite preview
(`?pet-preview=1`, workspace root) because the pet clipping is a visual outcome that source
assertions alone cannot prove. `bun script/verify/sdlc.ts --worktree` and
`bun script/verify/docs.ts` gate the records.

Temporary resources: one Vite renderer dev server on port 1420 and one browser preview tab, both
removed at handoff. No native app build was launched, so no Core owner was touched.

Rollback: revert this branch; behavior is confined to renderer CSS/JSX and tests.

## Verification notes

Native drag cannot be exercised in the browser preview: the class contract (`drag` present,
`no-drag` absent) was measured, but the OS-level window move was not. This residual is recorded in
verification.md.
