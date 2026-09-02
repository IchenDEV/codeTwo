---
id: "2026-09-02-four-stage-sdlc"
stage: plan
schema: 3
status: accepted
owner: codex
created: 2026-09-02
based_on: spec.md
risk: medium
scope: AGENTS.md, docs/catalog.json, docs/README.md, docs/sdlc/changes, docs/sdlc/development-workflow.md, docs/sdlc/references, docs/sdlc/templates, docs/sdlc/workflow.md, docs/sdlc/evals/ai-native-sdlc-gates.md, script/devflow, script/devflow.ts, script/devflow.test.ts, script/README.md, script/sdlc, script/verify, .github/pull_request_template.md
approved_by: "user via chat"
approved_at: "2026-09-02"
---

# Plan: Four-stage SDLC with mandatory approval

## Files and ownership

- Templates and docs under `docs/sdlc/`
- Checker and devflow under `script/`
- Catalog and AGENTS / PR template updates

## Order of work

1. Add stage parse/validate modules and rewrite `sdlc.ts` for schema 3.
2. Rewrite `devflow` for sequential stage creation and approval.
3. Migrate historical bundles; delete legacy `change.md`.
4. Update operator docs and tests.
5. Record verification evidence.

## Test-first proof

`bun test script/verify/checks.test.ts script/devflow.test.ts`

## Visual or integration proof

Not applicable — repository process change only.

## Risks and mitigations

- Broad migration diff — run migrate script once; checker validates all bundles.
- Worktree false positives on deleted `change.md` — ignore deletions in legacy path Gate.

## Rollback

Revert schema-3 commit; restore `change.md` templates and checker from prior revision.

## Deviations

None.

## Decision

Plan accepted for implementation.
