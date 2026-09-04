---
id: "2026-09-04-pane-window-motion"
stage: intent
schema: 3
status: accepted
owner: kimi
created: "2026-09-04"
source: "user"
risk: "low"
approved_by: "chenli"
approved_at: 2026-09-04
---

# Intent: Pane Window Motion

## Problem

The user shared a reference video of a GPUI tiling app that "feels like Hyprland": when the tiling
layout changes, windows glide to their new positions and sizes instead of snapping, and an
Appearance panel offers a Window motion choice of Instant, Fast, and Smooth. In this desktop app,
pane splits and closes already play a directional entrance for the new pane, but every existing
pane snaps instantly to its new rectangle, which reads as a web page rather than a tiling window
manager.

## Proposed outcome

- When the split tree changes (split, close, keyboard resize step), affected panes and dividers
  glide to their new rectangles over a governed semantic duration with the standard entrance curve.
- Appearance settings expose a Window motion preference — Instant, Fast, Smooth (default Smooth) —
  that rescales that duration without introducing new timings.
- Pointer drags keep their existing 1:1 pointer tracking with no transition, and Reduced Motion
  collapses all pane motion.

## Affected users and systems

Desktop renderer only (`apps/desktop`): the tiling workspace, the appearance store, the Appearance
settings page, and the design-system motion contract. No Core, server, or protocol changes; no data
migration.

## Constraints

- The design system bans springs and one-off durations, so pane geometry motion must be a governed
  semantic role whose only timings are the existing foundation durations (0/160/280ms), and
  `docs/design/system.md` must be amended rather than violated.
- Divider pointer drags must stay 1:1 with the pointer; the transition applies only to discrete
  layout changes.
- Reduced Motion (setting and system preference) collapses the motion to zero.
- Pane DOM identity and editor/composer lifetime across relayouts are preserved (keyed panes).

## Out of scope

- Springs, bounce, or physics-based animation libraries.
- Animating session-rail or dock geometry (their existing transitions are unchanged).
- Multi-instance/profile work from AGENTS.md.

## Success signals

- Splitting or closing a pane visibly glides the remaining panes to their new rectangles.
- Appearance → Window motion switches Instant/Fast/Smooth, persists, and composes with Reduced
  Motion.
- `bunx tsc --noEmit`, ESLint/Stylelint, the focused pane and appearance suites, the full desktop
  `bun test`, and the repository Gates pass.

## Open questions

None.

## Decision

The user's direct implementation request on 2026-09-04 ("参考这个视频改进动画", with the reference
video) accepts this Intent, with user `chenli` as named approver. PR creation was separately
authorized ("pr"); merge and release Gates remain with the human reviewer.
