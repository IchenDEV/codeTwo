---
id: "2026-09-01-task-session-workspace-polish"
stage: intent
schema: 3
status: accepted
owner: codex
created: 2026-09-01
source: follow-up feedback and review after merged PR #214
risk: medium
approved_by: "userdirect review-fix, no-drawer, floating-panel, surface-tone, and PR requests"
approved_at: "2026-09-01"
---

# Intent: Polish the Task-to-Session workspace

## Problem

PR #214 established the Task-to-Session workspace. Follow-up review found two composer draft-loss
races, inaccurate historical Session and pull-request states, inaccessible color-only status, and
a narrow inspector that behaved like a drawer. The user's visual feedback also requires a wide
floating panel that remains flat, borderless, and distinguishable from the white page.

The accepted outcome preserves the merged modular TaskBoard architecture. It does not reintroduce
the former monolithic page, change Task or Session persistence, merge the PR, or release software.

## Proposed outcome

PR #214 established the Task-to-Session workspace. Follow-up review found two composer draft-loss

## Affected users and systems

Migrated from legacy change.md.

## Constraints

The user approved the fixes and explicitly requested a PR. Ponytail selected a port onto current
`origin/main`: reuse the merged responsibility-owned TaskBoard modules and change only their
existing seams. The stale pre-merge working tree is not used as a branch because doing so would
delete the merged modular architecture.

This remains medium risk because composer state and the primary TaskBoard navigation are affected.
Opening the follow-up PR is authorized; merge and release remain human Gates.

## Out of scope

Not recorded in the legacy single-file Artifact.

## Success signals

See Spec acceptance criteria.

## Open questions

None recorded in migration.

## Decision

The user approved the fixes and explicitly requested a PR. Ponytail selected a port onto current
`origin/main`: reuse the merged responsibility-owned TaskBoard modules and change only their
existing seams. The stale pre-merge working tree is not used as a branch because doing so would
delete the merged modular architecture.

This remains medium risk because composer state and the primary TaskBoard navigation are affected.
Opening the follow-up PR is authorized; merge and release remain human Gates.
