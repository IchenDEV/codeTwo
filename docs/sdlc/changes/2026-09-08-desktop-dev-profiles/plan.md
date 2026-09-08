---
id: 2026-09-08-desktop-dev-profiles
schema: 5
stage: plan
status: accepted
owner: codex
created: 2026-09-08
based_on: spec.md
scope: apps/desktop/scripts/, apps/desktop/tests/, apps/desktop/electrobun.config.ts, apps/desktop/vite.config.ts, apps/desktop/src/electrobun/index.ts, apps/desktop/src/electrobun/nativeHost.ts, apps/desktop/src-host/src/, apps/desktop/src-host/Cargo.toml, crates/plugins/, Cargo.lock, script/dev/run.sh, docs/design/desktop-development-profiles.md, .agents/skills/codetwo-operations/references/desktop-instances.md, .agents/skills/codetwo-develop/references/development.md, docs/sdlc/changes/2026-09-08-desktop-dev-profiles/
---

# Plan: Desktop Dev Profiles

## Plan

Codex owns the profile resolver, launch/build wiring, Core ownership guard, focused regression harness and documentation. Use existing platform locks and fs2 for Rust 1.82-compatible OS ownership. Run resolver/launcher tests, relevant desktop channel/native-host checks, Rust ownership and actual host subprocess isolation checks, concurrent disposable bundle rendering where available, documentation/scope checks and independent review required for this high-risk boundary. No layout changes; browser-only evidence cannot prove native packaging. Record unavailable platform checks explicitly.

Rollback: Revert this change; profile artifacts are disposable under ignored runtime directories. Do not move, rewrite or delete default user data.
