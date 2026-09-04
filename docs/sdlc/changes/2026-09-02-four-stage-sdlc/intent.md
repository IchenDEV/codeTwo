---
id: "2026-09-02-four-stage-sdlc"
stage: intent
schema: 3
status: accepted
owner: codex
created: 2026-09-02
source: user request to adopt four stage files with mandatory approval aligned to doubao-work-skin
risk: medium
approved_by: "user via chat"
approved_at: "2026-09-02"
---

# Intent: Four-stage SDLC with mandatory approval

## Problem

CodeTwo SDLC used a single schema-2 `change.md` per bundle. The user asked to switch to four stage
files (`intent.md`, `spec.md`, `plan.md`, `verification.md`) and enforce Intent → Spec → Plan
approval before implementation or merge, matching the doubao-work-skin model while keeping this
repository's Bun checker as the enforcement authority.

## Proposed outcome

Schema 3 bundles replace legacy `change.md`. `devflow` creates stages sequentially; `sdlc.ts`
rejects bundles missing accepted upstream stages, uncovered PR paths, or legacy single-file records.
Historical bundles migrate via `script/sdlc/migrate-bundles.ts`.

## Affected users and systems

Repository maintainers, agents using `devflow`, CI `SDLC contract` job, PR authors, and lifecycle
Eval fixtures.

## Constraints

Keep `workflow.md` as lifecycle authority. Do not add parallel spec/plan trees. User request approves
Intent and Spec for repository-process implementation only; merge and release remain separate Gates.

## Out of scope

Desktop product features in the same worktree (task board UI) unless explicitly added to plan scope.
External skill installation.

## Success signals

- `bun test script/verify/checks.test.ts` and `script/devflow.test.ts` pass.
- `bun script/verify/docs.ts` and `bun script/verify/sdlc.ts` pass on committed tree.
- Operator docs describe four stages and mandatory approval.

## Open questions

None.

## Decision

The user request accepts this Intent and Spec for repository SDLC implementation.
