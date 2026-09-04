---
id: "2026-09-01-unify-task-row-style"
stage: spec
schema: 3
status: accepted
owner: codex
created: 2026-09-01
based_on: intent.md
risk: low
approved_by: "[user]"
approved_at: "2026-09-01"
---

# Spec: Unify ordinary Task row styling

## Requirements

- Ordinary Tasks without pull-request state use the same two lines whether or not they sit beneath
  a Project heading.
- Checkout/worktree metadata stays at the end of the summary line.
- A pull-request Task may retain its dedicated provenance line because it carries additional
  delivery state.
- Project assignment, workspace paths, actions, accessibility, ordering, and drag/drop do not
  change.

## User experience

Not separately recorded in legacy change.md.

## Technical design

See Requirements and legacy Git history.

## Security and privacy

See migrated Decision and gates.

## Alternatives and non-goals

Not separately recorded in legacy change.md.

## Areas of concern

The direct screenshot request approves this low-risk presentation correction. Ponytail selects the
existing provenance placement condition; no new row variant or state is introduced. The previous
decision to retain a workspace line for ordinary ungrouped Tasks is superseded by this request.

## Acceptance criteria

- [x] AC-1: An ordinary top-level Task renders only title and summary lines.
- [x] AC-2: Its summary retains Provider, age, and checkout/worktree metadata.
- [x] AC-3: Focused and full tests, native rebuild, and repository lifecycle checks pass.

## Decision

The direct screenshot request approves this low-risk presentation correction. Ponytail selects the
existing provenance placement condition; no new row variant or state is introduced. The previous
decision to retain a workspace line for ordinary ungrouped Tasks is superseded by this request.
