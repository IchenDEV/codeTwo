---
id: change-2026-09-01-git-next-action
kind: change
schema: 2
status: verified
risk: medium
owner: Codex
approvers: [chenli]
approved_at: 2026-09-01
created: 2026-09-01
updated: 2026-09-01
source: User request in the current Codex task to implement the Superdot interaction recommendations in order, beginning with the state-aware Git primary action
inputs: docs/archive/research/superdot-product-design-research-2026-09-01.md section 8 and the live origin/main Git surfaces
outputs: One workspace-owned Git next-action projection reused by the session header and Git dock
scope: apps/desktop/src/App.tsx, apps/desktop/src/components/ui/split-button.tsx, apps/desktop/src/git, apps/desktop/src/i18n/strings.ts, apps/desktop/src/session/SessionHeaderActions.tsx, apps/desktop/tests, docs/sdlc/changes/2026-09-01-git-next-action
next_trigger: PR creation, code review, merge, or release request
verification_mode: owner
verified_by: Codex
verified_at: 2026-09-01
---

# State-aware Git primary action

## Intent

CodeTwo currently exposes Commit, Push, source control, pull-request checks, review, merge, and
worktree cleanup as separate controls. A user must interpret local Git state and forge state before
choosing the next step. The desired outcome is one honest primary action for the active worktree,
with only currently valid alternatives, while preserving the existing review and confirmation
surfaces.

This change affects the desktop Git projection, session header, and Git dock. It must preserve
workspace ownership during asynchronous refreshes, must not add a second Git state store, and must
not make a new destructive or forge mutation bypassing the existing handlers. Sidebar hover cards,
new review-thread state, GitLab merge-request inspection, and worktree lifecycle redesign are
non-goals for this slice.

## Spec

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

### Acceptance criteria

- [x] AC-1: Unit tests prove the resolver's priority for loading, non-repository, local changes, ahead commits, missing PR, conflicts, failed/pending checks, requested changes, merge-ready, merged, and clean states.
- [x] AC-2: The session header presents exactly one state-aware primary Git action and only valid distinct alternatives, using existing Source Control, Push, Pull Request, and cleanup handlers.
- [x] AC-3: The Git dock displays the same resolved primary action and reason as the header rather than calculating its own lifecycle result.
- [x] AC-4: A cwd switch or forge-inspection failure cannot project stale forge state or hide valid local Git state; loading and degraded states have explicit disabled copy.
- [x] AC-5: Targeted renderer tests, desktop build/type checks, and light/dark/narrow rendered evidence show the action remains accessible and product-ready.

## Decision and gates

Chenli approved implementation by asking CodeTwo to optimize the researched interactions in order.
Codex owns implementation and verification. Human review remains required before merge. No release,
deployment, or production mutation is authorized.

## Plan

1. Add a pure Git next-action resolver and exhaustive state-priority tests for AC-1 and AC-4.
2. Extend the existing shared `SplitButton` only enough for the header's icon and accessible menu
   label, then replace the fixed Commit menu with the resolved action for AC-2.
3. Load source-control and current-PR context alongside the existing workspace-owned Git refresh,
   and pass one projection to the header and Git dock for AC-3 and AC-4.
4. Run targeted tests, build checks, rendered-window acceptance, and repository lifecycle Gates for
   AC-5. Roll back by reverting this change; all mutations continue to use the previous handlers.

## Build

Implemented on `codex/git-next-action` from `origin/main` at `b7010aa4`. A pure resolver now maps
workspace-owned Git, source-control, pull-request, and task-worktree state to one primary action and
deduplicated alternatives. The active workspace refresh loads local Git and forge context without
borrowing an earlier cwd, and the session header and Git dock consume the same projection and
existing guarded handlers. Disabled checking and unavailable states use a neutral surface rather
than looking like an enabled primary command.

## Verification

Verdict: verified.

### Acceptance evidence

- AC-1: PASS — `apps/desktop/tests/gitNextAction.test.ts` covers the complete priority ladder,
  including conservative review-required and unknown-blocker outcomes that never advertise merge.
- AC-2: PASS — `apps/desktop/tests/sessionHeaderActionsRendered.test.tsx` verifies one directly
  dispatchable primary action, valid chevron alternatives, explicit unavailable state, and stable
  accessible names when responsive labels hide.
- AC-3: PASS — `apps/desktop/tests/gitDockContentRendered.test.tsx` verifies the shared label,
  explanation, primary dispatch, alternative dispatch, and neutral disabled styling; source
  inspection confirms both surfaces receive the projection resolved by `App`.
- AC-4: PASS — `apps/desktop/tests/gitNextAction.test.ts` preserves local actions when forge
  inspection degrades, `apps/desktop/tests/gitState.test.ts` proves a mismatched cwd projects an
  empty loading state, and every async source-control/PR result is guarded by the current request
  sequence and cwd before publication.
- AC-5: PASS — `bun test tests/gitNextAction.test.ts tests/sessionHeaderActionsRendered.test.tsx
  tests/gitDockContentRendered.test.tsx` completed with 18 tests and 93 expectations; the full
  `bun test` desktop suite completed with 850 tests, 5,039 expectations, and zero failures across
  147 files.
  `bun run build:renderer` passed ESLint, Stylelint, TypeScript, and a 6,600-module Vite production
  build. Browser inspection of the production renderer confirmed matching header/Git-dock copy in
  light, dark, and 820x760 narrow layouts, responsive accessible names, neutral disabled styling,
  and no console warnings or errors.

- `bun test script/verify/checks.test.ts`: 5 tests and 23 expectations passed.
- `bun script/verify/docs.ts`, `bun script/verify/sdlc.ts`, and
  `bun script/verify/sdlc.ts --worktree`: passed.
- `git diff --check`: passed.
- Process preflight found another CodeTwo Electrobun instance. Verification therefore served this
  branch's built renderer on isolated port 4173 and did not start a second Core or touch the live
  instance's data.

Residual risk: enabled Git/forge states were exercised in component tests rather than a second
native desktop instance because the repository currently permits only one live Core owner. GitHub
pull-request inspection depends on the existing `gh` integration and its response time. GitLab MR
inspection remains outside this slice. Existing non-failing Base UI `act(...)` warnings remain in
the test suite and were not introduced by this change.

## Review and release

Approval: Chenli confirmed the rendered interaction acceptance was complete on 2026-09-01 with
no changes requested. PR-level code review and merge approval remain separate Gates.
Release target: none.
Release identity: not applicable until released.
Smoke evidence: production renderer Browser pass recorded above; native release smoke is not
applicable until released.
Rollback: revert the implementation commit; existing Git handlers remain independently usable.
No release: PR creation, merge, deployment, and release were not requested.

Preparing this section does not authorize merge, deployment, release, or production mutation.

## Feedback

Chenli confirmed “验收完了” on 2026-09-01. No corrective feedback was requested; the accepted
observation boundary is the completed light, dark, narrow-layout, interaction, and automated-test
pass recorded above.
