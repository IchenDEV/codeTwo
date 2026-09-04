---
id: "2026-09-01-task-session-workspace-polish"
stage: plan
schema: 3
status: accepted
owner: codex
created: 2026-09-01
based_on: spec.md
risk: medium
scope: apps/desktop/src/App.tsx, apps/desktop/src/components/business/page-header.tsx, apps/desktop/src/design/theme.ts, apps/desktop/src/design/tokens.css, apps/desktop/src/i18n/strings.ts, apps/desktop/src/taskboard, apps/desktop/tests/taskBoard.test.ts, apps/desktop/tests/taskBoardRendered.test.tsx, apps/desktop/tests/taskBoardWorkspaceModel.test.ts, apps/desktop/tests/theme.test.ts, docs/sdlc/changes/2026-09-01-task-session-workspace-polish
approved_by: "userdirect review-fix, no-drawer, floating-panel, surface-tone, and PR requests"
approved_at: "2026-09-01"
---

# Plan: Polish the Task-to-Session workspace

## Files and ownership

apps/desktop/src/App.tsx, apps/desktop/src/components/business/page-header.tsx, apps/desktop/src/design/theme.ts, apps/desktop/src/design/tokens.css, apps/desktop/src/i18n/strings.ts, apps/desktop/src/taskboard, apps/desktop/tests/taskBoard.test.ts, apps/desktop/tests/taskBoardRendered.test.tsx, apps/desktop/tests/taskBoardWorkspaceModel.test.ts, apps/desktop/tests/theme.test.ts, docs/sdlc/changes/2026-09-01-task-session-workspace-polish

## Order of work

1. Add a pane-scoped prompt continuation helper and regression tests.
2. Extend existing TaskBoard selection, PR projection, status, and responsive layout modules.
3. Strengthen the shared light surface tone through the central theme resolver and fallback token.
4. Run focused and full validation, inspect desktop and narrow renders, then open a Draft PR.

Rollback reverts this follow-up commit. Task and Session persistence formats are unchanged.

## Test-first proof

See legacy Verification section.

## Visual or integration proof

See legacy Verification section.

## Risks and mitigations

See legacy Decision and gates.

## Rollback

See legacy Review and release.

## Deviations

Implementation is complete on `codex/task-session-workspace-polish`, based on the merge commit for
PR #214. It adds pane-scoped safe continuation, truthful Session/PR state projection, labelled
status indicators, the flat responsive inspector, and the adjusted shared surface tone. The
earlier dirty `main` checkout and unrelated OpenClaw research remain outside the branch.

## Decision

The user approved the fixes and explicitly requested a PR. Ponytail selected a port onto current
`origin/main`: reuse the merged responsibility-owned TaskBoard modules and change only their
existing seams. The stale pre-merge working tree is not used as a branch because doing so would
delete the merged modular architecture.

This remains medium risk because composer state and the primary TaskBoard navigation are affected.
Opening the follow-up PR is authorized; merge and release remain human Gates.
