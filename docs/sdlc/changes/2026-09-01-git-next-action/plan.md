---
id: "2026-09-01-git-next-action"
stage: plan
schema: 3
status: accepted
owner: Codex
created: 2026-09-01
based_on: spec.md
risk: medium
scope: apps/desktop/src/App.tsx, apps/desktop/src/components/ui/split-button.tsx, apps/desktop/src/git, apps/desktop/src/i18n/strings.ts, apps/desktop/src/session/SessionHeaderActions.tsx, apps/desktop/tests, docs/sdlc/changes/2026-09-01-git-next-action
approved_by: "[chenli]"
approved_at: "2026-09-01"
---

# Plan: State-aware Git primary action

## Files and ownership

apps/desktop/src/App.tsx, apps/desktop/src/components/ui/split-button.tsx, apps/desktop/src/git, apps/desktop/src/i18n/strings.ts, apps/desktop/src/session/SessionHeaderActions.tsx, apps/desktop/tests, docs/sdlc/changes/2026-09-01-git-next-action

## Order of work

1. Add a pure Git next-action resolver and exhaustive state-priority tests for AC-1 and AC-4.
2. Extend the existing shared `SplitButton` only enough for the header's icon and accessible menu
   label, then replace the fixed Commit menu with the resolved action for AC-2.
3. Load source-control and current-PR context alongside the existing workspace-owned Git refresh,
   and pass one projection to the header and Git dock for AC-3 and AC-4.
4. Run targeted tests, build checks, rendered-window acceptance, and repository lifecycle Gates for
   AC-5. Roll back by reverting this change; all mutations continue to use the previous handlers.

## Test-first proof

See legacy Verification section.

## Visual or integration proof

See legacy Verification section.

## Risks and mitigations

See legacy Decision and gates.

## Rollback

See legacy Review and release.

## Deviations

Implemented on `codex/git-next-action` from `origin/main` at `b7010aa4`. A pure resolver now maps
workspace-owned Git, source-control, pull-request, and task-worktree state to one primary action and
deduplicated alternatives. The active workspace refresh loads local Git and forge context without
borrowing an earlier cwd, and the session header and Git dock consume the same projection and
existing guarded handlers. Disabled checking and unavailable states use a neutral surface rather
than looking like an enabled primary command.

## Decision

Chenli approved implementation by asking CodeTwo to optimize the researched interactions in order.
Codex owns implementation and verification. Human review remains required before merge. No release,
deployment, or production mutation is authorized.
