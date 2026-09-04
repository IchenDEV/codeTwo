---
id: "2026-08-29-pets-settings-surface-and-scroll"
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

# Spec: Align Pets settings surfaces and scrolling

## Requirements

Render every pet catalog entry through the shared `SettingRow` and shared `Button`. Keep the catalog
and Session behavior as flat grouped surfaces with internal semantic hairlines, without outer rings
or per-row surface elevation. Make the settings page itself own an 80px semantic page-end inset so
the last section clears the bottom of the scroll viewport on every tab.

## User experience

Not separately recorded in legacy change.md.

## Technical design

See Requirements and legacy Git history.

## Security and privacy

See migrated Decision and gates.

## Alternatives and non-goals

Not separately recorded in legacy change.md.

## Areas of concern

Intent and acceptance come directly from the user's 2026-08-29 browser annotation. No permission to
create a PR, merge, publish, or release is implied.

## Acceptance criteria

- [x] AC-1: Pet catalog entries use the shared setting-row anatomy and preserve list semantics.
- [x] AC-2: Catalog and Session behavior surfaces have no decorative surface elevation.
- [x] AC-3: Existing pet preview, selection, mood, visibility, activity, and size behavior remains intact.
- [x] AC-4: At the scroll limit, the last Pets section has an 80px bottom inset.
- [x] AC-5: Desktop and compact layouts remain readable in light and dark appearances.
- [x] AC-6: Focused tests, design, type, SDLC, diff, screenshot, and console checks pass.

## Decision

Intent and acceptance come directly from the user's 2026-08-29 browser annotation. No permission to
create a PR, merge, publish, or release is implied.
