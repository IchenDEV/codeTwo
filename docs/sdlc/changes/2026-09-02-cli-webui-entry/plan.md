---
id: "2026-09-02-cli-webui-entry"
stage: plan
schema: 3
status: accepted
owner: codex
created: 2026-09-02
based_on: spec.md
risk: medium
scope: Cargo.lock, README.md, apps/desktop/src-host/src/remote.rs, crates/server/Cargo.toml, crates/server/src/lib.rs, crates/server/src/main.rs, crates/server/tests/web_ui_commands.rs, script/build/hosts.sh, docs/sdlc/changes/2026-09-02-cli-webui-entry
approved_by: "userthe direct 2026-09-02 CLI implementation request"
approved_at: "2026-09-02"
---

# Plan: Open the shared Web UI from the server CLI

## Files and ownership

Cargo.lock, README.md, apps/desktop/src-host/src/remote.rs, crates/server/Cargo.toml, crates/server/src/lib.rs, crates/server/src/main.rs, crates/server/tests/web_ui_commands.rs, script/build/hosts.sh, docs/sdlc/changes/2026-09-02-cli-webui-entry

## Order of work

1. Move the Web command allowlist/dispatcher into the shared server module and reuse it from both
   desktop remote and standalone server hosts.
2. Let the server optionally mount a validated Vite asset directory as its SPA fallback while
   preserving the compact client when no directory is supplied.
3. Add the `webui`, `--ui-dir`, `--data-dir`, and `--no-open` CLI interface and package the existing
   Vite Web output next to the host binary.
4. Verify argument failures, static assets, paired calls, default compatibility, browser launch
   suppression, a real browser flow, and repository Gates.

Rollback removes the `webui` CLI mode, optional static fallback, and host-build asset output. It
does not migrate persisted data or change the default compact remote server.

## Test-first proof

See legacy Verification section.

## Visual or integration proof

See legacy Verification section.

## Risks and mitigations

See legacy Decision and gates.

## Rollback

See legacy Review and release.

## Deviations

`codetwo-server` now accepts a focused `webui` mode with `--ui-dir`, `--data-dir`, and
`--no-open`. It validates the React asset directory before creating data or booting Core, then
starts the existing `CoreApp`, paired HTTP/WebSocket server, shared `KernelWebUiCommands`, and Vite
SPA from one process and origin. The no-argument branch still calls the prior compact server entry.

`KernelWebUiCommands` and its bounded capability policy moved from the desktop-only Remote plugin
into `codetwo-server`; desktop Remote and standalone CLI instantiate that same adapter. Static
files use tower-http's traversal-safe directory service and fall back to the existing React index
for client-side routes. No command-specific Web handler or second product runtime was added.

The host build now emits the existing Vite Web build as `web-ui` next to the Rust binaries. This
keeps generated assets out of Git and avoids invoking Bun or Vite when the installed CLI runs.
There were no material deviations from the accepted plan.

## Decision

The user's direct request accepts this medium-risk implementation. Ponytail selected extension of
the existing server binary and build script rather than a new `codetwo` CLI framework, embedded
47-MiB generated asset tree, or a Vite child-process dependency. Codebase-design review keeps CLI
orchestration shallow and places authentication, static serving, command policy, and Core dispatch
behind existing server and PluginManager interfaces.

Human review remains required before merge. Publishing binaries, opening a public listener,
release, deployment, and production mutation remain closed Gates.
