---
id: "2026-08-31-animate-pane-splits"
stage: intent
schema: 3
status: accepted
owner: codex
created: 2026-08-31
source: direct user request with screenshot of the split-right and split-down menu actions
risk: low
approved_by: "[user]"
approved_at: "2026-08-31"
---

# Intent: Animate new pane splits

## Problem

The user highlighted the Split right and Split down actions and requested animation. The menu
already uses the shared layer entrance and hover feedback, so the missing feedback is the visible
result: a newly created pane currently appears instantly. Add restrained direction-aware entrance
motion to the new pane without changing menu geometry, pane layout, focus, divider behavior, or
editor lifetime.

## Proposed outcome

The user highlighted the Split right and Split down actions and requested animation. The menu

## Affected users and systems

Migrated from legacy change.md.

## Constraints

The direct user request approves this low-risk visual feedback. The follow-up `pr` authorizes PR
creation only. Human review remains required before merge; release, deployment, and external
mutation remain unauthorized.

## Out of scope

Not recorded in the legacy single-file Artifact.

## Success signals

See Spec acceptance criteria.

## Open questions

None recorded in migration.

## Decision

The direct user request approves this low-risk visual feedback. The follow-up `pr` authorizes PR
creation only. Human review remains required before merge; release, deployment, and external
mutation remain unauthorized.
