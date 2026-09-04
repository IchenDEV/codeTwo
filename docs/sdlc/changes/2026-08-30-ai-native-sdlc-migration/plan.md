---
id: "2026-08-30-ai-native-sdlc-migration"
stage: plan
schema: 3
status: accepted
owner: repository maintainers
created: 2026-08-30
based_on: spec.md
risk: medium
scope: AGENTS.md, README.md, docs/sdlc, script/verify/sdlc.ts, script/verify/checks.test.ts, .github
approved_by: "userthe 2026-08-30 implementation request"
approved_at: "2026-08-30"
---

# Plan: Replace the repository lifecycle with the AI-native SDLC contract

## Files and ownership

AGENTS.md, README.md, docs/sdlc, script/verify/sdlc.ts, script/verify/checks.test.ts, .github

## Order of work

1. Inventory the existing Artifact, CI, review, release, Incident, and Eval mechanisms.
2. Replace the workflow and templates while preserving authoritative historical evidence.
3. Strengthen the Bun/TypeScript checker and its isolated failure-path tests.
4. Remove the superseded bootstrap/Eval pair and add a real regression Eval for the new contract.
5. Run focused tests, live validation, workflow parsing, and diff checks; record actual results.

## Test-first proof

See legacy Verification section.

## Visual or integration proof

See legacy Verification section.

## Risks and mitigations

See legacy Decision and gates.

## Rollback

See legacy Review and release.

## Deviations

The migration replaces [`workflow.md`](../../workflow.md), all three templates, the Bun/TypeScript
checker and tests, the PR handoff, the `SDLC contract` workflow, and the versioned macOS release
Gate. Root instructions and README point to the same authority. Existing product change Artifacts
were migrated to the common metadata and explicit verification verdict without rewriting their
historical evidence.

The superseded `2026-08-29-sdlc-bootstrap.md` and `legacy-workflow-single-source.md` were removed.
Their durable single-source and failure-path intent is replaced by the current workflow and
[`ai-native-sdlc-gates.md`](../../evals/ai-native-sdlc-gates.md). No product code or UI changed.

## Decision

The current user request accepts the migration Intent and the stated removal constraint. It does
not authorize creating or merging a pull request, changing GitHub branch protection, dispatching a
release, deploying documentation, or mutating production. Those remain human or external Gates.
