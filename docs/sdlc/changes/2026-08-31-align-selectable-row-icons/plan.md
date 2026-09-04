---
id: "2026-08-31-align-selectable-row-icons"
stage: plan
schema: 3
status: accepted
owner: codex
created: 2026-08-31
based_on: spec.md
risk: low
scope: apps/desktop/src/components/business/selectable-row.tsx, apps/desktop/tests/designSystemBusinessComponents.test.tsx, docs/sdlc/changes/2026-08-31-align-selectable-row-icons/change.md
approved_by: "[user via the 2026-08-31 direct icon-alignment request]"
approved_at: "2026-08-31"
---

# Plan: Align selectable-row icons with their labels

## Files and ownership

apps/desktop/src/components/business/selectable-row.tsx, apps/desktop/tests/designSystemBusinessComponents.test.tsx, docs/sdlc/changes/2026-08-31-align-selectable-row-icons/change.md

## Order of work

1. Give the indicator and leading slots line-height-sized centering boxes and tokenized child gap.
2. Extend the shared component test to lock the alignment contract.
3. Run desktop tests/build and compare Browser geometry and screenshots at desktop and narrow
   widths, then complete repository lifecycle checks.

Rollback reverts the shared alignment classes and their focused assertions.

## Test-first proof

See legacy Verification section.

## Visual or integration proof

See legacy Verification section.

## Risks and mitigations

See legacy Decision and gates.

## Rollback

See legacy Review and release.

## Deviations

Completed. The shared selection-indicator and leading slots now use a `1lh`-high alignment box,
which follows the actual first-line text height instead of aligning smaller glyphs to its top edge.
The leading slot also applies the existing `gap-inline` token between multiple children. The
component test locks both layout classes without adding runtime state or rendering work.

## Decision

The user directly accepted this low-risk visual correction on 2026-08-31. No security,
data-migration, release, or production Gate applies. Human review remains required before merge,
and no external delivery action is authorized.
