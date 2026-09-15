---
id: 2026-09-15-architecture-simplification
schema: 5
stage: intent
status: accepted
owner: chenli
created: 2026-09-15
source: user
risk: medium
approved_by: chenli
approved_at: 2026-09-15
approval_source: "Direct request: simplify architecture to rust-core + ElectronBun UI + NAPI plugin, organize CI/CD and SDLC"
next_trigger: chenli reviews verified work.
---

# Intent: Simplify project architecture

## Intent

Reduce the project from 5 Rust crates (kernel, core, plugins, tui, server) to 3 (core, napi, server).
Replace JSON-lines stdin/stdout IPC with NAPI native addon for in-process Bun/Rust communication.
Remove TUI surface. Consolidate CI/CD workflows. Update documentation and development Skills.

Constraints: preserve server for remote/web UI, maintain Plugin Standard 1.2 compatibility,
keep desktop-host as legacy bridge during NAPI migration, no breaking changes to plugin packs.
