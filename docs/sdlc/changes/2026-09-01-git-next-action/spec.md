---
id: "2026-09-01-git-next-action"
stage: spec
schema: 3
status: accepted
owner: Codex
created: 2026-09-01
based_on: intent.md
risk: medium
approved_by: "[chenli]"
approved_at: "2026-09-01"
---

# Spec: State-aware Git primary action

## Requirements

The renderer derives one `GitNextAction` from the current workspace's `GitStatus`, source-control
capability, current GitHub pull request, and whether the active session owns a disposable worktree.
Local files take priority over remote review state, followed by unpushed commits, pull-request
blockers, checks/review state, merge readiness, and merged-worktree cleanup. Loading, unsupported,
and clean/no-action states remain explicit and disabled.

The session header renders the primary action as the main half of the existing shared split-button
pattern. Its chevron lists only distinct valid alternatives. The Git dock renders the same resolved
primary action and explanation. Primary actions route to existing Source Control, Push, Pull
Request, and confirmed worktree-discard paths; this change does not introduce direct merge, review,
or deletion commands.

Asynchronous source-control and pull-request reads are keyed to the current cwd. A prior workspace's
result must never appear after navigation. A provider or CLI failure may reduce forge-specific
actions, but must not erase successfully loaded local Git status.

## User experience

Not separately recorded in legacy change.md.

## Technical design

See Requirements and legacy Git history.

## Security and privacy

See migrated Decision and gates.

## Alternatives and non-goals

Not separately recorded in legacy change.md.

## Areas of concern

Chenli approved implementation by asking CodeTwo to optimize the researched interactions in order.
Codex owns implementation and verification. Human review remains required before merge. No release,
deployment, or production mutation is authorized.

## Acceptance criteria

- [x] AC-1: Unit tests prove the resolver's priority for loading, non-repository, local changes, ahead commits, missing PR, conflicts, failed/pending checks, requested changes, merge-ready, merged, and clean states.
- [x] AC-2: The session header presents exactly one state-aware primary Git action and only valid distinct alternatives, using existing Source Control, Push, Pull Request, and cleanup handlers.
- [x] AC-3: The Git dock displays the same resolved primary action and reason as the header rather than calculating its own lifecycle result.
- [x] AC-4: A cwd switch or forge-inspection failure cannot project stale forge state or hide valid local Git state; loading and degraded states have explicit disabled copy.
- [x] AC-5: Targeted renderer tests, desktop build/type checks, and light/dark/narrow rendered evidence show the action remains accessible and product-ready.

## Decision

Chenli approved implementation by asking CodeTwo to optimize the researched interactions in order.
Codex owns implementation and verification. Human review remains required before merge. No release,
deployment, or production mutation is authorized.
