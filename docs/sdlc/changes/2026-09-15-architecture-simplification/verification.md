---
id: 2026-09-15-architecture-simplification
schema: 5
stage: verification
status: passed
owner: chenli
created: 2026-09-15
based_on: plan.md
revision: refactor/architecture-simplification branch at worktree
verification_mode: owner
verified_by: chenli
verified_at: 2026-09-15
release_target: none
cleanup_status: complete
---

# Verification: Architecture simplification

## Verification

- AC-1: PASS — `crates/tui/` deleted; `cargo check --workspace` passes (0.10s cached).
- AC-2: PASS — kernel (9 files) moved to `crates/core/src/kernel/`, plugins (30 files) moved to `crates/core/src/plugins/`; `crate::kernel::` and `crate::plugins::` internal references compile; `cargo check --workspace` passes.
- AC-3: PASS — `crates/napi/` created with `napi = "3"`, `napi-derive = "3"`, `napi-build = "2"`; exports `core_boot`, `core_call`, `core_call_in_project`, `core_shutdown`; `cargo check -p codetwo-napi` passes.
- AC-4: PASS — `crates/server/Cargo.toml` depends only on `codetwo-core`; `apps/desktop/src-host/Cargo.toml` depends only on `codetwo-core`; all `codetwo_plugins::` replaced with `codetwo_core::plugins::`, all `codetwo_kernel::` replaced with `codetwo_core::kernel::`; workspace compiles.
- AC-5: PASS — `.github/workflows/ci.yml` has parallel `rust` job with `cargo check --workspace --all-targets` and `cargo test --workspace`.
- AC-6: PASS — `docs/reference/architecture.md` layers diagram updated; `README.md` repository map updated; `AGENTS.md` architecture section added; `docs/reference/plugins.md` kernel link fixed; dev Skill workflow CI table updated.

Verdict: verified.
Residual risk: NAPI addon verified compile-only; runtime testing with Bun is needed before replacing the desktop-host JSON-lines bridge. Remote CI not yet executed. Desktop-host legacy bridge retained as fallback.

## Cleanup

Removed: crates/kernel/, crates/plugins/, crates/tui/ directories deleted from worktree.
Retained: none; all changes tracked in git.
Retention owner: n/a.
Cleanup trigger: n/a.
Processes: none started.
Evidence: `cargo check --workspace` output, `bun script/verify/docs.ts` output.

## Review and release

Approval: pending.
Rollback: Revert this branch; old crate structure preserved in git history.
Release: No release requested; merge and external actions require their own authorization.
Feedback: Link an Incident and regression Eval when a real failure occurs.
