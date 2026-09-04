---
id: "2026-08-31-macos-titlebar-window-behavior"
stage: intent
schema: 3
status: accepted
owner: codex
created: 2026-08-31
source: direct user reports and screenshot feedback in this task on 2026-08-31
risk: medium
approved_by: "[chenli]"
approved_at: "2026-08-31"
---

# Intent: Preserve native macOS titlebar window behavior

## Problem

The user reported two defects in CodeTwo's custom macOS window chrome: double-clicking a draggable
titlebar region did not perform the action selected in Desktop & Dock settings, and the native
close, minimize, and zoom controls did not align with the fixed shared titlebar. The requested
outcome is ordinary Mac window behavior with a visually balanced traffic-light group.

The affected surface is the main Electrobun window on macOS. Windows/Linux behavior, full-screen
Spaces, browser zoom, desktop-pet chrome, renderer titlebar height, and stored application data are
non-goals. The traffic-light solution must not measure titlebar geometry or calculate an adaptive
position because the shared titlebar is fixed at 56 px.

## Proposed outcome

The user reported two defects in CodeTwo's custom macOS window chrome: double-clicking a draggable

## Affected users and systems

Migrated from legacy change.md.

## Constraints

The user's direct implementation instructions approve Intent, the native macOS behavior, the fixed
position design, and execution, with chenli as the named approver. The user reviewed the fresh
packaged screenshot and then explicitly requested a PR, authorizing the Review handoff only. Merge,
release, deployment, and production mutation remain unauthorized.

## Out of scope

Not recorded in the legacy single-file Artifact.

## Success signals

See Spec acceptance criteria.

## Open questions

None recorded in migration.

## Decision

The user's direct implementation instructions approve Intent, the native macOS behavior, the fixed
position design, and execution, with chenli as the named approver. The user reviewed the fresh
packaged screenshot and then explicitly requested a PR, authorizing the Review handoff only. Merge,
release, deployment, and production mutation remain unauthorized.
