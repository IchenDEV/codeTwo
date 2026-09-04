---
id: "2026-08-30-ai-native-sdlc-migration"
stage: intent
schema: 3
status: accepted
owner: repository maintainers
created: 2026-08-30
source: current user request to apply the ai-native-sdlc skill and remove the existing lifecycle
risk: medium
approved_by: "userthe 2026-08-30 implementation request"
approved_at: "2026-08-30"
---

# Intent: Replace the repository lifecycle with the AI-native SDLC contract

## Problem

The user explicitly requested applying the current `ai-native-sdlc` rules to CodeTwo and removing
the existing lifecycle implementation. The repository already has useful CI, release, and
historical change evidence, but its checker mainly validates document shape. It can accept a
material build accompanied by an unaccepted Artifact and does not deterministically close
verification, release, Incident, or Eval gates.

The outcome is one project-specific lifecycle that preserves real historical evidence, removes the
superseded bootstrap implementation, and makes advancement depend on observable evidence and human
authorization rather than prose alone. Product behavior and external production state are out of
scope.

## Proposed outcome

The user explicitly requested applying the current `ai-native-sdlc` rules to CodeTwo and removing

## Affected users and systems

Migrated from legacy change.md.

## Constraints

The current user request accepts the migration Intent and the stated removal constraint. It does
not authorize creating or merging a pull request, changing GitHub branch protection, dispatching a
release, deploying documentation, or mutating production. Those remain human or external Gates.

## Out of scope

Not recorded in the legacy single-file Artifact.

## Success signals

See Spec acceptance criteria.

## Open questions

None recorded in migration.

## Decision

The current user request accepts the migration Intent and the stated removal constraint. It does
not authorize creating or merging a pull request, changing GitHub branch protection, dispatching a
release, deploying documentation, or mutating production. Those remain human or external Gates.
