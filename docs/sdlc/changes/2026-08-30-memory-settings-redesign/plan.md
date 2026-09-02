---
id: "2026-08-30-memory-settings-redesign"
stage: plan
schema: 3
status: accepted
owner: codex
created: 2026-08-30
based_on: spec.md
risk: low
scope: apps/desktop, docs/design/system.md
approved_by: "#decision-and-gates"
approved_at: "2026-08-30"
---

# Plan: Redesign the Memory settings workspace

## Files and ownership

apps/desktop, docs/design/system.md

## Order of work

Reuse the shared page header, introduce one workbench wrapper around the existing controls and
panes, express its geometry in the existing layout specification, and restyle only the Memory
surface. Preserve data loading, editing, batch actions, policy controls, and dialog behavior. Add a
focused layout contract, then verify the running renderer against the ImageGen concept in light,
dark, standard, and narrow states. Rollback is the inverse source change.

## Test-first proof

See legacy Verification section.

## Visual or integration proof

See legacy Verification section.

## Risks and mitigations

See legacy Decision and gates.

## Rollback

See legacy Review and release.

## Deviations

The Memory page now composes the shared `PageHeader`, a flat policy disclosure, and one workbench
containing status, views, filters, list, and inspector. The workbench uses semantic hairlines and a
neutral inspector surface. Standard width keeps all eight views on one row; at 800px and below,
status and view controls wrap while filters use two columns. Data loading, policy controls, batch
actions, editing, and the existing narrow detail dialog are unchanged.

## Decision

Intent and design direction are accepted by the user's 2026-08-30 implementation request and
attached screenshot. No permission to create a PR, merge, publish, or release is implied.
