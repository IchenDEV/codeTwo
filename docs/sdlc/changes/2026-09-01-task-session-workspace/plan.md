---
id: "2026-09-01-task-session-workspace"
stage: plan
schema: 3
status: accepted
owner: codex
created: 2026-09-01
based_on: spec.md
risk: medium
scope: .github/workflows/desktop-design-system.yml, .gitignore, apps/desktop/bun.lock, apps/desktop/eslint.config.mjs, apps/desktop/package.json, apps/desktop/src/App.tsx, apps/desktop/src/i18n/strings.ts, apps/desktop/src/taskboard, apps/desktop/stryker.taskboard.config.json, apps/desktop/tests/desktopPerformanceContract.test.ts, apps/desktop/tests/taskBoardRendered.test.tsx, apps/desktop/tests/taskBoardWorkspaceModel.test.ts, apps/desktop/tsconfig.stryker.json, docs/sdlc/changes/2026-09-01-task-session-workspace
approved_by: "userthe 2026-09-01 approval of UI prototype option A and direct implementation request"
approved_at: "2026-09-01"
---

# Plan: Make TaskBoard a Task-to-Session workspace

## Files and ownership

.github/workflows/desktop-design-system.yml, .gitignore, apps/desktop/bun.lock, apps/desktop/eslint.config.mjs, apps/desktop/package.json, apps/desktop/src/App.tsx, apps/desktop/src/i18n/strings.ts, apps/desktop/src/taskboard, apps/desktop/stryker.taskboard.config.json, apps/desktop/tests/desktopPerformanceContract.test.ts, apps/desktop/tests/taskBoardRendered.test.tsx, apps/desktop/tests/taskBoardWorkspaceModel.test.ts, apps/desktop/tsconfig.stryker.json, docs/sdlc/changes/2026-09-01-task-session-workspace

## Order of work

1. Project existing Tasks, SessionInfo records, activity, worktree paths, and best-effort GitHub
   status into Task and Session rows without changing storage.
2. Replace the column/card composition with the accepted dense list, inline Session history, and
   responsive inspector while reusing CodeTwo primitives and Task editor/actions.
3. Add only the copy needed by the accepted surface and preserve English/Chinese parity.
4. Update focused rendered coverage for hierarchy, selection, per-Session PR projection, existing
   Task actions, keyboard semantics, and narrow drawer behavior.
5. Build and inspect light, dark, desktop, and narrow renders against the accepted prototype.
6. Keep only deterministic quality checks: use ESLint for static rules, type-aware checks for
   unsafe `any`, and Stryker for the deterministic workspace model.

Rollback restores the previous TaskBoardPage composition. No Task snapshot migration or Core data
change is required, so rollback does not rewrite user data.

## Test-first proof

See legacy Verification section.

## Visual or integration proof

See legacy Verification section.

## Risks and mitigations

See legacy Decision and gates.

## Rollback

See legacy Review and release.

## Deviations

TaskBoard now projects the existing ordered `sessionIds` into an inline newest-first Session
history. Session activity and checkout provenance continue to come from Core; the page performs a
bounded, deduplicated lookup of the current pull request for each available Session checkout and
does not persist that projection into the Task snapshot. Archived worktrees are ignored.

The former four-column card view is now a progressive flat Task list with the accepted Task,
Session, open-PR, and updated-time columns. The Agent/Details/Insights inspector follows the
selected Task and Session, exposes the selected checkout and pull request, and hands a prompt back
to the existing Session composer instead of creating another chat model. Existing Task creation,
editing, deletion, stage changes, filters, and first/new Session actions remain available.

The workspace uses the repository's existing controls and design tokens. Container queries reduce
secondary list columns before 768 pixels and turn the inspector into a dismissible right drawer;
the default desktop composition remains a workspace plus 360-pixel inspector.

The follow-up quality pass split the 1,268-line TaskBoard page into responsibility-owned modules,
all below 250 physical lines, while preserving the existing rendered behavior. After adversarial
probes showed that the custom Halstead/CRAP analyzer and zero-dead-code/redundancy claims were not
reliable, that analyzer and its duplicate coverage/CI path were removed. ESLint now discovers new
TaskBoard TypeScript modules through a directory glob, applies cyclomatic, cognitive, file-size,
unused-code, local-redundancy, and type-aware unsafe-`any` rules, and allows narrowed `unknown` at
real data boundaries. `taskBoard.ts` and `TaskEditorDialog.tsx` remain explicit legacy exceptions.
Stryker plus the TypeScript checker separately requires zero surviving valid mutants in the
deterministic workspace model.

## Decision

The user approved the option-A prototype and directly requested implementation. Ponytail review
selected reuse: ordered `sessionIds` already express Task history, SessionInfo already owns
worktree provenance, and the existing bounded GitHub lookup already resolves a checkout's current
pull request. No persisted Item, delivery, PR-history, or compatibility abstraction is added.

This is a medium-risk desktop UI change because it replaces the primary TaskBoard information
architecture while preserving existing local Task persistence. Human review remains required
before merge. Release and production Gates are not opened by this request.
