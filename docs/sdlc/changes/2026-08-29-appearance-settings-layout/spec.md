---
id: "2026-08-29-appearance-settings-layout"
stage: spec
schema: 3
status: accepted
owner: codex
created: 2026-08-29
based_on: intent.md
risk: low
approved_by: "#decision-and-gates"
approved_at: "2026-08-29"
---

# Spec: Refine the Appearance settings layout

## Requirements

Keep the existing 768px settings content column. Use the repository's 32px page-section token
between major sections and 12px surface-inset token between each heading and its content. Preserve
three scheme and theme columns and two palette columns at standard width; at a 608px content
container, themes become two columns and palettes one. Scheme and theme choice tiles use tonal
surfaces without elevation; their selected state keeps the semantic accent ring. Palette and
setting rows become coherent grouped surfaces with internal separators and no row-by-row shadow.
Input fields retain the shared input elevation.

## User experience

Not separately recorded in legacy change.md.

## Technical design

See Requirements and legacy Git history.

## Security and privacy

See migrated Decision and gates.

## Alternatives and non-goals

Not separately recorded in legacy change.md.

## Areas of concern

Intent and visual acceptance come directly from the user's 2026-08-29 screenshot feedback. No
permission to create a PR, merge, publish, or release is implied.

## Acceptance criteria

- [x] AC-1: Major Appearance sections have 32px gaps and section headings have 12px content gaps.
- [x] AC-2: Scheme previews, theme choices, preview chrome, and swatches no longer use surface elevation.
- [x] AC-3: Theme editor, Typography, and Surfaces read as grouped modules rather than loose cards.
- [x] AC-4: Standard and compact grids stay aligned without clipping or awkward action wrapping.
- [x] AC-5: Scheme selection, theme selection, create/import/export, palette inputs, selects, and sliders
      retain their existing accessible behavior.
- [x] AC-6: Dark, light, focused tests, design, SDLC, diff, screenshot, and console checks pass.

## Decision

Intent and visual acceptance come directly from the user's 2026-08-29 screenshot feedback. No
permission to create a PR, merge, publish, or release is implied.
