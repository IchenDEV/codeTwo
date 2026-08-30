---
id: change-2026-08-26-plugin-hot-reload
kind: change
schema: 2
status: closed
risk: low
owner: repository maintainers
approvers: "#decision-and-gates"
approved_at: 2026-08-26
created: 2026-08-26
updated: 2026-08-31
source: "#intent"
inputs: "#spec"
outputs: "#build"
scope: crates/plugins, apps/desktop, docs/reference/plugins.md
next_trigger: new plugin-development feedback or regression
verification_mode: human
verified_by: PR #110 reviewers
verified_at: 2026-08-29
---

# Plugin hot reload and developer tools

## Intent

Plugin authors needed an opt-in way to reload an installed Bundle while developing it without
restarting C2 or disturbing unrelated plugin runtimes. The original source artifacts were the
retired `docs/superpowers/specs` and `docs/superpowers/plans` files preserved in Git history at
commits `59ed917` and `289e6f0`.

## Spec

The accepted design required a persisted global developer-mode switch, a native watcher over the
installed Bundle directory, debounced reload of only affected Bundle runtimes, explicit status and
manual reload commands, and a quiet accessible Developer settings surface. Native Rust plugins
remain on the rebuild-and-restart path.

### Acceptance criteria

- [x] AC-1: Targeted reload replaces the affected Bundle runtime without replacing an unrelated runtime.
- [x] AC-2: Developer mode persists, starts/stops watching, and leaves manual reload available.
- [x] AC-3: Desktop bridge and settings expose status, reload, error, and WebView DevTools behavior.
- [x] AC-4: The installed-directory and native-plugin boundaries are documented.

## Decision and gates

The design and implementation were accepted through GitHub PR #110. Trust remains an execution
Gate for installed process runtimes, and this developer switch does not expand bundle permissions.

## Plan

The implementation was split across targeted runtime reload, watcher/commands, desktop event and
bridge wiring, Developer settings, documentation, and focused Rust/Bun verification.

## Build

Implementation commit `dc177195221760f56b7ce6ddfc57708ea862c6ac` added the feature. Later Core
boundary refactors moved shared composition to `crates/plugins` without introducing a second
plugin-development path. Current behavior is documented in [`docs/reference/plugins.md`](../../../reference/plugins.md#developing-an-installed-bundle).

## Verification

The implementation contains targeted reload and developer-mode integration coverage in
`crates/plugins/tests/project_bundle_runtime.rs`, plus bridge and rendered settings tests under
`apps/desktop/tests`. On 2026-08-29, focused desktop coverage passed 4 tests with 46 assertions.
The Rust reload/developer tests were attempted but did not start because the unchanged
`libghostty-vt-sys` build failed first with Zig's `use of undeclared identifier 'INFINITY'` error.
[PR #178's SDLC run](https://github.com/IchenDEV/codeTwo/actions/runs/33198244379) separately passed
the repository contract and base-diff Gate.

Verdict: verified.

### Acceptance evidence

- AC-1: PASS — [`project_bundle_runtime.rs`](../../../../crates/plugins/tests/project_bundle_runtime.rs) retains targeted runtime-reload coverage.
- AC-2: PASS — `bun test` focused desktop coverage passed 4 tests with 46 assertions on 2026-08-29.
- AC-3: PASS — [`apps/desktop/tests`](../../../../apps/desktop/tests) retains bridge and rendered settings coverage.
- AC-4: PASS — [`plugins.md`](../../../reference/plugins.md#developing-an-installed-bundle) documents the installed-directory and native-plugin boundaries.

Residual risk: focused Rust behavior remains unverified because of the recorded Ghostty/Zig build
blocker; repository integration evidence does not prove public product release.

## Review and release

PR #110 merged the implementation to `main` in commit `310b309`. This is repository integration
evidence, not a claim that the feature shipped in a notarized public C2 release.

No release: the historical change is closed as merged repository work without a versioned or
notarized product release claim.

## Feedback

The unchecked retired Plan was misleading after merge and referenced the old `superpowers:*`
execution system. This closed record replaces both legacy files while retaining their source
commits and current implementation evidence.
