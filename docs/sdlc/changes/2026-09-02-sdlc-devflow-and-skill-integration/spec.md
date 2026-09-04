---
id: "2026-09-02-sdlc-devflow-and-skill-integration"
stage: spec
schema: 3
status: accepted
owner: codex
created: 2026-09-02
based_on: intent.md
risk: medium
approved_by: "userthe 2026-09-02 SDLC improvement request"
approved_at: "2026-09-02"
---

# Spec: SDLC devflow CLI and sdlc-skill integration

## Requirements

- Add `./script/devflow` with `new`, `approve`, `execute`, `status`, `incident`, `add-eval`,
  `validate`, and `check-pr` commands adapted to schema-2 bundle paths.
- Add [`development-workflow.md`](../../development-workflow.md) as the daily operator guide and
  [`references/artifact-contracts.md`](../../references/artifact-contracts.md) as the sdlc-skill mapping.
- Extend [`workflow.md`](../../workflow.md), [`AGENTS.md`](../../../../AGENTS.md), [`docs/README.md`](../../../README.md),
  and [`script/README.md`](../../../../script/README.md) to route through devflow and the external skill.
- Update [`catalog.json`](../../../catalog.json) for new documentation paths and incident/eval patterns.
- Do not replace the compact `change.md` model with doubao-work-skin's four-file stage split.

## User experience

Not separately recorded in legacy change.md.

## Technical design

See Requirements and legacy Git history.

## Security and privacy

See migrated Decision and gates.

## Alternatives and non-goals

Not separately recorded in legacy change.md.

## Areas of concern

The current user request accepts this Intent and Spec. It authorizes repository-process
implementation only; merge, release, deployment, and external skill installation remain separate
Gates.

## Acceptance criteria

- [x] AC-1: `./script/devflow new`, `approve --execute`, and `status` create and update a valid schema-2 change bundle.
- [x] AC-2: `bun script/verify/docs.ts`, `bun script/verify/sdlc.ts`, and `bun script/verify/sdlc.ts --worktree` pass with the new SDLC files in scope.
- [x] AC-3: Focused devflow tests pass and document approval, execute, and PR gate behavior.
- [x] AC-4: Operator and contract docs link correctly from the documentation map and lifecycle authority without duplicate registries.

## Decision

The current user request accepts this Intent and Spec. It authorizes repository-process
implementation only; merge, release, deployment, and external skill installation remain separate
Gates.
