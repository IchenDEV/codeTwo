---
id: "2026-08-31-align-selectable-row-icons"
stage: spec
schema: 3
status: accepted
owner: codex
created: 2026-08-31
based_on: intent.md
risk: low
approved_by: "[user via the 2026-08-31 direct icon-alignment request]"
approved_at: "2026-08-31"
---

# Spec: Align selectable-row icons with their labels

## Requirements

The selection indicator and leading content use a line-height-sized alignment box so their visual
centers match the row's first-line label whether or not a description exists. Multiple leading
elements use the existing inline gap token, separating the Provider availability dot from its
brand mark. Selection, disabled behavior, accessible names, descriptions, and provider behavior
remain unchanged.

## User experience

Not separately recorded in legacy change.md.

## Technical design

See Requirements and legacy Git history.

## Security and privacy

See migrated Decision and gates.

## Alternatives and non-goals

Not separately recorded in legacy change.md.

## Areas of concern

The user directly accepted this low-risk visual correction on 2026-08-31. No security,
data-migration, release, or production Gate applies. Human review remains required before merge,
and no external delivery action is authorized.

## Acceptance criteria

- [x] AC-1: In description-bearing selectable rows, the selection indicator and provider mark are
      centered on the first-line label rather than its top edge.
- [x] AC-2: The Provider availability dot and brand mark have visible tokenized spacing while all
      rows retain consistent text and icon columns.
- [x] AC-3: Focused/full desktop tests, renderer build, desktop/narrow Browser inspection, and
      repository lifecycle checks pass.

## Decision

The user directly accepted this low-risk visual correction on 2026-08-31. No security,
data-migration, release, or production Gate applies. Human review remains required before merge,
and no external delivery action is authorized.
