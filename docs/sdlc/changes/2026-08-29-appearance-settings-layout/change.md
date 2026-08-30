---
id: change-2026-08-29-appearance-settings-layout
kind: change
schema: 2
status: verified
risk: low
owner: codex
approvers: "#decision-and-gates"
approved_at: 2026-08-29
created: 2026-08-29
updated: 2026-08-31
source: "#intent"
inputs: "#spec"
outputs: "#build"
scope: apps/desktop, docs/design/system.md
next_trigger: human product review
verification_mode: owner
verified_by: codex
verified_at: 2026-08-29
---

# Refine the Appearance settings layout

## Intent

The user reported from the rendered Appearance page that its layout, spacing, overall visual
language, and especially its shadows do not match the rest of CodeTwo. The page currently places
five major sections with no vertical gap and gives scheme options, theme choices, and setting rows
the same elevated-card treatment. The desired result is a calmer macOS settings hierarchy with
clear section rhythm, aligned actions, flat choice tiles, and elevation reserved for real controls.

## Spec

Keep the existing 768px settings content column. Use the repository's 32px page-section token
between major sections and 12px surface-inset token between each heading and its content. Preserve
three scheme and theme columns and two palette columns at standard width; at a 608px content
container, themes become two columns and palettes one. Scheme and theme choice tiles use tonal
surfaces without elevation; their selected state keeps the semantic accent ring. Palette and
setting rows become coherent grouped surfaces with internal separators and no row-by-row shadow.
Input fields retain the shared input elevation.

### Acceptance criteria

- [x] AC-1: Major Appearance sections have 32px gaps and section headings have 12px content gaps.
- [x] AC-2: Scheme previews, theme choices, preview chrome, and swatches no longer use surface elevation.
- [x] AC-3: Theme editor, Typography, and Surfaces read as grouped modules rather than loose cards.
- [x] AC-4: Standard and compact grids stay aligned without clipping or awkward action wrapping.
- [x] AC-5: Scheme selection, theme selection, create/import/export, palette inputs, selects, and sliders
      retain their existing accessible behavior.
- [x] AC-6: Dark, light, focused tests, design, SDLC, diff, screenshot, and console checks pass.

## Decision and gates

Intent and visual acceptance come directly from the user's 2026-08-29 screenshot feedback. No
permission to create a PR, merge, publish, or release is implied.

## Plan

Update the existing desktop layout specification, style the current Appearance component rather
than introducing a parallel page, group related setting rows, remove decorative elevation, add a
narrow layout contract, then verify the running renderer at standard and constrained widths in both
appearances. Rollback is the inverse source change.

## Build

The existing Appearance page now uses one explicit section rhythm, flat tonal choice tiles, and
three grouped settings modules. The repository layout contract owns the standard and compact grid
counts, including a narrow horizontal scheme treatment that avoids oversized previews. Existing
selection and editing controls were preserved.

## Verification

- `bun test tests/appearanceSettings.test.tsx tests/settingsLayoutContract.test.ts` — 23 passed,
  0 failed. The existing Base UI test harness still emits non-failing `act(...)` warnings.
- `bun run build:renderer` — passed design-source checks, TypeScript, the Vite production build,
  and the generated-design check. The existing bundle-size advisory remains non-failing.
- In-app Browser at `http://localhost:1420/` — verified the page at 1280px, 840px, and 780px
  viewport widths in dark and light appearances. Observed 32px section gaps, 3/3/2 standard grids,
  3/2/1 compact grids, 1/1/1 auxiliary grids, zero horizontal overflow, and no console errors.
- Scheme changes (`Light` then `System`) and theme changes (`Ocean` then `C2`) updated checked and
  pressed state and were restored after verification.
- `bun script/verify/sdlc.ts` — passed; task-scoped `git diff --check` — passed.

Verdict: verified.

### Acceptance evidence

- AC-1: PASS — the recorded `http://localhost:1420/` inspection measured 32px section and 12px heading-to-content gaps.
- AC-2: PASS — the recorded renderer inspection computed the applicable choice and preview shadows as removed. Evidence: `Verification record above`.
- AC-3: PASS — the recorded dark/light screenshots show Theme editor, Typography, and Surfaces as grouped modules. Evidence: `Verification record above`.
- AC-4: PASS — the `http://localhost:1420/` viewport matrix verified 3/3/2 standard and 3/2/1 compact grids with zero overflow.
- AC-5: PASS — `bun test tests/appearanceSettings.test.tsx tests/settingsLayoutContract.test.ts` preserved the existing controls and accessibility behavior.
- AC-6: PASS — the focused tests, `bun run build:renderer`, `bun script/verify/sdlc.ts`, console inspection, and `git diff --check` passed.

Residual risk: existing Base UI `act(...)` warnings and the bundle-size advisory remain; no product
release was reviewed or authorized.

## Review and release

No PR, merge, or release requested. Human product review remains the next lifecycle trigger.

## Feedback

No additional layout, overflow, or interaction defects were observed in the rendered review.
