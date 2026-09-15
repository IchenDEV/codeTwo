---
id: 2026-09-15-repair-post-merge-test-contracts
schema: 5
stage: plan
status: accepted
owner: chenli
created: 2026-09-15
based_on: spec.md
scope: docs/sdlc/changes/2026-09-15-repair-post-merge-test-contracts/intent.md, docs/sdlc/changes/2026-09-15-repair-post-merge-test-contracts/spec.md, docs/sdlc/changes/2026-09-15-repair-post-merge-test-contracts/plan.md, docs/sdlc/changes/2026-09-15-repair-post-merge-test-contracts/verification.md, apps/desktop/tests/pluginBridgeContract.test.ts, apps/desktop/tests/t3RemoteContract.test.ts, crates/core/tests/architecture_boundary.rs, crates/core/src/kernel/event.rs, crates/core/src/kernel/plugin.rs, crates/core/src/kernel/service.rs, crates/core/src/plugins/app/data_dir_lock.rs, crates/core/src/plugins/app/mod.rs, docs/reference/architecture.md, docs/reference/plugins.md, docs/reference/plugin-protocol.md, website/reference/architecture.md, website/zh/reference/architecture.md
---

# Plan: Repair post-merge test contracts

## Plan

1. `apps/desktop/tests/pluginBridgeContract.test.ts` — repoint the two `crates/plugins` reads to
   `crates/core/src/plugins/app/plugins`.
2. `apps/desktop/tests/t3RemoteContract.test.ts` — repoint the handoff read to the core path.
3. `crates/core/tests/architecture_boundary.rs` — replace the pre-merge assertions with
   `core_is_the_single_composition_root` and `hosts_depend_only_on_core`.
4. `crates/core/src/kernel/{event,plugin,service}.rs` and `crates/core/src/plugins/app/mod.rs` — fix
   the four doctest imports to `codetwo_core::{kernel,plugins}`.
5. `crates/core/src/plugins/app/data_dir_lock.rs` — add the `acquire_within` retry helper and a
   deterministic release test; use the helper in the ownership test.
6. `crates/core/src/plugins/app/mod.rs` — retry the post-release CoreApp boot within a bounded
   deadline in `cloning_configuration_does_not_clone_core_ownership`.
7. Reference docs and both architecture diagrams — cite the merged paths and the NAPI addon.

Checks by risk and affected behavior:

- Desktop test contracts: `bun test tests/pluginBridgeContract.test.ts tests/t3RemoteContract.test.ts`
- Rust boundary + doctests: `cargo test -p codetwo-core --test architecture_boundary`,
  `cargo test -p codetwo-core --doc`, `cargo check --workspace --all-targets`
- Flake regression: twelve consecutive `cargo test -p codetwo-core --lib` runs
- Full affected suites: `cargo test -p codetwo-core`, `cargo test -p codetwo-server`,
  desktop `bun run lint` + `bun test` + `bunx vite build`
- Documentation: `bun script/verify/docs.ts` and `bun run docs:build` from `website`
- Repository: `bun script/verify/sdlc.ts --worktree`

No UI rendering is required: the change touches test contracts, a test-only retry helper, doctest
imports, and prose. It changes no product behavior.

Temporary resources: the test retry helpers allocate no roots; the website build writes only its
git-ignored `.vitepress/cache` and `.vitepress/dist`, and `cargo`/`bun` reuse their ignored target
and `node_modules` trees.

Rollback: revert the change commit and delete this record's directory. Every edit restores a
previous path or assertion, so there is no data or protocol consequence.
