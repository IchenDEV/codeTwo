---
id: "2026-08-31-restore-sidebar-session-summary"
stage: intent
schema: 3
status: accepted
owner: codex
created: 2026-08-31
source: direct user request with screenshot showing missing session summary metadata in the sidebar
risk: low
approved_by: "[user]"
approved_at: "2026-08-31"
---

# Intent: Restore the sidebar session summary

## Problem

The user reported that Task rows no longer show their second line. That line must make a session
scannable by combining the newest AI reply, the Provider mark, and how long ago the Task was last
active. The current renderer instead treats any newest text, including the user's prompt, as a
preview and separately reserves the lower line for workspace provenance.

## Proposed outcome

The user reported that Task rows no longer show their second line. That line must make a session

## Affected users and systems

Migrated from legacy change.md.

## Constraints

The direct user request approves this low-risk sidebar correction. The follow-up `pr` authorizes PR
creation only. Human review remains required before merge; release, deployment, and external
mutation remain unauthorized.

## Out of scope

Not recorded in the legacy single-file Artifact.

## Success signals

See Spec acceptance criteria.

## Open questions

None recorded in migration.

## Decision

The direct user request approves this low-risk sidebar correction. The follow-up `pr` authorizes PR
creation only. Human review remains required before merge; release, deployment, and external
mutation remain unauthorized.
