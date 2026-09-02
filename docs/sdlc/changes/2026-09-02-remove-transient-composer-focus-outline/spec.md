---
id: "2026-09-02-remove-transient-composer-focus-outline"
stage: spec
schema: 3
status: accepted
owner: codex
created: 2026-09-02
based_on: intent.md
risk: low
approved_by: "userthe direct 2026-09-02 Browser comment"
approved_at: "2026-09-02"
---

# Spec: Remove the transient composer blue focus outline

## Requirements

When focus is anywhere inside a transient composer, its existing card uses the design system's
neutral hover-fill token instead of the blue inset focus-ring utility. The textarea retains its
caret and keyboard behavior, and nested buttons retain their own focus-visible treatment. The same
class contract applies to Quick Chat and Side Chat.

## User experience

Not separately recorded in legacy change.md.

## Technical design

See Requirements and legacy Git history.

## Security and privacy

See migrated Decision and gates.

## Alternatives and non-goals

Not separately recorded in legacy change.md.

## Areas of concern

The user's direct Browser comment accepts this low-risk visual correction. Ponytail selected one
shared class replacement and one existing regression update; no new component, option, or Web UI
branch is justified.

Human review remains required before merge. Merge, release, deployment, and publication are not
authorized.

## Acceptance criteria

- [x] AC-1: Focused Quick Chat and Side Chat composer cards show no blue outline and retain a
      visible neutral surface state, verified by a focused rendered test and live Browser inspection.
- [x] AC-2: The shared transient composer remains keyboard-operable and the main task Composer's
      focus contract is unchanged, verified by targeted source and rendered tests.

## Decision

The user's direct Browser comment accepts this low-risk visual correction. Ponytail selected one
shared class replacement and one existing regression update; no new component, option, or Web UI
branch is justified.

Human review remains required before merge. Merge, release, deployment, and publication are not
authorized.
