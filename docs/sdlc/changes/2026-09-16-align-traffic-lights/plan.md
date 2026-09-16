---
id: 2026-09-16-align-traffic-lights
schema: 5
stage: plan
status: accepted
owner: chenli
created: 2026-09-16
based_on: spec.md
scope: apps/desktop/src/electrobun/index.ts, apps/desktop/tests/windowChromeContract.test.ts, docs/sdlc/changes/2026-09-16-align-traffic-lights
---

# Plan: Align the macOS traffic lights with the rail's leading column

## Plan

1. `apps/desktop/src/electrobun/index.ts` — change both fixed native-button calls from `(22, 16)` to
   `(16, 16)` (the `dom-ready` darwin branch and the `resize` re-application) and state the shared
   rail-column rule in the comment. No other host behavior changes.
2. `apps/desktop/tests/windowChromeContract.test.ts` — rename the first case to name the rail column
   and pin the two extracted literal values to `["16, 16", "16, 16"]`, including the existing
   no-offset/no-measurement assertions.

Checks by risk and affected behavior:

- Desktop renderer/host: `bun run lint`, `bunx tsc --noEmit`, and `bun test` from `apps/desktop`,
  including the affected `windowChromeContract.test.ts` and the rail rendering tests.
- Rendered native chrome (AC-2): the traffic lights are AppKit-owned window buttons, so they can only
  be observed in a launched macOS window. This plan builds and runs an isolated dev profile
  (`CODETWO_DEV_PROFILE=traffic-light-align`, `CODETWO_DEV_PORT=1499`, its own Core data directory),
  captures the window's top-left region, and measures the native group's leading edge against the
  rail's icon column. The user's running C2 Nightly instance is never touched.
- Repository: `bun script/verify/sdlc.ts --worktree` and `bun script/verify/docs.ts` before handoff.

Temporary resources: the task-owned profile root `.codex/run/instances/traffic-light-align/` (Cargo
target, Vite/Electrobun build output, runtime log, fresh Core data dir) plus its launched processes on
port 1499; all are stopped and removed before handoff. `apps/desktop/node_modules` stays in place as
the shared package install.

Rollback: restore the two `(22, 16)` literals and the test expectation; the change carries no data,
protocol, or persistence surface.
