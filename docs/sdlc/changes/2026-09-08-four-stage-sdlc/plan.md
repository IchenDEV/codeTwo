---
id: 2026-09-08-four-stage-sdlc
schema: 5
stage: plan
status: accepted
owner: codex
created: 2026-09-08
based_on: spec.md
scope: AGENTS.md, .agents/skills/codetwo-develop/templates/, .agents/skills/codetwo-develop/references/workflow.md, .github/pull_request_template.md, .github/workflows/sdlc.yml, script/devflow.ts, script/devflow.test.ts, script/verify/stage-bundle.ts, script/verify/docs.ts, script/verify/sdlc.ts, script/verify/four-stage.test.ts, docs/sdlc/references/artifact-contracts.md, docs/sdlc/evals/ai-native-sdlc-gates.md, docs/sdlc/changes/2026-09-08-four-stage-sdlc/
---

# Plan: Four-stage SDLC

## Plan

Codex owns the CLI, templates, validators, documentation, and command-level regressions. The independent verifier owns `script/verify/four-stage.test.ts` and checks risk, stage readiness, actual Git diff scope, evidence failures, and release boundaries using disposable repositories.

Reuse historical validators for scope, AC-N mapping, and release facts; add only the new staged contract and template generation. Synchronize repository entry instructions, canonical workflow, PR links, and CI with the selected contract.

Run `bun test script/verify/checks.test.ts script/verify/four-stage.test.ts script/devflow.test.ts`, `bun script/verify/docs.ts`, `bun script/verify/sdlc.ts --worktree`, and `git diff --check`. These changes affect lifecycle authorization and tooling, so independent integration fixtures are required. Product UI rendering, Rust compilation, native app launch, packaging, and live account tests are not applicable because no product code changes in this change.

Rollback: Revert this change's CLI, validator, template, instruction, and workflow edits together. Historical records stay unchanged; schema-5 records created with this version need its checker until migrated deliberately.
