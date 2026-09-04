---
id: "2026-09-01-unify-task-row-style"
stage: plan
schema: 3
status: accepted
owner: codex
created: 2026-09-01
based_on: spec.md
risk: low
scope: apps/desktop/src/sidebar/SessionRail.tsx, apps/desktop/tests/sessionRailRendered.test.tsx, docs/sdlc/changes/2026-09-01-unify-task-row-style
approved_by: "[user]"
approved_at: "2026-09-01"
---

# Plan: Unify ordinary Task row styling

## Files and ownership

apps/desktop/src/sidebar/SessionRail.tsx, apps/desktop/tests/sessionRailRendered.test.tsx, docs/sdlc/changes/2026-09-01-unify-task-row-style

## Order of work

1. Change the ungrouped rendered regression to require the accepted two-line style.
2. Broaden the existing summary provenance condition to every ordinary Task.
3. Rebuild the current desktop instance and run the required checks.

Rollback restores workspace identity for ordinary top-level Tasks.

## Test-first proof

See legacy Verification section.

## Visual or integration proof

See legacy Verification section.

## Risks and mitigations

See legacy Decision and gates.

## Rollback

See legacy Review and release.

## Deviations

The existing provenance placement condition now covers every ordinary Task without a pull request.
The workspace path remains in session data and Project assignment; it is no longer repeated as a
third visual line. Pull-request Tasks retain their dedicated provenance line.

## Decision

The direct screenshot request approves this low-risk presentation correction. Ponytail selects the
existing provenance placement condition; no new row variant or state is introduced. The previous
decision to retain a workspace line for ordinary ungrouped Tasks is superseded by this request.
