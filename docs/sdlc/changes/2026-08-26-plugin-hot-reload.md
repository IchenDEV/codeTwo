---
id: change-2026-08-26-plugin-hot-reload
kind: change
status: closed
owner: repository maintainers
created: 2026-08-26
updated: 2026-08-29
next_trigger: new plugin-development feedback or regression
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

- [x] Targeted reload replaces the affected Bundle runtime without replacing an unrelated runtime.
- [x] Developer mode persists, starts/stops watching, and leaves manual reload available.
- [x] Desktop bridge and settings expose status, reload, error, and WebView DevTools behavior.
- [x] The installed-directory and native-plugin boundaries are documented.

## Decision and gates

The design and implementation were accepted through GitHub PR #110. Trust remains an execution
Gate for installed process runtimes, and this developer switch does not expand bundle permissions.

## Plan

The implementation was split across targeted runtime reload, watcher/commands, desktop event and
bridge wiring, Developer settings, documentation, and focused Rust/Bun verification.

## Build

Implementation commit `dc177195221760f56b7ce6ddfc57708ea862c6ac` added the feature. Later Core
boundary refactors moved shared composition to `crates/plugins` without introducing a second
plugin-development path. Current behavior is documented in [`docs/plugins.md`](../../plugins.md#developing-an-installed-bundle).

## Verification

The implementation contains targeted reload and developer-mode integration coverage in
`crates/plugins/tests/project_bundle_runtime.rs`, plus bridge and rendered settings tests under
`apps/desktop/tests`. The 2026-08-29 SDLC migration reruns the focused current-checkout coverage;
its observed result is recorded in the bootstrap change artifact.

## Review and release

PR #110 merged the implementation to `main` in commit `310b309`. This is repository integration
evidence, not a claim that the feature shipped in a notarized public C2 release.

## Feedback

The unchecked retired Plan was misleading after merge and referenced the old `superpowers:*`
execution system. This closed record replaces both legacy files while retaining their source
commits and current implementation evidence.
