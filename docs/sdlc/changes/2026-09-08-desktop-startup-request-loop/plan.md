---
id: 2026-09-08-desktop-startup-request-loop
schema: 5
stage: plan
status: accepted
owner: Codex
created: 2026-09-08
based_on: spec.md
scope: apps/desktop/src/App.tsx, apps/desktop/src/lib/useLatestRef.ts, apps/desktop/tests/startupEffects.test.tsx, docs/sdlc/changes/2026-09-08-desktop-startup-request-loop
---

# Plan: Desktop Startup Request Loop

## Plan

Codex owns the bounded App callback/subscription correction, the existing latest-ref helper, and source-extracted React lifecycle regression tests. Run the red test against actual App callback/effect code, then focused tests, lint, TypeScript and renderer build. Repeat actual macOS package startup with one and two independent profiles, counting native calls and process CPU without a build watcher. No Rust change is needed for this frontend trigger.

Temporary resources: `.codex/run/instances/cpu-start`, `.codex/run/instances/cpu-peer`, their resolved `/tmp/codetwo-*` socket directories, and `.codex/run/cpu-diagnosis/` diagnostics. Stop owned launch groups at the deadline or process/CPU threshold; remove packages, caches, instrumentation and test data after verification. Retain a compact measured result and failure evidence until review.

Rollback: Revert only this change's App, helper and regression edits; keep existing profile ownership and stdio fixes. Do not restart user instances or weaken ownership locks.
