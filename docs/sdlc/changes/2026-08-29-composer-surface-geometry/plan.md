---
id: "2026-08-29-composer-surface-geometry"
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

# Plan: Keep the composer surface aligned with its editor

## Files and ownership

apps/desktop, docs/design/system.md

## Order of work

Remove the separately observed liquid silhouette from the main composer, restore the existing
card-owned semantic background, shadow, and focus treatment, and update the geometry contract. Keep liquid motion
on the isolated circular actions. Validate with the narrowest relevant automated checks and a
real rendered interaction loop. Rollback is the inverse source change.

## Test-first proof

See legacy Verification section.

## Visual or integration proof

See legacy Verification section.

## Risks and mitigations

See legacy Decision and gates.

## Rollback

See legacy Review and release.

## Deviations

The compact Composer now paints its semantic card background, shadow, and focus treatment on the
same DOM card that contains BlockNote and its controls. The separate liquid SVG backdrop was
removed from the main input while the isolated circular action effects remain. The geometry
contract rejects reintroducing that second surface.

## Decision

Intent and UX acceptance are supplied directly by the user's 2026-08-29 screenshot and follow-up
message. No permission to publish, merge, or release is implied.
