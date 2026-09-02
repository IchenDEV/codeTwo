---
id: "2026-08-31-align-sidebar-search-shortcut"
stage: plan
schema: 3
status: accepted
owner: codex
created: 2026-08-31
based_on: spec.md
risk: low
scope: apps/desktop/src/sidebar/SessionRail.tsx, apps/desktop/tests/sessionRailRendered.test.tsx, docs/sdlc/changes/2026-08-31-align-sidebar-search-shortcut
approved_by: "[user]"
approved_at: "2026-08-31"
---

# Plan: Align the sidebar search shortcut

## Files and ownership

apps/desktop/src/sidebar/SessionRail.tsx, apps/desktop/tests/sessionRailRendered.test.tsx, docs/sdlc/changes/2026-08-31-align-sidebar-search-shortcut

## Order of work

1. Lock the width-overflow symptom with a focused SessionRail regression assertion.
2. Override the row Button's full-width sizing only for the search launcher.
3. Measure both horizontal insets and shortcut containment in an isolated rendered sidebar.

Rollback restores the previous search launcher width class.

## Test-first proof

See legacy Verification section.

## Visual or integration proof

See legacy Verification section.

## Risks and mitigations

See legacy Decision and gates.

## Rollback

See legacy Review and release.

## Deviations

The search launcher now overrides the shared row Button's `w-full` with `w-auto`. As a stretched
flex item, its automatic width accounts for both `mx-2` margins instead of adding those margins to
a full-width row. No shortcut, typography, height, interaction, or shared Button styling changed.

## Decision

The direct user request approves this low-risk layout correction. The follow-up `pr` authorizes PR
creation only. Human review remains required before merge; release, deployment, and external
mutation remain unauthorized.
