---
id: 2026-09-15-architecture-simplification
schema: 5
stage: spec
status: accepted
owner: chenli
created: 2026-09-15
based_on: intent.md
---

# Spec: Architecture simplification

## Design

Merge kernel (~3K lines) and plugins (~4K lines) into core as submodules: `core::kernel` and
`core::plugins`. Create a thin napi-rs v3 crate that exports `core_boot`, `core_call`,
`core_call_in_project`, and `core_shutdown` for Bun consumption. Remove TUI crate. Update all
downstream imports from `codetwo_kernel::` and `codetwo_plugins::` to `codetwo_core::kernel::` and
`codetwo_core::plugins::`. Add Rust workspace check job to CI alongside existing SDLC/desktop checks.

## Acceptance criteria

- [x] AC-1: crates/tui removed; workspace compiles without it.
- [x] AC-2: crates/kernel and crates/plugins merged into crates/core as submodules.
- [x] AC-3: crates/napi created with napi-rs v3, exports core_boot/core_call/core_shutdown.
- [x] AC-4: All downstream crates (server, desktop-host) import only from codetwo_core.
- [x] AC-5: CI workflow includes Rust workspace check job.
- [x] AC-6: Architecture documentation updated to reflect new structure.
