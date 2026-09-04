---
id: "2026-09-02-sdlc-devflow-and-skill-integration"
stage: plan
schema: 3
status: accepted
owner: codex
created: 2026-09-02
based_on: spec.md
risk: medium
scope: script/devflow.ts, script/devflow, script/README.md, script/devflow.test.ts, docs/sdlc/development-workflow.md, docs/sdlc/references/artifact-contracts.md, docs/sdlc/workflow.md, docs/sdlc/changes/2026-09-02-sdlc-devflow-and-skill-integration, docs/catalog.json, docs/README.md, AGENTS.md
approved_by: "userthe 2026-09-02 SDLC improvement request"
approved_at: "2026-09-02"
---

# Plan: SDLC devflow CLI and sdlc-skill integration

## Files and ownership

script/devflow.ts, script/devflow, script/README.md, script/devflow.test.ts, docs/sdlc/development-workflow.md, docs/sdlc/references/artifact-contracts.md, docs/sdlc/workflow.md, docs/sdlc/changes/2026-09-02-sdlc-devflow-and-skill-integration, docs/catalog.json, docs/README.md, AGENTS.md

## Order of work

1. Implement `script/devflow.ts` and executable wrapper for bundle-centric commands.
2. Add operator guide and artifact-contract reference under `docs/sdlc/`.
3. Update lifecycle authority, root instructions, catalog, and script index.
4. Add focused tests and run documentation plus SDLC verification.

Rollback is a repository revert restoring manual-only workflow documentation.

## Test-first proof

See legacy Verification section.

## Visual or integration proof

See legacy Verification section.

## Risks and mitigations

See legacy Decision and gates.

## Rollback

See legacy Review and release.

## Deviations

Added [`script/devflow.ts`](../../../../script/devflow.ts) and executable [`script/devflow`](../../../../script/devflow)
with bundle-centric commands. Added [`development-workflow.md`](../../development-workflow.md) and
[`references/artifact-contracts.md`](../../references/artifact-contracts.md). Updated
[`workflow.md`](../../workflow.md), [`catalog.json`](../../../catalog.json), [`docs/README.md`](../../../README.md),
[`AGENTS.md`](../../../../AGENTS.md), and [`script/README.md`](../../../../script/README.md). Added
[`script/devflow.test.ts`](../../../../script/devflow.test.ts).

## Decision

The current user request accepts this Intent and Spec. It authorizes repository-process
implementation only; merge, release, deployment, and external skill installation remain separate
Gates.
