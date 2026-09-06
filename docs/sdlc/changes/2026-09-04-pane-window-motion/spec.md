---
id: "2026-09-04-pane-window-motion"
stage: spec
schema: 3
status: accepted
owner: kimi
created: "2026-09-04"
based_on: intent.md
risk: "low"
approved_by: "chenli"
approved_at: 2026-09-04
---

# Spec: Pane Window Motion

## Requirements

- Governed pane-geometry motion role:
  - `tokens.css` gains a fifth semantic motion token, `--ds-motion-pane` (default
    `--ds-foundation-motion-280`), with `:root[data-window-motion="fast"]` mapping to the layer
    duration and `:root[data-window-motion="instant"]` mapping to 0ms.
  - Both Reduced Motion paths (`data-reduce-motion="on"` and the `prefers-reduced-motion` media
    query) also zero `--ds-motion-pane`.
  - `styles.css` adds `.pane-geometry-motion`: `left`/`top`/`width`/`height` transition over
    `--ds-motion-pane` with the standard entrance curve, plus an `outline-color` feedback-speed
    transition; `body.resizing-h`/`body.resizing-v` (stamped by `useResizeHandle` for pointer
    drags only) suspends the transition so drags stay 1:1.
  - `PaneTiles` applies the class to every pane frame and divider; `PaneDivider` carries it in its
    default class.
- Window motion preference:
  - The appearance store gains `windowMotion: "instant" | "fast" | "smooth"`, default `"smooth"`,
    normalized from persisted state and applied as `root.dataset.windowMotion`.
  - The Appearance settings page renders a Window motion `ViewSwitcher` row directly under Reduce
    motion, with English and Chinese strings.
- Contract amendment: `docs/design/system.md` documents the pane role as the one transition allowed
  to move layout, governed by the preference, with drags excluded.

## User experience

- Choosing Split right / Split down or closing a pane: the remaining panes ease to their new
  rectangles over ~280ms (Smooth) while the new pane keeps its directional entrance.
- Dragging a divider: geometry tracks the pointer exactly, as before.
- Keyboard-resizing a focused divider: the boundary glides one step.
- Appearance → Window motion: three choices like the reference video; Instant restores the old
  snap behavior.

## Technical design

- No animation library and no JavaScript animation loop: pane frames are absolutely positioned from
  normalized percentages, so a CSS transition on the four geometry properties interpolates every
  relayout with zero render-loop code and preserves keyed pane identity.
- The drag suspension reuses the body classes `useResizeHandle` already adds for pointer captures;
  the keyboard path never stamps them, so keyboard steps animate.
- The preference flows through the existing appearance pipeline (normalize → persist →
  `applyAppearanceSettings` → root dataset), exactly like `reduceMotion`.

## Security and privacy

No new permissions, network calls, or persisted-data shape beyond one validated enum field in the
existing localStorage appearance document.

## Alternatives and non-goals

- A spring/physics library was rejected: the design contract bans springs, and the standard
  ease-out cubic-bezier already reads as the reference app's motion.
- FLIP transform-based animation was rejected: percentage-rect transitions need no measurement
  code, and scaling terminal/editor content would distort text.
- Animating rail/dock sweeps differently is not part of this change.

## Areas of concern

- Geometry transitions animate layout properties; pane counts are small (a handful of absolutely
  positioned siblings), so per-frame layout cost is bounded, but it is not compositor-only.
- xterm refit during a glide is handled by the existing resize observers; continuous reflow during
  280ms has not been profiled against a live Core-backed terminal.

## Acceptance criteria

- [ ] AC-1: Splitting or closing a pane makes the remaining panes glide to their new rectangles
  instead of snapping, using the semantic pane-motion duration and standard curve.
- [ ] AC-2: Appearance → Window motion offers Instant, Fast, and Smooth (default Smooth), persists
  through the appearance store, drives the geometry transition duration, and collapses under
  Reduced Motion.
- [ ] AC-3: Divider pointer drags track the pointer 1:1 with no transition, while keyboard resize
  steps animate.
- [ ] AC-4: Focused tests, the renderer build, rendered-browser inspection in light, dark, and
  narrow states, and the repository lifecycle checks pass.

## Decision

The user's direct implementation request on 2026-09-04 accepts this Spec, with user `chenli` as
named approver.
