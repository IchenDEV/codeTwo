---
id: "2026-08-31-remove-project-disclosure-icon"
stage: plan
schema: 3
status: accepted
owner: codex
created: 2026-08-31
based_on: spec.md
risk: low
scope: apps/desktop/src/sidebar/SessionRail.tsx, apps/desktop/tests/sessionRailRendered.test.tsx, docs/sdlc/changes/2026-08-31-remove-project-disclosure-icon
approved_by: "[user]"
approved_at: "2026-08-31"
---

# Plan: Remove the Project disclosure icon

## Files and ownership

apps/desktop/src/sidebar/SessionRail.tsx, apps/desktop/tests/sessionRailRendered.test.tsx, docs/sdlc/changes/2026-08-31-remove-project-disclosure-icon

## Order of work

1. Remove the decorative disclosure icon from the shared Project-header renderer.
2. Add a rendered regression covering both the icon count and retained collapse behavior.
3. Run focused checks, repository lifecycle checks, and inspect the rendered sidebar.

Rollback reverts this bundle and restores the disclosure icon.

## Test-first proof

See legacy Verification section.

## Visual or integration proof

See legacy Verification section.

## Risks and mitigations

See legacy Decision and gates.

## Rollback

See legacy Review and release.

## Deviations

The shared Project header no longer renders its trailing disclosure arrow. A rendered regression
asserts that its only SVG is the folder and that activating the same header still folds its Task
content. No material deviation from the Plan was required.

## Decision

The direct user request accepts this low-risk Intent and visible UI direction. Human review remains
required before merge. No release or production action is authorized.
