---
id: "2026-08-31-organize-scripts"
stage: plan
schema: 3
status: accepted
owner: codex
created: 2026-08-31
based_on: spec.md
risk: medium
scope: script, .github, .codex, .agent-learning, AGENTS.md, README.md, docs, website
approved_by: "userthe current 2026-08-31 script-organization and minimal-test request"
approved_at: "2026-08-31"
---

# Plan: Organize scripts and trim Gate tests

## Files and ownership

script, .github, .codex, .agent-learning, AGENTS.md, README.md, docs, website

## Order of work

1. Move the four operational scripts into three purpose-based directories.
2. Consolidate repeated test fixtures into one readable high-value suite and delete the old tests.
3. Add a short script index and repair every caller and evidence path.
4. Run only the checks that protect moved commands, validators, shell parsing, and repository Gates.

Rollback is a repository revert restoring the flat paths and separate test files. No runtime data
or external cleanup is required.

## Test-first proof

See legacy Verification section.

## Visual or integration proof

See legacy Verification section.

## Risks and mitigations

See legacy Decision and gates.

## Rollback

See legacy Review and release.

## Deviations

[`script/README.md`](../../../../script/README.md) now exposes three direct categories. The macOS app
launcher moved to `dev/run.sh`, the host builder to `build/hosts.sh`, and the two Bun validators to
`verify/docs.ts` and `verify/sdlc.ts`. Moving the executable files preserved their modes and public
arguments; their repository-root calculation changed only from one parent to two parents.

The two prior Gate test files were replaced by one
[`verify/checks.test.ts`](../../../../script/verify/checks.test.ts). It reduces twenty individual
tests to five behavior-boundary tests and reduces test code from 528 to 330 lines. Shared fixture
creation is local to that file; no test library, compatibility wrapper, dependency, generated
matrix, or extra abstraction was added. The retained cases cover documentation drift, lifecycle
closure and authority, release/Incident/Eval evidence, committed branch schema/scope, and staged
plus untracked worktree scope.

Repository instructions, CI/release workflows, the local Codex run action, learning-loop commands,
README, website guidance, current contracts, and historical evidence now use the canonical paths.
CI invokes the consolidated suite once instead of twice. The validators' implementation and both
shell scripts are otherwise unchanged; no product runtime source or external state changed.

## Decision

The user's direct request approves this repository-local implementation. Risk is medium because CI
and local developer command paths move, even though runtime behavior does not. Commit, push, PR,
merge, release, deployment, and external mutation remain unauthorized.
