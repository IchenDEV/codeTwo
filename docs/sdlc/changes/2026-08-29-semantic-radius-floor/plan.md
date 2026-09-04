---
id: "2026-08-29-semantic-radius-floor"
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

# Plan: Raise the semantic radius floor

## Files and ownership

apps/desktop, docs/design/system.md

## Order of work

Update the semantic token mappings, the design-system preview labels, and the design law. Validate
the exact computed radii from the real callers and keep the change at the shared-token boundary.
Rollback is the inverse token mapping.

## Test-first proof

See legacy Verification section.

## Visual or integration proof

See legacy Verification section.

## Risks and mitigations

See legacy Decision and gates.

## Rollback

See legacy Review and release.

## Deviations

The semantic token source now maps micro and control to 12px and module and modal to 16px. A
compatibility bridge gives the remaining legacy `rounded`, `rounded-sm`, `rounded-md`, and
`rounded-lg` utilities the same 12px floor without changing joined-edge `rounded-*-none` behavior.
The design preview and design law show the new values.

## Decision

Intent and exact geometry are supplied directly by the user's 2026-08-29 browser annotations. No
permission to publish, merge, or release is implied.
