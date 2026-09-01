---
id: change-2026-09-01-unify-task-row-style
kind: change
schema: 2
status: verified
risk: low
owner: codex
approvers: [user]
approved_at: 2026-09-01
created: 2026-09-01
updated: 2026-09-01
source: direct user request comparing top-level and Project-grouped Task screenshots
inputs: change-2026-09-01-align-nested-task-provenance and current SessionRail Task rows
outputs: one shared two-line presentation for ordinary top-level and Project-grouped Tasks
scope: apps/desktop/src/sidebar/SessionRail.tsx, apps/desktop/tests/sessionRailRendered.test.tsx, docs/sdlc/changes/2026-09-01-unify-task-row-style
next_trigger: user visual acceptance in the populated top-level Task view
verification_mode: owner
verified_by: codex
verified_at: 2026-09-01
---

# Unify ordinary Task row styling

## Intent

The user compared a three-line top-level Task with a two-line Project-grouped Task and requested
the latter style everywhere. The visual difference comes from top-level Tasks retaining a workspace
identity line even when no pull request needs a provenance row.

## Spec

- Ordinary Tasks without pull-request state use the same two lines whether or not they sit beneath
  a Project heading.
- Checkout/worktree metadata stays at the end of the summary line.
- A pull-request Task may retain its dedicated provenance line because it carries additional
  delivery state.
- Project assignment, workspace paths, actions, accessibility, ordering, and drag/drop do not
  change.

### Acceptance criteria

- [x] AC-1: An ordinary top-level Task renders only title and summary lines.
- [x] AC-2: Its summary retains Provider, age, and checkout/worktree metadata.
- [x] AC-3: Focused and full tests, native rebuild, and repository lifecycle checks pass.

## Decision and gates

The direct screenshot request approves this low-risk presentation correction. Ponytail selects the
existing provenance placement condition; no new row variant or state is introduced. The previous
decision to retain a workspace line for ordinary ungrouped Tasks is superseded by this request.

## Plan

1. Change the ungrouped rendered regression to require the accepted two-line style.
2. Broaden the existing summary provenance condition to every ordinary Task.
3. Rebuild the current desktop instance and run the required checks.

Rollback restores workspace identity for ordinary top-level Tasks.

## Build

The existing provenance placement condition now covers every ordinary Task without a pull request.
The workspace path remains in session data and Project assignment; it is no longer repeated as a
third visual line. Pull-request Tasks retain their dedicated provenance line.

## Verification

Verdict: verified.

### Acceptance evidence

- AC-1: PASS — `bun test tests/sessionRailRendered.test.tsx --test-name-pattern
  "same two-line style"` failed against the old workspace line, then passed after the condition
  changed: 1 test, 7 expectations.
- AC-2: PASS — `bun test tests/sessionRailRendered.test.tsx` passed 30 tests and 284 expectations,
  including Provider, age, checkout/worktree order, and the retained PR provenance path.
- AC-3: PASS — `bun test` passed 848 tests and 5,069 expectations. The existing Electrobun watcher
  completed lint, stylelint, TypeScript, Vite production build, native helper build, packaging, and
  C2-dev relaunch. Native C2-dev inspection showed current top-level Tasks as two-line rows with no
  workspace line. Repository lifecycle evidence is recorded by the final verification commands.

Residual risk: the exact `1:1 复刻 mole` fixture was not present in the current native data, so the
user's populated screenshot remains the final visual acceptance for that specific content.

## Review and release

Approval: the user approved implementation through direct screenshot feedback on 2026-09-01.
Release target: none.
Release identity: not applicable until released.
Smoke evidence: local rendered and native-window verification only.
Rollback: restore the ordinary top-level workspace line.
No release: no merge, deployment, or release was requested.

## Feedback

The supplied before/accepted-style crops are the visual source of truth.
