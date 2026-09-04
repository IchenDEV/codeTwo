---
id: "2026-08-31-align-selectable-row-icons"
stage: intent
schema: 3
status: accepted
owner: codex
created: 2026-08-31
source: direct user feedback that the icon is crooked and not aligned
risk: low
approved_by: "[user via the 2026-08-31 direct icon-alignment request]"
approved_at: "2026-08-31"
---

# Intent: Align selectable-row icons with their labels

## Problem

The user reported that the icon in the recently rendered Provider picker looked crooked and out of
alignment. Browser geometry confirmed that description-bearing `SelectableRow` children were
top-aligned: the 14 px provider mark sat 3.5 px above the center of the 21 px first-line label, and
the availability dot touched the provider mark with zero spacing. The desired result is a stable,
visually centered first-line icon column without redesigning the menu or changing provider state.
This request does not authorize a pull request, merge, release, or deployment.

## Proposed outcome

The user reported that the icon in the recently rendered Provider picker looked crooked and out of

## Affected users and systems

Migrated from legacy change.md.

## Constraints

The user directly accepted this low-risk visual correction on 2026-08-31. No security,
data-migration, release, or production Gate applies. Human review remains required before merge,
and no external delivery action is authorized.

## Out of scope

Not recorded in the legacy single-file Artifact.

## Success signals

See Spec acceptance criteria.

## Open questions

None recorded in migration.

## Decision

The user directly accepted this low-risk visual correction on 2026-08-31. No security,
data-migration, release, or production Gate applies. Human review remains required before merge,
and no external delivery action is authorized.
