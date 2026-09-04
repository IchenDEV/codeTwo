---
id: "2026-08-31-restore-sidebar-session-summary"
stage: plan
schema: 3
status: accepted
owner: codex
created: 2026-08-31
based_on: spec.md
risk: low
scope: crates/core/src/store.rs, apps/desktop/src/sidebar/SessionRail.tsx, apps/desktop/tests/sessionRailRendered.test.tsx, docs/sdlc/changes/2026-08-31-restore-sidebar-session-summary
approved_by: "[user]"
approved_at: "2026-08-31"
---

# Plan: Restore the sidebar session summary

## Files and ownership

crates/core/src/store.rs, apps/desktop/src/sidebar/SessionRail.tsx, apps/desktop/tests/sessionRailRendered.test.tsx, docs/sdlc/changes/2026-08-31-restore-sidebar-session-summary

## Order of work

1. Lock the AI-only preview and summary-line structure with red regression tests.
2. Restore the Provider mark and age using existing row data and the shared ProviderIcon.
3. Verify actual dark rendered rows at the sidebar's normal width, then run repository Gates.

Rollback restores the previous preview query and SessionRail row projection.

## Test-first proof

See legacy Verification section.

## Visual or integration proof

See legacy Verification section.

## Risks and mitigations

See legacy Decision and gates.

## Rollback

See legacy Review and release.

## Deviations

The Core preview projection now finds the latest Agent reply per durable session and coalesces all
of its text chunks after the preceding User part, preserving the existing one-query and
bounded-preview behavior. A later User prompt cannot replace that reply. SessionRail renders a
fixed summary line with the shared ProviderIcon, a one-line Agent preview when present, and compact
relative activity age driven by one rail-wide minute ticker. Workspace and Git provenance remain
on the following line.

## Decision

The direct user request approves this low-risk sidebar correction. The follow-up `pr` authorizes PR
creation only. Human review remains required before merge; release, deployment, and external
mutation remain unauthorized.
