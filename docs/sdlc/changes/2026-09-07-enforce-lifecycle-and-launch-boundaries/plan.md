---
id: "2026-09-07-enforce-lifecycle-and-launch-boundaries"
stage: plan
schema: 3
status: accepted
owner: codex
created: "2026-09-07"
based_on: spec.md
risk: "medium"
scope: AGENTS.md, README.md, script/dev/run.sh, script/dev/run.test.ts, script/verify/stage-bundle.ts, script/verify/sdlc.ts, script/verify/checks.test.ts, script/devflow.ts, script/devflow.test.ts, docs/sdlc/workflow.md, docs/sdlc/development-workflow.md, docs/sdlc/references/artifact-contracts.md, docs/sdlc/evals/ai-native-sdlc-gates.md, docs/sdlc/changes/2026-09-02-four-stage-sdlc/verification.md, docs/sdlc/changes/2026-09-07-enforce-lifecycle-and-launch-boundaries
approved_by: "Chen Li"
approved_at: 2026-09-07
---

# Plan: Enforce Lifecycle And Launch Boundaries

## Files and ownership

Codex owns the exact paths in scope. The single historical verification edit combines differing same-result evidence without changing outcomes or approval metadata.

## Order of work

Add failing regressions, fix shared validation and launch paths, align documentation, then run the bounded acceptance checks.

## Test-first proof

Extend existing Gate tests using disposable repositories. Add a launcher harness with mocked process/build/log commands. Cover both refusal and valid continuation.

## Visual or integration proof

Exercise the actual shell entrypoint in a disposable checkout. No production app or provider is started.

## Risks and mitigations

Keep release checks and native ownership requirements intact. Reuse parsed record equality for exact historical duplicates and retain both descriptions when combining one historical document.

## Rollback

Revert only this bundle’s scoped edits, preserving the preceding scaffold cleanup and all application data.

## Deviations

Exact duplicate historical evidence is accepted as one record to avoid rewriting 80 unrelated bundles. No conflicting result is tolerated.

## Decision

Chen Li’s “开始修复” on 2026-09-07 approves the proposed five fixes and scoped implementation. Merge, release, and running or stopping user instances remain outside this task.
