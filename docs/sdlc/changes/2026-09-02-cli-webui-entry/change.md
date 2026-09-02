---
id: change-2026-09-02-cli-webui-entry
kind: change
schema: 2
status: verified
risk: medium
owner: codex
approvers: user via the direct 2026-09-02 CLI implementation request
approved_at: 2026-09-02
created: 2026-09-02
updated: 2026-09-02
source: direct user request to add a CLI entry that opens the shared browser Web UI
inputs: existing codetwo-server binary, shared React Web build, paired server authentication, and shared Kernel Web command adapter
outputs: one codetwo-server webui mode that starts a single Core and serves the shared React renderer
scope: Cargo.lock, README.md, apps/desktop/src-host/src/remote.rs, crates/server/Cargo.toml, crates/server/src/lib.rs, crates/server/src/main.rs, crates/server/tests/web_ui_commands.rs, script/build/hosts.sh, docs/sdlc/changes/2026-09-02-cli-webui-entry
next_trigger: human review and an explicit merge or release decision
verification_mode: owner
verified_by: codex
verified_at: 2026-09-02
---

# Open the shared Web UI from the server CLI

## Intent

The shared React renderer can now attach to a paired Core, but its only launch entry is the
repository-only `bun run dev:web` script. The user requested a real CLI entry. It must not create a
new business runtime, duplicate browser command policy, or require a second Core process.

The smallest product-shaped outcome is a `webui` mode on the existing `codetwo-server` binary.
That binary already owns standalone Core startup, pairing, networking, and host packaging. The new
mode adds shared React static assets and browser launch orchestration while keeping the existing
compact remote mode backward compatible.

## Spec

`codetwo-server webui` boots one `CoreApp`, exposes the same authenticated generic Web UI command
route as the desktop remote plugin, serves the normal Vite Web build from the same origin, prints a
one-time pairing URL, and opens that URL in the platform browser unless `--no-open` is supplied.
The browser consumes the existing `CoreTransport` and React tree; the CLI adds no command-specific
HTTP endpoints or renderer fork.

The CLI resolves Web assets from an explicit `--ui-dir`, then `CODETWO_WEB_UI_DIR`, then a
`web-ui` directory adjacent to the executable. The host build script produces that adjacent
directory from the existing Vite Web build. Missing or invalid assets fail before Core boot with an
actionable message. `--data-dir` provides an explicit standalone data location for safe development
and testing; the existing default remains unchanged.

The existing no-argument `codetwo-server` behavior continues to serve the compact remote client.
It must not require Web UI assets and must not gain the broader renderer command route.

### Acceptance criteria

- [x] AC-1: `codetwo-server webui` boots one shared Core and serves the existing React Web build,
      authenticated command route, and engine event stream from one origin.
- [x] AC-2: The no-argument compact remote server remains backward compatible and does not require
      or serve full-renderer assets.
- [x] AC-3: Asset and data-directory resolution is deterministic; missing assets and invalid CLI
      arguments fail before Core startup with actionable output; the host build packages assets
      adjacent to the executable.
- [x] AC-4: Desktop remote and standalone CLI reuse one Web command allowlist/dispatcher; browser
      opening is suppressible and never puts bearer credentials in the URL.
- [x] AC-5: Focused CLI, HTTP, renderer, Rust, browser, documentation, and lifecycle checks pass.

## Decision and gates

The user's direct request accepts this medium-risk implementation. Ponytail selected extension of
the existing server binary and build script rather than a new `codetwo` CLI framework, embedded
47-MiB generated asset tree, or a Vite child-process dependency. Codebase-design review keeps CLI
orchestration shallow and places authentication, static serving, command policy, and Core dispatch
behind existing server and PluginManager interfaces.

Human review remains required before merge. Publishing binaries, opening a public listener,
release, deployment, and production mutation remain closed Gates.

## Plan

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

## Build

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

## Verification

Verdict: verified.

### Acceptance evidence

- AC-1: PASS — `./script/build/hosts.sh debug` produced `target/debug/codetwo-server` and its
  adjacent 850-file `web-ui` build. Running `CODETWO_HOST=127.0.0.1 CODETWO_PORT=4602
  ./target/debug/codetwo-server webui --data-dir <isolated> --no-open` booted one Core and served
  pairing, React assets, authenticated Core calls, and events from the same listener.
- AC-2: PASS — `cargo test -p codetwo-server --test web_ui_commands` verified that Web assets
  replace the root and `/pair` SPA routes only when supplied, while the no-assets server still
  returns the embedded compact C2 client and retains `/health` independently.
- AC-3: PASS — `cargo test -p codetwo-server --bin codetwo-server`, `bash -n
  script/build/hosts.sh`, `./target/debug/codetwo-server --help`, and a missing-assets CLI probe
  verified precedence, adjacent packaging, actionable errors, and that invalid assets fail before
  the requested data directory is created.
- AC-4: PASS — `cargo test -p codetwo-server --lib
  browser_renderer_has_one_bounded_core_capability_set`, `cargo test -p codetwo-desktop-host
  remote::tests`, and source inspection verified one shared adapter and allowlist. The live
  `--no-open` run opened no system browser; its printed URL contained only the one-time pairing
  token in the fragment, never a durable bearer.
- AC-5: PASS — `cargo test -p codetwo-server` passed 50 unit/integration tests; the desktop-host
  Remote tests, three Bun transport tests, full renderer lint and TypeScript checks, actual Vite
  Web build, changed-file rustfmt, `git diff --check`, and repository documentation/lifecycle
  worktree Gates passed. In the in-app browser, the packaged CLI page resolved to `/pair` with its
  token fragment cleared, rendered the C2 React UI, reported no console warnings/errors, and
  changed from Collapse to Expand after the sidebar interaction.

Residual risk: Web UI assets remain a generated adjacent directory rather than bytes embedded in
the Rust executable. Moving only `codetwo-server` without its sibling `web-ui` directory makes the
new mode fail closed with a repair command; the compact mode still works. The current renderer
bundle is about 47 MiB and retains its existing large-chunk warnings. The live smoke used
`--no-open` to avoid surprising the user's default browser; platform browser command construction
is a small standard-library branch, while actual automatic opening remains platform-dependent.

## Review and release

Approval: implementation approved by the user on 2026-09-02; merge and release are not approved.
Review: Draft PR [#219](https://github.com/IchenDEV/codeTwo/pull/219) contains this change.
Release target: none.
Release identity: not applicable until released.
Smoke evidence: not applicable until released.
Rollback: remove the CLI mode and static asset fallback; no data rollback is required.
No release: merge, deployment, and release are not authorized.

## Feedback

The user requested the CLI entry immediately after confirming that only a development script
existed. No post-implementation feedback exists yet.
