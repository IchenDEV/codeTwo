---
id: 2026-09-15-architecture-simplification
schema: 5
stage: plan
status: accepted
owner: chenli
created: 2026-09-15
based_on: spec.md
scope: Cargo.toml, Cargo.lock, crates/core, crates/napi, crates/kernel, crates/plugins, crates/tui, crates/server/Cargo.toml, crates/server/src, apps/desktop/src-host/Cargo.toml, apps/desktop/src-host/src, .github/workflows/ci.yml, AGENTS.md, README.md, docs/reference/architecture.md, docs/reference/plugins.md, script/build/hosts.sh, .agents/skills/codetwo-develop/references/development.md, .agents/skills/codetwo-develop/references/workflow.md, docs/sdlc/changes/2026-09-15-architecture-simplification, docs/sdlc/changes/2026-08-26-plugin-hot-reload/verification.md, docs/archive/research
---

# Plan: Architecture simplification

## Plan

1. Remove crates/tui directory and workspace member.
2. Copy crates/kernel/src into crates/core/src/kernel/, fix crate:: paths.
3. Copy crates/plugins/src into crates/core/src/plugins/, fix codetwo_kernel/codetwo_core refs.
4. Add notify and fs2 deps to core Cargo.toml; enable terminal feature by default.
5. Create crates/napi with napi-rs v3 cdylib, build.rs, and lib.rs bridge.
6. Update server and desktop-host Cargo.toml to depend only on codetwo-core.
7. Update CI to add Rust workspace check job.
8. Update AGENTS.md, architecture.md, README.md, plugins.md, development.md, workflow.md.

Checks: `cargo check --workspace`, `bun script/verify/docs.ts`, `bun script/verify/sdlc.ts --worktree`.
No UI rendering or runtime Bun test needed (compile-only verification for NAPI).

Temporary resources: none; all changes are tracked in git.

Rollback: Revert this branch; the old crate structure is preserved in git history.
