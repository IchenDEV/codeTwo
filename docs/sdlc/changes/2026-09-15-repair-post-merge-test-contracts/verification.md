---
id: 2026-09-15-repair-post-merge-test-contracts
schema: 5
stage: verification
status: passed
owner: chenli
created: 2026-09-15
based_on: plan.md
revision: 9de1ebb12e833ebfdfc07a725f65a4ecf31de5b7 + uncommitted worktree changes
verification_mode: owner
verified_by: chenli
verified_at: 2026-09-15
release_target: none
cleanup_status: complete
next_trigger: chenli reviews verified work.
---

# Verification: Repair post-merge test contracts

## Verification

- AC-1: PASS — from `apps/desktop`, `bun test tests/pluginBridgeContract.test.ts` reports
  `3 pass / 0 fail` (previously all three threw `ENOENT` on the deleted `crates/plugins` path).
- AC-2: PASS — `bun test tests/t3RemoteContract.test.ts tests/pluginBridgeContract.test.ts` reports
  `7 pass / 0 fail`.
- AC-3: PASS — `cargo test -p codetwo-core --test architecture_boundary` reports
  `2 passed; 0 failed`, and `cargo check --workspace --all-targets` finishes clean (it previously
  aborted on the missing `crates/plugins/Cargo.toml`).
- AC-4: PASS — `cargo test -p codetwo-core --doc` reports `4 passed; 0 failed`.
- AC-5: PASS — twelve consecutive `cargo test -p codetwo-core --lib` runs each reported
  `547 passed; 0 failed` under the default parallel runner (the pre-fix failure rate was roughly
  40%, with a different ownership test failing each time). The retry only tolerates the transient
  fork/exec hand-off; immediate exclusivity is still asserted.
- AC-6: PASS — `rg "crates/plugins|crates/kernel|crates/tui"` over the repository excluding
  historical change records and archives returns nothing; `bun script/verify/docs.ts` reports
  `[docs] catalog, links, schemas, and assets valid`; `bun run docs:build` from `website` completes.

Supporting full-suite evidence: `cargo test -p codetwo-core` reports 34 `test result: ok` groups with
no failures; `cargo test -p codetwo-server` reports every group ok; from `apps/desktop`,
`bun run lint`, `bunx tsc --noEmit`, `bun test` (`908 pass / 3 skip / 0 fail`), and
`bunx vite build` all pass.

Verdict: verified.
Residual risk: the wider documentation set still describes a TUI surface that the architecture
change removed (`website/guide/tui.md`, and TUI prose in
`docs/reference/{plugins,memory,plugin-standard,architecture}.md`); that narrative cleanup is out of
scope here and does not affect any check.

## Cleanup

Removed: the temporary diagnostics used to diagnose the flake (a `DIAG` `eprintln!` and an
800-iteration stress test in `crates/core/src/plugins/app/data_dir_lock.rs`) were replaced by the
deterministic `acquisition_is_reusable_after_release` test and the `acquire_within` helper; no other
scratch files were created.
Retained: `apps/desktop/node_modules` and `website/node_modules` (installed to run the renderer and
docs builds) plus the git-ignored `target/`, `apps/desktop/dist`, and `website/.vitepress/{cache,dist}`
build outputs. These are standard, ignored toolchain/build trees, not task-owned scratch.
Retention owner: repository toolchain; next cleanup is the ordinary build-cache cleanup.
Cleanup trigger: not scheduled — ignored build caches only.
Processes: none. The artifact integration test aborts its own server task; no desktop instance,
daemon, or port was left running.
Evidence: `git status --porcelain` lists only the intended source, test, doc, and record edits;
`git check-ignore apps/desktop/dist website/.vitepress/dist website/node_modules` confirms the build
outputs are ignored.

## Review and release

Approval: pending — merge and external actions require their own authorization.
Rollback: See plan.md.
Release: No release requested; merge and external actions require their own authorization.
Feedback: Link an Incident and regression Eval when a real failure occurs.
