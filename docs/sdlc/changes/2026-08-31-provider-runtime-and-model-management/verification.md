---
id: "2026-08-31-provider-runtime-and-model-management"
stage: verification
schema: 3
status: passed
owner: codex
created: 2026-08-31
based_on: plan.md
commit: ""
verification_mode: owner
verified_by: "codex"
verified_at: "2026-08-31"
release_target: none
release_identity: "not applicable until released."
---

# Verification: Improve Provider runtime and model management

## Automated checks

Verdict: verified.

The verdict covers the requested single-instance Provider runtime, model management, Zig repair,
and rendered desktop behavior. It does not claim that unrelated baseline tests, release packaging,
signing, notarization, or multi-instance isolation are ready.

### Acceptance evidence

- AC-1: PASS — `cargo test -p codetwo-core provider_lifecycle --lib` passed all 7 focused tests,
  including durable overrides, launch application, supported homes, and fail-closed validation.
- AC-2: PASS — `bun test tests/providerSettingsRendered.test.tsx` passed all 3 rendered Provider
  lifecycle and configuration interactions; the previously captured native app and Browser checks
  verified the expandable grouped layout against CodeTwo's own settings anatomy.
- AC-3: PASS — `bun test tests/modelPreferences.test.ts tests/modelFavorites.test.ts
  tests/reasoningScaleRendered.test.tsx` passed storage, Provider scoping, favorites-first ordering,
  visibility, search, selection, effort, busy-state, and accessibility coverage.
- AC-4: PASS —
  `cargo test -p codetwo-plugins --test app_graph provider_configuration_command_returns_only_safe_runtime_metadata -- --exact`
  passed and asserted that environment values are absent from the returned configuration.
- AC-5: PASS — after `cargo clean -p libghostty-vt-sys`, the focused plugin test rebuilt Ghostty from
  scratch in 2m19s and passed. `bun test --reporter=dots` passed 785 tests across 136 files with 0
  failures and 3,728 assertions. `bun run build:renderer` passed ESLint, Stylelint, TypeScript, and
  the Vite production build. `bun script/verify/sdlc.ts --worktree` and `git diff --check` passed.
- AC-6: PASS — the packaged integration-worktree app and `Codex in-app Browser` acceptance verified runtime
  command, configuration directory, arguments, environment-name security copy, seven discovered
  Codex models, favorites, exact `terra` search filtering, light and dark appearance, and a
  760-by-720 narrow layout with no horizontal overflow; screenshots were captured during acceptance.

The unfiltered `cargo test --workspace` passed the 492-test Core library and all 17 Provider
application-graph tests, then stopped on
`an_untrusted_bundle_that_ships_a_process_is_not_started`. That assertion failure was reproduced
from latest `origin/main` in an independent worktree and Cargo target. A follow-up workspace run
skipping only that baseline failure completed the remaining plugin suites, then reached the existing
`terminal_attach_io_reattach_and_kill` PTY-output timeout; the timeout was also reproduced from
latest `origin/main` in its independent target. `cargo test -p codetwo-tui` passed all 27 tests and
`cargo test --doc --workspace` passed all 5 doc tests.

`cargo fmt --check` reports broad pre-existing differences beginning in
`crates/core/examples/usage.rs`; latest `origin/main` reports the same differences in an independent
worktree. This PR does not include unrelated repository-wide formatting churn. Existing React
`act(...)` warnings and the Vite large-chunk advisory remain non-failing baseline output.

Residual risk: favorites and model visibility intentionally remain local to one renderer profile.
The acceptance launch isolated application data but used the shared development bundle identity
because the repository's full `CODETWO_DEV_PROFILE` contract is not implemented. The dev package is
not release-signed or notarized. A worktree-derived data path exceeded the Unix socket `SUN_LEN`
limit during an initial safe launch, so acceptance used the explicit short isolated directory
`/tmp/c2-provider-qa-f8565-20260831/data`. The two unrelated baseline Rust failures above remain for
separate remediation.

## Behavioral evidence

Verdict: verified.

The verdict covers the requested single-instance Provider runtime, model management, Zig repair,
and rendered desktop behavior. It does not claim that unrelated baseline tests, release packaging,
signing, notarization, or multi-instance isolation are ready.

### Acceptance evidence

- AC-1: PASS — `cargo test -p codetwo-core provider_lifecycle --lib` passed all 7 focused tests,
  including durable overrides, launch application, supported homes, and fail-closed validation.
- AC-2: PASS — `bun test tests/providerSettingsRendered.test.tsx` passed all 3 rendered Provider
  lifecycle and configuration interactions; the previously captured native app and Browser checks
  verified the expandable grouped layout against CodeTwo's own settings anatomy.
- AC-3: PASS — `bun test tests/modelPreferences.test.ts tests/modelFavorites.test.ts
  tests/reasoningScaleRendered.test.tsx` passed storage, Provider scoping, favorites-first ordering,
  visibility, search, selection, effort, busy-state, and accessibility coverage.
- AC-4: PASS —
  `cargo test -p codetwo-plugins --test app_graph provider_configuration_command_returns_only_safe_runtime_metadata -- --exact`
  passed and asserted that environment values are absent from the returned configuration.
- AC-5: PASS — after `cargo clean -p libghostty-vt-sys`, the focused plugin test rebuilt Ghostty from
  scratch in 2m19s and passed. `bun test --reporter=dots` passed 785 tests across 136 files with 0
  failures and 3,728 assertions. `bun run build:renderer` passed ESLint, Stylelint, TypeScript, and
  the Vite production build. `bun script/verify/sdlc.ts --worktree` and `git diff --check` passed.
- AC-6: PASS — the packaged integration-worktree app and `Codex in-app Browser` acceptance verified runtime
  command, configuration directory, arguments, environment-name security copy, seven discovered
  Codex models, favorites, exact `terra` search filtering, light and dark appearance, and a
  760-by-720 narrow layout with no horizontal overflow; screenshots were captured during acceptance.

The unfiltered `cargo test --workspace` passed the 492-test Core library and all 17 Provider
application-graph tests, then stopped on
`an_untrusted_bundle_that_ships_a_process_is_not_started`. That assertion failure was reproduced
from latest `origin/main` in an independent worktree and Cargo target. A follow-up workspace run
skipping only that baseline failure completed the remaining plugin suites, then reached the existing
`terminal_attach_io_reattach_and_kill` PTY-output timeout; the timeout was also reproduced from
latest `origin/main` in its independent target. `cargo test -p codetwo-tui` passed all 27 tests and
`cargo test --doc --workspace` passed all 5 doc tests.

`cargo fmt --check` reports broad pre-existing differences beginning in
`crates/core/examples/usage.rs`; latest `origin/main` reports the same differences in an independent
worktree. This PR does not include unrelated repository-wide formatting churn. Existing React
`act(...)` warnings and the Vite large-chunk advisory remain non-failing baseline output.

Residual risk: favorites and model visibility intentionally remain local to one renderer profile.
The acceptance launch isolated application data but used the shared development bundle identity
because the repository's full `CODETWO_DEV_PROFILE` contract is not implemented. The dev package is
not release-signed or notarized. A worktree-derived data path exceeded the Unix socket `SUN_LEN`
limit during an initial safe launch, so acceptance used the explicit short isolated directory
`/tmp/c2-provider-qa-f8565-20260831/data`. The two unrelated baseline Rust failures above remain for
separate remediation.

## Visual evidence

See bundle evidence/ when present.

## Security and privacy evidence

Not separately recorded unless present in legacy Verification.

## Deviations and residual risk

Residual risk: favorites and model visibility intentionally remain local to one renderer profile.

## Verdict

Verdict: verified..

## Review and release

Approval: implementation verified; human product and code review remain pending in the Draft PR.
Release target: none.
Release identity: not applicable until released.
Smoke evidence: not applicable until released.
Rollback: revert the Provider runtime document and command, renderer settings and picker
integration, local preference modules, and vendored compatibility patch; existing Provider
enablement, discovered catalogues, and session data remain readable.
No release: this change prepares a Draft PR for review; no merge, release, or deployment is
authorized.

Preparing this section does not authorize merge, deployment, release, or production mutation.

## Feedback

The UI follows the user's explicit feedback that T3's settings layout should not be copied. Further
human review feedback will be recorded in this Artifact or a follow-up change.
