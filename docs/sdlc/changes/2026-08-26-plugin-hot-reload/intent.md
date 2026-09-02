---
id: "2026-08-26-plugin-hot-reload"
stage: intent
schema: 3
status: accepted
owner: repository maintainers
created: 2026-08-26
source: #intent
risk: low
approved_by: "#decision-and-gates"
approved_at: "2026-08-26"
---

# Intent: Plugin hot reload and developer tools

## Problem

Plugin authors needed an opt-in way to reload an installed Bundle while developing it without
restarting C2 or disturbing unrelated plugin runtimes. The original source artifacts were the
retired `docs/superpowers/specs` and `docs/superpowers/plans` files preserved in Git history at
commits `59ed917` and `289e6f0`.

## Proposed outcome

Plugin authors needed an opt-in way to reload an installed Bundle while developing it without

## Affected users and systems

Migrated from legacy change.md.

## Constraints

The design and implementation were accepted through GitHub PR #110. Trust remains an execution
Gate for installed process runtimes, and this developer switch does not expand bundle permissions.

## Out of scope

Not recorded in the legacy single-file Artifact.

## Success signals

See Spec acceptance criteria.

## Open questions

None recorded in migration.

## Decision

The design and implementation were accepted through GitHub PR #110. Trust remains an execution
Gate for installed process runtimes, and this developer switch does not expand bundle permissions.
