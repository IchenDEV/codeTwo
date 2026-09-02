---
id: "2026-08-31-organize-scripts"
stage: spec
schema: 3
status: accepted
owner: codex
created: 2026-08-31
based_on: intent.md
risk: medium
approved_by: "userthe current 2026-08-31 script-organization and minimal-test request"
approved_at: "2026-08-31"
---

# Spec: Organize scripts and trim Gate tests

## Requirements

- Keep only a short index at the `script/` root.
- Put the app launcher under `dev/`, the host builder under `build/`, and deterministic repository
  checks under `verify/`.
- Preserve launcher, builder, docs-checker, and SDLC-checker behavior and command arguments.
- Replace the two separate test files with one focused suite that covers the valid path and the
  essential fail-closed classes without retaining one test per validation rule.
- Update every repository-owned command, workflow, environment, document, and historical evidence
  reference to the canonical new path.
- Add no dependency, compatibility wrapper, framework, or generated test matrix.

## User experience

Not separately recorded in legacy change.md.

## Technical design

See Requirements and legacy Git history.

## Security and privacy

See migrated Decision and gates.

## Alternatives and non-goals

Not separately recorded in legacy change.md.

## Areas of concern

The user's direct request approves this repository-local implementation. Risk is medium because CI
and local developer command paths move, even though runtime behavior does not. Commit, push, PR,
merge, release, deployment, and external mutation remain unauthorized.

## Acceptance criteria

- [x] AC-1: `script/` contains only its index and the `dev/`, `build/`, and `verify/` categories.
- [x] AC-2: Every executable/checker retains its public arguments and all repository callers use the new path.
- [x] AC-3: One compact test entry covers docs acceptance/rejection, SDLC acceptance/closure, branch scope, worktree scope, and release/incident/Eval fail-closed behavior.
- [x] AC-4: No obsolete script path remains and no runtime product source changes beyond path-bearing comments or documentation.
- [x] AC-5: The focused suite, live docs Gate, live SDLC Gate, worktree Gate, shell syntax, diff checks, and isolated committed-diff check pass.

## Decision

The user's direct request approves this repository-local implementation. Risk is medium because CI
and local developer command paths move, even though runtime behavior does not. Commit, push, PR,
merge, release, deployment, and external mutation remain unauthorized.
