---
id: "2026-08-29-appearance-settings-layout"
stage: plan
schema: 3
status: accepted
owner: codex
created: 2026-08-29
based_on: spec.md
risk: low
scope: apps/desktop, docs/design/system.md
approved_by: "#decision-and-gates"
approved_at: "2026-08-29"
---

# Plan: Refine the Appearance settings layout

## Files and ownership

apps/desktop, docs/design/system.md

## Order of work

Update the existing desktop layout specification, style the current Appearance component rather
than introducing a parallel page, group related setting rows, remove decorative elevation, add a
narrow layout contract, then verify the running renderer at standard and constrained widths in both
appearances. Rollback is the inverse source change.

## Test-first proof

See legacy Verification section.

## Visual or integration proof

See legacy Verification section.

## Risks and mitigations

See legacy Decision and gates.

## Rollback

See legacy Review and release.

## Deviations

The existing Appearance page now uses one explicit section rhythm, flat tonal choice tiles, and
three grouped settings modules. The repository layout contract owns the standard and compact grid
counts, including a narrow horizontal scheme treatment that avoids oversized previews. Existing
selection and editing controls were preserved.

## Decision

Intent and visual acceptance come directly from the user's 2026-08-29 screenshot feedback. No
permission to create a PR, merge, publish, or release is implied.
