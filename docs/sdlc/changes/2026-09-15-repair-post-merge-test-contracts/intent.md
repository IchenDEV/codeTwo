---
id: 2026-09-15-repair-post-merge-test-contracts
schema: 5
stage: intent
status: accepted
owner: chenli
created: 2026-09-15
source: user
risk: medium
approved_by: chenli
approved_at: 2026-09-15
approval_source: "Direct request: 修复既有失败问题 (fix the pre-existing failures left by the architecture-simplification merge)."
next_trigger: chenli reviews verified work.
---

# Intent: Repair post-merge test contracts

## Intent

The accepted architecture-simplification change (`docs/sdlc/changes/2026-09-15-architecture-simplification`)
merged `crates/kernel` and `crates/plugins` into `crates/core` and removed `crates/tui`, but several
checks and citations still point at the deleted crates. The result is a red test suite that has
nothing to do with the current feature work:

1. `apps/desktop/tests/pluginBridgeContract.test.ts` reads `crates/plugins/src/app/plugins/engine.rs`
   and enumerates `crates/plugins/src/app/plugins`, so all three of its cases throw `ENOENT`.
2. `apps/desktop/tests/t3RemoteContract.test.ts` reads
   `crates/plugins/src/app/plugins/handoff.rs`.
3. `crates/core/tests/architecture_boundary.rs` fails to compile: `include_str!("../../plugins/Cargo.toml")`
   no longer exists, and its assertions still describe the pre-merge split.
4. Four `crates/core` doctests still `use codetwo_kernel::…` / `use codetwo_plugins::…`.
5. The core `plugins::app` data-dir-lock tests flake under the default parallel runner (~40% of full
   runs) because a concurrent `fork`/`exec` elsewhere in the process can briefly inherit the released
   lock's file description; twelve consecutive parallel runs must be green.
6. Reference docs still cite the deleted crate paths in
   `docs/reference/{architecture,plugins,plugin-protocol}.md` and both architecture diagrams.

Outcome: every check that the architecture change broke is green again, and the boundary test now
asserts the merged-crate contract instead of the superseded one.

Upstream note: PR #232 (`46256251`) fixed items 1 and 2 first. This branch rebased onto that merge,
so those two files carry no diff here; the remaining items, the flake fix, and the documentation
corrections are this change's contribution.

Constraints: do not weaken the ownership-exclusivity assertion; do not delete the boundary test's
intent (only retarget it); do not rewrite the remaining TUI prose in the wider documentation set.
Non-goals: a full TUI-narrative documentation cleanup and the runtime/feature work in the
2026-09-15 feature records.
