---
id: "2026-08-31-fix-dock-tab-indicator-alignment"
stage: intent
schema: 3
status: accepted
owner: codex
created: 2026-08-31
source: user-supplied selected Dock tab misalignment screenshot and direct implementation request on 2026-08-31
risk: medium
approved_by: "[user]"
approved_at: "2026-08-31"
---

# Intent: Align the selected Dock tab background

## Problem

The user supplied a rendered screenshot in which the selected Dock tab label and icon were correctly
placed, but the rounded selection background was shifted down and left into the content boundary.
The desired outcome is one quiet selected state whose background stays inside its selected tab at
every Dock width.

The change is limited to the compact toolbar presentation of shared Tabs. Other tab variants, Dock
content, panel resizing, and navigation behavior are non-goals.

## Proposed outcome

The user supplied a rendered screenshot in which the selected Dock tab label and icon were correctly

## Affected users and systems

Migrated from legacy change.md.

## Constraints

The user's screenshot-backed implementation request accepted Intent and visible design. After the
final toolbar screenshot was shown, the user explicitly requested a PR on 2026-08-31. PR creation
is authorized; merge, release, deployment, and production mutation remain separate pending Gates.

The diagnosis measured a 28px selected trigger at top 6px while the liquid indicator rendered at top
20px inside a 0x0 wrapper after the library overwrote absolute positioning. This evidence selected a
static toolbar background while preserving animation for variants designed to contain it.

## Out of scope

Not recorded in the legacy single-file Artifact.

## Success signals

See Spec acceptance criteria.

## Open questions

None recorded in migration.

## Decision

The user's screenshot-backed implementation request accepted Intent and visible design. After the
final toolbar screenshot was shown, the user explicitly requested a PR on 2026-08-31. PR creation
is authorized; merge, release, deployment, and production mutation remain separate pending Gates.

The diagnosis measured a 28px selected trigger at top 6px while the liquid indicator rendered at top
20px inside a 0x0 wrapper after the library overwrote absolute positioning. This evidence selected a
static toolbar background while preserving animation for variants designed to contain it.
