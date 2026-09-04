---
id: "2026-09-02-sdlc-devflow-and-skill-integration"
stage: intent
schema: 3
status: accepted
owner: codex
created: 2026-09-02
source: current user request to improve SDLC referencing doubao-work-skin and sdlc-skill
risk: medium
approved_by: "userthe 2026-09-02 SDLC improvement request"
approved_at: "2026-09-02"
---

# Intent: SDLC devflow CLI and sdlc-skill integration

## Problem

The user asked to improve CodeTwo SDLC by referencing doubao-work-skin and the sdlc-skill project.
CodeTwo already has a strict schema-2 compact `change.md` contract and Bun checker, but day-to-day
change creation and approval recording still rely on manual template copying. The adjacent project
shows that a small `devflow` CLI and an operator-facing workflow guide make the chain easier for
humans and agents to run without splitting lifecycle state across four stage files.

The outcome is a repository-native devflow helper, a Chinese operator guide, a mapped artifact
contract reference aligned with sdlc-skill, and documented integration with the external skill—while
keeping `workflow.md` and `bun script/verify/sdlc.ts` as the only enforcement authority.

## Proposed outcome

The user asked to improve CodeTwo SDLC by referencing doubao-work-skin and the sdlc-skill project.

## Affected users and systems

Migrated from legacy change.md.

## Constraints

The current user request accepts this Intent and Spec. It authorizes repository-process
implementation only; merge, release, deployment, and external skill installation remain separate
Gates.

## Out of scope

Not recorded in the legacy single-file Artifact.

## Success signals

See Spec acceptance criteria.

## Open questions

None recorded in migration.

## Decision

The current user request accepts this Intent and Spec. It authorizes repository-process
implementation only; merge, release, deployment, and external skill installation remain separate
Gates.
