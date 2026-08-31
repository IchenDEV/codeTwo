---
id: change-2026-08-31-animate-pane-splits
kind: change
schema: 2
status: verified
risk: low
owner: codex
approvers: [user]
approved_at: 2026-08-31
created: 2026-08-31
updated: 2026-09-01
source: direct user request with screenshot of the split-right and split-down menu actions
inputs: PaneTiles new-leaf rendering and the repository semantic motion contract
outputs: direction-aware entrance animation for newly split panes
scope: apps/desktop/src/session/PaneTiles.tsx, apps/desktop/src/styles.css, apps/desktop/tests/paneTiles.test.tsx, docs/sdlc/changes/2026-08-31-animate-pane-splits
next_trigger: human review and merge decision on PR #208
verification_mode: owner
verified_by: codex
verified_at: 2026-09-01
---

# Animate new pane splits

## Intent

The user highlighted the Split right and Split down actions and requested animation. The menu
already uses the shared layer entrance and hover feedback, so the missing feedback is the visible
result: a newly created pane currently appears instantly. Add restrained direction-aware entrance
motion to the new pane without changing menu geometry, pane layout, focus, divider behavior, or
editor lifetime.

## Spec

A pane created to the right enters from the right; a pane created below enters from below. The same
mapping supports left/top split edges for existing non-menu entry points. Use the repository's
220 ms semantic motion duration and standard entrance curve, with a short 12 px translation and
opacity only. The initial single pane must not animate, stable panes must not replay animation on
rerender, and the global Reduced Motion contract must collapse the effect.

### Acceptance criteria

- [x] AC-1: Choosing Split right or Split down gives the newly created pane a matching directional
      entrance while existing panes stay stable.
- [x] AC-2: The initial pane does not animate, and a pane does not replay its entrance during normal
      rerenders or divider resizing.
- [x] AC-3: The animation uses semantic timing/easing, supports every split edge, and collapses
      under Reduced Motion.
- [x] AC-4: Focused/full tests, renderer build, rendered Browser inspection, and repository
      lifecycle checks pass.

## Decision and gates

The direct user request approves this low-risk visual feedback. The follow-up `pr` authorizes PR
creation only. Human review remains required before merge; release, deployment, and external
mutation remain unauthorized.

## Plan

1. Identify newly mounted pane IDs and their parent split edge without adding React state.
2. Apply one stable direction class to the new pane and define a semantic CSS entrance.
3. Lock initial/new/rerender behavior in PaneTiles tests and verify both split commands in an
   isolated rendered window, including Reduced Motion.

Rollback removes the pane entrance bookkeeping, classes, and keyframes.

## Build

`PaneTiles` now remembers pane IDs already present at its initial render and records a stable parent
split edge only when a new leaf appears. The initial pane therefore has no entrance class, while a
new pane receives `left`, `right`, `top`, or `bottom` without adding React state or a second render.
The class remains stable on the same keyed pane node, so ordinary state updates and divider moves
cannot replay the animation.

The CSS entrance uses opacity plus a 12 px directional `translate3d`, the existing 220 ms semantic
motion duration, and the standard entrance curve. The repository-wide Reduced Motion override
continues to collapse it.

## Verification

Verdict: verified

### Acceptance evidence

- AC-1: PASS — `Browser Split right / Split down interaction` created `pane-2` with
  `data-pane-entrance="right"` and `pane-3` with `data-pane-entrance="bottom"`; both rendered
  `animation-name: pane-tile-enter`. The [light final split state](../2026-08-31-replace-sidebar-drag-with-dnd-kit/evidence/split-animation-end-light.png)
  records the stable end geometry; live interaction and computed styles prove the motion itself.
- AC-2: PASS — `bun test tests/paneTiles.test.tsx tests/paneChrome.test.tsx` verifies that the
  initial pane has no entrance marker, existing pane DOM identity is preserved across rerender,
  and only newly added leaves receive an entrance class.
- AC-3: PASS — `Browser computed-style inspection` measured `0.22s` and
  `cubic-bezier(0.16, 1, 0.3, 1)` for both menu actions. The focused test covers left, right, top,
  and bottom. Setting Appearance → Reduce motion → On reduced a fresh split to `1e-05s`.
- AC-4: PASS — the focused pane suites passed nine tests and 49 expectations; `bunx tsc --noEmit`
  and targeted ESLint passed; final full `bun test` passed 806 tests and 3,841 expectations; and
  `bun run build:renderer` completed lint, TypeScript, and the Vite production build. Browser page
  identity, meaningful content, menu interaction, screenshot inspection, and console checks passed
  with no relevant warnings or errors.

Residual risk: a static screenshot proves the final tiled geometry while computed styles and live
interaction prove the short entrance itself; the renderer-only QA did not restart the user's
existing Core-backed desktop process. No Core protocol or persistence path changed.

## Review and release

Approval: [PR #208](https://github.com/IchenDEV/codeTwo/pull/208) created by user authorization;
merge pending human review.
Release target: none.
Release identity: not applicable until released.
Smoke evidence: not applicable until released.
Rollback: revert this change bundle.
No release: PR creation is authorized; merge, deployment, and release remain unauthorized.

## Feedback

The screenshot is the accepted scope indicator; no post-change feedback exists yet.
