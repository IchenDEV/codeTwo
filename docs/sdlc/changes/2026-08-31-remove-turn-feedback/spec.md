---
id: "2026-08-31-remove-turn-feedback"
stage: spec
schema: 3
status: accepted
owner: codex
created: 2026-08-31
based_on: intent.md
risk: low
approved_by: "[user via the 2026-08-31 direct removal request]"
approved_at: "2026-08-31"
---

# Spec: Remove turn feedback controls

## Requirements

Completed assistant responses no longer render helpful or unhelpful actions. Turn rendering no
longer accepts a feedback identity, reads or writes `codetwo.turnFeedback` local-storage entries,
or retains feedback-specific state and translations. Copying a response and branching from an
accepted response continue to work unchanged. Existing inert local-storage values may remain in a
user profile but no application code reads or mutates them.

## User experience

Not separately recorded in legacy change.md.

## Technical design

See Requirements and legacy Git history.

## Security and privacy

See migrated Decision and gates.

## Alternatives and non-goals

Not separately recorded in legacy change.md.

## Areas of concern

The user directly accepted this low-risk deletion on 2026-08-31. No security, data-migration,
release, or production Gate applies. Human review remains required before merge; no external
delivery action is authorized.

## Acceptance criteria

- [x] AC-1: Rendered assistant responses contain no thumbs-up or thumbs-down action while copy,
      branch, and timestamp remain present.
- [x] AC-2: Desktop source contains no turn-feedback state, persistence key, helpful/unhelpful
      translation, or feedback prop wiring.
- [x] AC-3: Focused tests, renderer build, real rendered inspection, and repository lifecycle
      checks pass without relevant warnings or errors.

## Decision

The user directly accepted this low-risk deletion on 2026-08-31. No security, data-migration,
release, or production Gate applies. Human review remains required before merge; no external
delivery action is authorized.
