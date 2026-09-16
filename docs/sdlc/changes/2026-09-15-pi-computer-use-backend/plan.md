---
id: 2026-09-15-pi-computer-use-backend
schema: 5
stage: plan
status: accepted
owner: idevlab
created: 2026-09-15
based_on: spec.md
scope: apps/desktop/src/electrobun/toolBroker/piComputerUseMcp.ts, apps/desktop/src/electrobun/toolBroker/providerTools.ts, apps/desktop/tests/providerCapabilities.test.ts, apps/desktop/tests/computerUseSettings.test.tsx, apps/desktop/package.json, apps/desktop/bun.lock, docs/sdlc/changes/2026-09-15-pi-computer-use-backend
---

# Plan: Pi Computer Use backend

## Plan

1. `apps/desktop/src/electrobun/toolBroker/piComputerUseMcp.ts` — the stdio MCP bridge (collect the
   upstream tools, serve `initialize`/`tools/list`/`tools/call`/`ping`).
2. `apps/desktop/src/electrobun/toolBroker/providerTools.ts` — add `piComputerUseHelperApp`,
   `piComputerUseServer`, `piComputerUseOption`, `piComputerUseBridge`, and the
   `builtinComputerUseBackends`/`bridges` helpers; inject the built-in in every
   `loadConfiguredComputerUse` return path and in the null-`dataDir` default.
3. `apps/desktop/tests/providerCapabilities.test.ts` — cover the new built-in through forced
   `PI_COMPUTER_USE_HELPER_APP_PATH`/`CODETWO_PI_COMPUTER_USE_BRIDGE`, and keep the existing Cua test
   correct now that built-ins coexist with configured entries.
4. `apps/desktop/tests/computerUseSettings.test.tsx` — render the Computer Use settings page with
   the new backend and assert it is offered and selectable in the dropdown.
5. `apps/desktop/package.json` + `apps/desktop/bun.lock` — add `@injaneity/pi-computer-use@0.5.1`.

Checks by risk: the change is shared product behavior in one adapter, so desktop `bun run lint`,
`bun test`, and `bun run build` cover it; the bridge is exercised directly over stdio (handshake,
schema list, real call) because it is a subprocess contract that unit mocks would not prove.
`bun script/verify/sdlc.ts --worktree` covers records and scope. No Rust, wire-format, migration, or
documentation-contract change applies. The Settings entry reuses the existing generic backend
renderer, so it introduces no new layout; its appearance and selection are verified by rendering the
settings page, not from the catalog alone.

Temporary resources: task-owned scratch only under
`/var/folders/nl/47s4vtc92m74_j8pmm7d0chh0000gn/T/opencode` (spike project, probe scripts, e2e data
dir). The helper app is deliberately installed at `~/Applications/pi-computer-use.app` and retained
— it is the feature's runtime dependency, not scratch. The helper daemon it launches is retained for
the same reason and recorded in Verification.

Rollback: revert the commit; `bun remove @injaneity/pi-computer-use`; optionally remove
`~/Applications/pi-computer-use.app`. No persisted C2 data or wire format depends on the change
beyond a `host-tools.json` selection key.
