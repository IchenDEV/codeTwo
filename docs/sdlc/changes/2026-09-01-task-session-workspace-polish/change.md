---
id: change-2026-09-01-task-session-workspace-polish
kind: change
schema: 2
status: verified
risk: medium
owner: codex
approvers: user via direct review-fix, no-drawer, floating-panel, surface-tone, and PR requests
approved_at: 2026-09-01
created: 2026-09-01
updated: 2026-09-01
source: follow-up feedback and review after merged PR #214
inputs: merged TaskBoard workspace, selected Session state, scoped composer drafts, and per-checkout pull-request projection
outputs: safe Session continuation and a flat responsive TaskBoard inspector
scope: apps/desktop/src/App.tsx, apps/desktop/src/components/business/page-header.tsx, apps/desktop/src/design/theme.ts, apps/desktop/src/design/tokens.css, apps/desktop/src/i18n/strings.ts, apps/desktop/src/taskboard, apps/desktop/tests/taskBoard.test.ts, apps/desktop/tests/taskBoardRendered.test.tsx, apps/desktop/tests/taskBoardWorkspaceModel.test.ts, apps/desktop/tests/theme.test.ts, docs/sdlc/changes/2026-09-01-task-session-workspace-polish
next_trigger: human review of the Draft PR
verification_mode: owner
verified_by: codex
verified_at: 2026-09-01
---

# Polish the Task-to-Session workspace

## Intent

PR #214 established the Task-to-Session workspace. Follow-up review found two composer draft-loss
races, inaccurate historical Session and pull-request states, inaccessible color-only status, and
a narrow inspector that behaved like a drawer. The user's visual feedback also requires a wide
floating panel that remains flat, borderless, and distinguishable from the white page.

The accepted outcome preserves the merged modular TaskBoard architecture. It does not reintroduce
the former monolithic page, change Task or Session persistence, merge the PR, or release software.

## Spec

- Continuing from the inspector appends to the destination pane's existing draft and cancels if
  asynchronous navigation no longer targets that pane and Session.
- Selected historical Sessions use selected-Session copy and always trigger their checkout's PR
  lookup, including histories beyond the initial 48-path batch. Loading and failed lookup states
  must not render false `No PR` results.
- Task and Session states use the shared labelled status indicator.
- At wide widths the inspector is a 360-pixel inset `surface` panel with no border or shadow. At
  narrow widths the page switches in place between list and detail with an explicit Back action;
  expansion alone never opens the detail and no drawer, overlay, or scrim mounts.
- The shared light `surface` tone mixes 2% foreground into the white canvas. Dark mode remains
  unchanged.

### Acceptance criteria

- [x] AC-1: Existing drafts survive inspector continuation and stale navigation cannot target a
      different pane or Session.
- [x] AC-2: Historical, loading, failed, and beyond-cap PR states render accurately and status is
      exposed without relying on color.
- [x] AC-3: Wide and narrow layouts match the accepted floating/in-place behavior with no drawer,
      border, shadow, scrim, or horizontal overflow.
- [x] AC-4: Focused tests, lint, TypeScript, renderer build, documentation/SDLC Gates, diff hygiene,
      and live rendered inspection pass.

## Decision and gates

The user approved the fixes and explicitly requested a PR. Ponytail selected a port onto current
`origin/main`: reuse the merged responsibility-owned TaskBoard modules and change only their
existing seams. The stale pre-merge working tree is not used as a branch because doing so would
delete the merged modular architecture.

This remains medium risk because composer state and the primary TaskBoard navigation are affected.
Opening the follow-up PR is authorized; merge and release remain human Gates.

## Plan

1. Add a pane-scoped prompt continuation helper and regression tests.
2. Extend existing TaskBoard selection, PR projection, status, and responsive layout modules.
3. Strengthen the shared light surface tone through the central theme resolver and fallback token.
4. Run focused and full validation, inspect desktop and narrow renders, then open a Draft PR.

Rollback reverts this follow-up commit. Task and Session persistence formats are unchanged.

## Build

Implementation is complete on `codex/task-session-workspace-polish`, based on the merge commit for
PR #214. It adds pane-scoped safe continuation, truthful Session/PR state projection, labelled
status indicators, the flat responsive inspector, and the adjusted shared surface tone. The
earlier dirty `main` checkout and unrelated OpenClaw research remain outside the branch.

## Verification

Verdict: verified

- Focused behavior and theme suite: 64 passing tests, 259 assertions.
- Full desktop suite: 839 passing tests, 5,005 assertions, zero failures.
- `bunx tsc --noEmit`, ESLint, Stylelint, and `bun run build` passed. The build retained only the
  repository's advisory large-chunk warning.
- Live browser inspection at 1440 by 900 confirmed a persistent 360-pixel inspector with a 12-pixel
  inset, 16-pixel radius, distinct `surface` background, zero border width, no shadow, and no
  horizontal overflow.
- Live browser inspection at 760 by 900 confirmed Task expansion remains in the list; explicit
  inspector navigation switches in place with no dialog, overlay, or scrim, and Back restores
  focus to the inspector control.
- Documentation, SDLC, worktree SDLC, and proposed-file diff-hygiene checks passed.

### Acceptance evidence

- AC-1: PASS — the focused `bun test` command passed 64 tests, including pane-scoped
  destination-draft append and stale-navigation cancellation.
- AC-2: PASS — the same focused `bun test` command covers selected historical copy, labelled status,
  loading and failed PR states, a selected Session beyond the 48-checkout lookup cap, semantic
  tones, and unresolved PR counts.
- AC-3: PASS — live 1440 by 900 inspection measured the accepted floating `surface` panel, while
  live 760 by 900 interaction proved the in-place list/detail switch, focus restoration, zero
  dialogs, overlays, scrims, borders, shadows, and horizontal overflow.
- AC-4: PASS — `cd apps/desktop && bun test` passed 839/839; `bunx tsc --noEmit`, `bun run lint`,
  `bun run build`, `bun script/verify/docs.ts`, `bun script/verify/sdlc.ts`,
  `bun script/verify/sdlc.ts --worktree`, `git diff --check`, and the isolated-index
  `git diff --cached --check` all passed.

Residual risk: GitHub status remains best effort and depends on a usable checkout plus local
authentication and network. Human review remains required before merge.

## Review and release

Approval: the user requested the follow-up PR on 2026-09-01.
Release target: none requested.
No merge or release is authorized by this Artifact.

## Feedback

The user rejected the earlier drawer treatment, requested a floating but clean right panel, then
asked for a stronger `surface` color and a follow-up PR. The implementation keeps those visual
decisions while preserving the responsibility-owned modules merged in PR #214.
