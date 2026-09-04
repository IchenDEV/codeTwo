---
id: "2026-09-01-empty-heading-project-typography"
stage: plan
schema: 3
status: accepted
owner: codex
created: 2026-09-01
based_on: spec.md
risk: low
scope: apps/desktop/src/App.tsx, apps/desktop/tests/composerGeometryContract.test.ts, docs/sdlc/changes/2026-09-01-empty-heading-project-typography
approved_by: "userdirect screenshot feedback on 2026-09-01"
approved_at: "2026-09-01"
---

# Plan: Match the empty-heading project typography

## Files and ownership

apps/desktop/src/App.tsx, apps/desktop/tests/composerGeometryContract.test.ts, docs/sdlc/changes/2026-09-01-empty-heading-project-typography

## Order of work

1. Add a focused contract for inherited trigger typography and balanced spacing.
2. Apply the minimum class and whitespace correction in the existing greeting.
3. Verify computed styles, dropdown interaction, build/Gates, and the rebuilt native window.

Rollback removes the inline typography overrides and trailing whitespace only.

## Test-first proof

See legacy Verification section.

## Visual or integration proof

See legacy Verification section.

## Risks and mitigations

See legacy Decision and gates.

## Rollback

See legacy Review and release.

## Deviations

The existing inline Project Button now explicitly inherits the containing heading's font size,
weight, letter spacing, and line height. The previous `text-inherit` remains responsible only for
color inheritance. One explicit whitespace node was added after the dropdown so the Chinese
greeting has balanced separation around the Project name. The shared Button component, dropdown,
heading measure, and Project-selection behavior were not changed.

The PR #218 Windows follow-up normalizes source text only at this contract test's read boundary.
Product source and runtime behavior remain unchanged; the regression covers CRLF and legacy CR
inputs so multiline assertions have the same meaning on every checkout platform.

## Decision

The user directly approved this correction. Ponytail selected the smallest shared-seam fix: override
only the inline trigger's inherited typography and add the missing whitespace. The shared Button
component, heading size, dropdown implementation, and layout remain unchanged.

This is low risk because it changes presentation on one empty-state trigger without changing data or
execution. Merge, release, and deployment are not authorized.
