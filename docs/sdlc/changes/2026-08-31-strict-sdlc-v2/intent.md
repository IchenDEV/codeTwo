---
id: "2026-08-31-strict-sdlc-v2"
stage: intent
schema: 3
status: accepted
owner: codex
created: 2026-08-31
source: current user request, informed by Codex task 01a05173-aa39-7963-b3f4-d7d66616e53b
risk: medium
approved_by: "userthe current 2026-08-31 implementation request"
approved_at: "2026-08-31"
---

# Intent: Harden CodeTwo's AI-native SDLC contract

## Problem

CodeTwo already has one canonical lifecycle, a Bun checker, CI, release gating, Incident templates,
and a real-task Eval. The current contract is still looser than the referenced theme workflow in
three observable ways: risk is prose rather than machine-readable state, one unrelated changed
Artifact can cover arbitrary branch files, and a checked acceptance list can be marked verified
without evidence mapped to each criterion. The normal local checker also cannot apply the branch
Gate to uncommitted work before handoff.

The desired outcome is a stricter, versioned contract for every new or updated change Artifact
without rewriting historical evidence merely to satisfy a new template. Product behavior and
external GitHub settings are not part of this change.

## Proposed outcome

CodeTwo already has one canonical lifecycle, a Bun checker, CI, release gating, Incident templates,

## Affected users and systems

Migrated from legacy change.md.

## Constraints

The user's current direct implementation request accepts this Intent and its observable Spec, with
the user as named approver. It authorizes repository implementation and local verification only.
Merge, push, pull-request creation, release, deployment, external branch-protection changes, and
production mutation remain separate human or external Gates.

The change is medium risk because it modifies the repository enforcement path and can block later
work, but it does not alter product runtime, user data, credentials, signing, or production state.

## Out of scope

Not recorded in the legacy single-file Artifact.

## Success signals

See Spec acceptance criteria.

## Open questions

None recorded in migration.

## Decision

The user's current direct implementation request accepts this Intent and its observable Spec, with
the user as named approver. It authorizes repository implementation and local verification only.
Merge, push, pull-request creation, release, deployment, external branch-protection changes, and
production mutation remain separate human or external Gates.

The change is medium risk because it modifies the repository enforcement path and can block later
work, but it does not alter product runtime, user data, credentials, signing, or production state.
