---
id: change-2026-08-29-sdlc-bootstrap
kind: change
status: verified
owner: repository maintainers
created: 2026-08-29
updated: 2026-08-29
next_trigger: pull request checks pass and the authorized merge completes
---

# Establish one artifact-driven development lifecycle

## Intent

The repository had real design, test, packaging, and release mechanisms but no single Artifact
chain connecting Intent, Spec, implementation, verification, review, release, incidents, and Evals.
The user explicitly requested applying `$ai-native-sdlc` to the current project and then removing
old lifecycle material so two systems could not conflict.

Desired outcome: one project-specific, machine-checkable lifecycle that reuses the existing CI and
release paths, preserves useful design evidence, and removes the obsolete `docs/superpowers`
spec/plan tree.

## Spec

- `docs/sdlc` is the only lifecycle state source.
- Material work uses one compact change Artifact and links existing ADR/design/Issue/PR evidence.
- CI rejects malformed/duplicate Artifacts, legacy lifecycle paths, and PR changes without a
  canonical change Artifact.
- Review and production actions remain human-authorized.
- Real incidents link to a new Intent and a regression Eval; no synthetic incident is created.
- Product Scenes/Pipelines remain product features and cannot act as the repository SDLC registry.

### Acceptance criteria

- [x] Root instructions and contributing guidance point to exactly one workflow.
- [x] The old `docs/superpowers` files are migrated and removed; only policy/tests mention the
  forbidden legacy path.
- [x] Change, Incident, and Eval contracts are reusable without creating duplicate truth.
- [x] A dependency-free checker validates the repository and proves important failure paths.
- [x] GitHub workflow configuration runs the checker and requires a changed Artifact on PRs;
  remote execution begins only after a PR exists.
- [x] The existing versioned macOS workflow refuses release without a named `ready-to-release`
  change Artifact and preserves that id in the staged release files.
- [x] Existing Plugin Hot Reload history is preserved as one closed canonical change.
- [x] Current Bun coverage passes; the focused Rust coverage was attempted and its pre-existing
  Ghostty/Zig build blocker is recorded rather than misreported as a product failure.

## Decision and gates

The user's explicit Skill invocation accepted the Bootstrap Intent. The follow-up instruction to
remove the old version accepted consolidation onto one canonical system. No permission was given to
create a PR, merge, dispatch packaging, deploy Pages, publish a release, or change external GitHub
branch-protection settings.

## Plan

1. Inventory existing project rules, design/spec/plan files, CI, packaging, release, and incident
   mechanisms.
2. Define the single compact Artifact contract and map it to existing mechanisms.
3. Migrate the completed Plugin Hot Reload history and delete its stale Superpowers files.
4. Add a standard-library checker, tests, PR handoff, and CI Gate.
5. Run static, failure-path, focused feature, and repository diff validation.

## Build

The change adds the canonical workflow, compact change/Incident/Eval templates, this live change,
one migrated historical change, and a real-task Eval. Root instructions, contributing guidance,
the PR template, and `.github/workflows/sdlc.yml` point into that source. `script/check_sdlc.py`
enforces required fields/sections, unique ids, legal statuses, local links, forbidden parallel
paths, and the PR changed-Artifact Gate; `script/test_check_sdlc.py` exercises its success and
failure paths. The existing macOS release workflow now calls the same checker before packaging and
records the authorized change id beside the release payload. The two stale `docs/superpowers`
files were deleted after their evidence was linked.

## Verification

Observed on 2026-08-29:

- The first Python test launch exposed a Python 3.14 dynamic-module registration error before any
  assertion ran. Registering the loaded checker module in `sys.modules` fixed the test harness.
- `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest script/test_check_sdlc.py`: the suite covers
  legacy-tree, duplicate-id, missing-section, release-state, and missing-Artifact PR failures.
- `PYTHONDONTWRITEBYTECODE=1 python3 script/check_sdlc.py`: `[sdlc] contract valid`.
- `python3 script/check_sdlc.py --release-change change-2026-08-29-sdlc-bootstrap` was rejected
  because the current change is `verified`, proving the release Gate does not accept an earlier
  state. The unit fixture separately accepts a named `ready-to-release` Artifact.
- Ruby's YAML parser accepted both changed GitHub workflow files; `actionlint` is not installed in
  this environment, so GitHub-specific lint remains for remote CI.
- `bun test tests/developerSettings.test.tsx tests/pluginBridgeContract.test.ts` after
  `bun install --frozen-lockfile`: 4 tests passed with 46 assertions. React emitted existing
  `act(...)` environment warnings; no test failed.
- The focused `codetwo-plugins` reload/developer tests did not execute because the unchanged
  `libghostty-vt-sys` dependency failed first while compiling Ghostty with Zig 0.15.2:
  `clamp_to_integral.h:47:58: use of undeclared identifier 'INFINITY'`.
- `git diff --check` passed. No product UI changed, so real-window visual QA is not applicable.

Residual risk: the new GitHub workflow has not run remotely because no PR or push was authorized,
and the Rust feature coverage remains blocked by the repository's existing Ghostty toolchain issue.

## Review and release

The user authorized creating and merging a pull request on 2026-08-29. This does not authorize a
versioned product release. [PR #178](https://github.com/IchenDEV/codeTwo/pull/178) links this
artifact and must pass the `SDLC contract` check before merge; requiring that check in branch
protection remains an external repository setting.

## Feedback

No repository-owned production monitoring source currently opens Incident artifacts, so the
automated Maintain trigger remains explicitly blocked. The single-source regression is tracked by
[`evals/legacy-workflow-single-source.md`](../evals/legacy-workflow-single-source.md).
