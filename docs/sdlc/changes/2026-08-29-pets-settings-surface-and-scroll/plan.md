---
id: "2026-08-29-pets-settings-surface-and-scroll"
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

# Plan: Align Pets settings surfaces and scrolling

## Files and ownership

apps/desktop, docs/design/system.md

## Order of work

Reuse the existing business primitives, remove only decorative elevation, move page-end spacing to
the settings page's CSS contract, add focused assertions, and verify the running renderer at the
bottom scroll boundary. Rollback is the inverse source change.

## Test-first proof

See legacy Verification section.

## Visual or integration proof

See legacy Verification section.

## Risks and mitigations

See legacy Decision and gates.

## Rollback

See legacy Review and release.

## Deviations

Pet catalog entries now compose the shared `SettingRow`, `Button`, and `Spinner` primitives inside a
semantic list. The catalog and Session behavior each use one flat grouped surface with internal
hairlines. The settings page owns its semantic page-end inset at both regular and compact widths,
so responsive overrides cannot reset the scroll clearance to zero.

## Decision

Intent and acceptance come directly from the user's 2026-08-29 browser annotation. No permission to
create a PR, merge, publish, or release is implied.
