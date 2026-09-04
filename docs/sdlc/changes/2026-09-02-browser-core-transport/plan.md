---
id: "2026-09-02-browser-core-transport"
stage: plan
schema: 3
status: accepted
owner: codex
created: 2026-09-02
based_on: spec.md
risk: medium
scope: Cargo.lock, apps/desktop/package.json, apps/desktop/src/bridge.ts, apps/desktop/src/coreTransport.ts, apps/desktop/tests/coreTransport.test.ts, apps/desktop/tests/pluginBridgeContract.test.ts, apps/desktop/vite.config.ts, apps/desktop/src-host/src/remote.rs, crates/plugins/src/app/mod.rs, crates/plugins/src/app/plugin_manager.rs, crates/server/Cargo.toml, crates/server/src/lib.rs, crates/server/tests/web_ui_commands.rs, docs/sdlc/changes/2026-09-02-browser-core-transport
approved_by: "userthe direct 2026-09-02 implementation request"
approved_at: "2026-09-02"
---

# Plan: Reuse the desktop React renderer as a browser Web UI

## Files and ownership

Cargo.lock, apps/desktop/package.json, apps/desktop/src/bridge.ts, apps/desktop/src/coreTransport.ts, apps/desktop/tests/coreTransport.test.ts, apps/desktop/tests/pluginBridgeContract.test.ts, apps/desktop/vite.config.ts, apps/desktop/src-host/src/remote.rs, crates/plugins/src/app/mod.rs, crates/plugins/src/app/plugin_manager.rs, crates/server/Cargo.toml, crates/server/src/lib.rs, crates/server/tests/web_ui_commands.rs, docs/sdlc/changes/2026-09-02-browser-core-transport

## Order of work

1. Add and test the renderer Core transport interface with Electrobun and paired-Web adapters.
2. Route only the first browser Session vertical slice through Core availability while preserving
   native desktop checks and unrelated browser fixtures.
3. Add an authenticated generic Web UI command route and a desktop-host caller that reuses Kernel
   global/project dispatch with an explicit capability set.
4. Add a Web Vite mode and same-origin proxy without changing the normal desktop build.
5. Run focused protocol/renderer checks, exercise the paired browser flow against one live Core,
   then run the repository lifecycle Gates.

Rollback removes the Web adapter, command route, and Vite Web mode and restores the selected bridge
guards to Electrobun-only checks. No persisted schema or user data is migrated.

## Test-first proof

See legacy Verification section.

## Visual or integration proof

See legacy Verification section.

## Risks and mitigations

See legacy Decision and gates.

## Rollback

See legacy Review and release.

## Deviations

`coreTransport.ts` now owns the renderer's two-operation Core seam and selects either the existing
Electrobun transport or the paired-Web adapter. `bridge.ts` remains the only typed product-command
projection; only the Session vertical slice tests Core availability rather than desktop-container
availability. `dev:web` reuses the normal Vite renderer and proxies authenticated HTTP and
WebSocket traffic to the existing paired Core listener.

The server adds one generic authenticated call route. Its desktop-host adapter applies an explicit
allowlist and delegates both root and project-scoped calls to `PluginManager`; `CoreApp` delegates
to that same seam. This centralizes lazy project graph creation, activity leasing, flushing, realm
selection, and global fallback instead of copying them into a Web implementation.

The first browser restart probe exposed one real failure: after a WebSocket closed, a transient
ticket-request failure stopped the old adapter's retry loop. The correction reschedules while a
reusable bearer or pairing token exists. Both the focused regression test and an outage longer than
multiple retry intervals then recovered without reloading the page.

## Decision

The user accepted the browser direction and directly requested implementation on 2026-09-02.
Ponytail selected reuse of the existing React tree, CoreApp command seam, C2 bearer/ticket flow, and
remote engine event stream. Codebase-design review places one real seam between the renderer and its
two transport adapters; it does not introduce command-specific Web modules or another business
runtime.

This is medium risk because it adds an authenticated route to trusted local product commands. The
initial capability set is explicit and member devices are rejected. Human review remains required
before merge. Packaging, remote-wide capability expansion, release, and production remain closed
Gates.
