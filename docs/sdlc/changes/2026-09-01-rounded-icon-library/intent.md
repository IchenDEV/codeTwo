---
id: "2026-09-01-rounded-icon-library"
stage: intent
schema: 3
status: accepted
owner: codex
created: 2026-09-01
source: direct user requests on 2026-09-01 to replace the strange-looking icon set with a rounder library, switch every generic desktop interface icon, continue the migration, and remove fallback icons
risk: medium
approved_by: "[user]"
approved_at: "2026-09-01"
---

# Intent: Adopt a rounder desktop icon family

## Problem

The desktop currently renders product glyphs through Hugeicons. The user reports that this visual
language feels strange and asked for a rounder icon library. The affected surface is the desktop
renderer: navigation, toolbars, menus, status, settings, and other shared controls all consume the
central icon adapter.

The desired outcome is a softer, more coherent icon family with clear macOS-sized silhouettes,
without changing feature behavior, provider marks, data, protocols, window geometry, or the app
icon. Existing call sites should retain their stable semantic imports so the migration stays
narrow and reversible.

## Proposed outcome

The desktop currently renders product glyphs through Hugeicons. The user reports that this visual

## Affected users and systems

Migrated from legacy change.md.

## Constraints

The user approved Intent and implementation through the direct request on 2026-09-01. Phosphor was
selected over Tabler and Lucide because its rounded silhouettes and family-wide weights better fit
the requested direction while retaining React tree-shaking and MIT licensing. The implementation
preserves familiar icon concepts in line with the macOS HIG Icons and SF Symbols guidance.

No security, data, provider, merge, release, deployment, or production Gate is granted. Final
visual taste remains a human review Gate after the rendered evidence is available.

## Out of scope

Not recorded in the legacy single-file Artifact.

## Success signals

See Spec acceptance criteria.

## Open questions

None recorded in migration.

## Decision

The user approved Intent and implementation through the direct request on 2026-09-01. Phosphor was
selected over Tabler and Lucide because its rounded silhouettes and family-wide weights better fit
the requested direction while retaining React tree-shaking and MIT licensing. The implementation
preserves familiar icon concepts in line with the macOS HIG Icons and SF Symbols guidance.

No security, data, provider, merge, release, deployment, or production Gate is granted. Final
visual taste remains a human review Gate after the rendered evidence is available.
