---
id: 2026-09-15-repair-post-merge-test-contracts
schema: 5
stage: spec
status: accepted
owner: chenli
created: 2026-09-15
based_on: intent.md
---

# Spec: Repair post-merge test contracts

## Design

- **Desktop contracts** repoint at the merged crate: `pluginBridgeContract.test.ts` reads
  `crates/core/src/plugins/app/plugins/engine.rs` and enumerates
  `crates/core/src/plugins/app/plugins`; `t3RemoteContract.test.ts` reads
  `crates/core/src/plugins/app/plugins/handoff.rs`. The assertions themselves are unchanged, so they
  now cover the real source again.
- **Boundary test** becomes `core_is_the_single_composition_root` (core does not depend on the
  removed crates; core exposes `pub mod kernel;` and `pub mod plugins;`; the pre-merge top-level
  modules do not reappear) and `hosts_depend_only_on_core` (server, desktop host, and napi depend on
  `codetwo-core` and not on the removed crates). Both read live manifests with `include_str!`.
- **Doctests** import through `codetwo_core::kernel` / `codetwo_core::plugins`.
- **Flaky lock tests** keep the immediate exclusivity assertion but re-acquire through a bounded
  retry helper (`data_dir_lock::acquire_within`, and an async `boot_within` for the CoreApp case).
  The retry only tolerates the transient fork/exec hand-off window; a genuinely leaked lock still
  fails within the 5-second deadline. A deterministic `acquisition_is_reusable_after_release` guards
  the release behavior the retry depends on.
- **Docs** cite the merged paths, and the architecture bullets/diagrams that named the deleted
  crates now describe `codetwo-core` and the NAPI addon.

## Acceptance criteria

- [x] AC-1: `bun test tests/pluginBridgeContract.test.ts` passes from `apps/desktop`.
- [x] AC-2: `bun test tests/t3RemoteContract.test.ts` passes from `apps/desktop`.
- [x] AC-3: `cargo test -p codetwo-core --test architecture_boundary` compiles and both boundary
      tests pass; `cargo check --workspace --all-targets` succeeds.
- [x] AC-4: `cargo test -p codetwo-core --doc` passes all four doctests.
- [x] AC-5: twelve consecutive `cargo test -p codetwo-core --lib` runs under the default parallel
      runner report zero failures.
- [x] AC-6: no non-historical repository file cites `crates/plugins`, `crates/kernel`, or
      `crates/tui`, and `bun script/verify/docs.ts` plus the website build stay green.
