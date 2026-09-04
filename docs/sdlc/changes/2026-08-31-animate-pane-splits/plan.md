---
id: "2026-08-31-animate-pane-splits"
stage: plan
schema: 3
status: accepted
owner: codex
created: 2026-08-31
based_on: spec.md
risk: low
scope: apps/desktop/src/session/PaneTiles.tsx, apps/desktop/src/styles.css, apps/desktop/tests/paneTiles.test.tsx, docs/sdlc/changes/2026-08-31-animate-pane-splits
approved_by: "[user]"
approved_at: "2026-08-31"
---

# Plan: Animate new pane splits

## Files and ownership

apps/desktop/src/session/PaneTiles.tsx, apps/desktop/src/styles.css, apps/desktop/tests/paneTiles.test.tsx, docs/sdlc/changes/2026-08-31-animate-pane-splits

## Order of work

1. Identify newly mounted pane IDs and their parent split edge without adding React state.
2. Apply one stable direction class to the new pane and define a semantic CSS entrance.
3. Lock initial/new/rerender behavior in PaneTiles tests and verify both split commands in an
   isolated rendered window, including Reduced Motion.

Rollback removes the pane entrance bookkeeping, classes, and keyframes.

## Test-first proof

See legacy Verification section.

## Visual or integration proof

See legacy Verification section.

## Risks and mitigations

See legacy Decision and gates.

## Rollback

See legacy Review and release.

## Deviations

`PaneTiles` now remembers pane IDs already present at its initial render and records a stable parent
split edge only when a new leaf appears. The initial pane therefore has no entrance class, while a
new pane receives `left`, `right`, `top`, or `bottom` without adding React state or a second render.
The class remains stable on the same keyed pane node, so ordinary state updates and divider moves
cannot replay the animation.

The CSS entrance uses opacity plus a 12 px directional `translate3d`, the existing 220 ms semantic
motion duration, and the standard entrance curve. The repository-wide Reduced Motion override
continues to collapse it.

## Decision

The direct user request approves this low-risk visual feedback. The follow-up `pr` authorizes PR
creation only. Human review remains required before merge; release, deployment, and external
mutation remain unauthorized.
