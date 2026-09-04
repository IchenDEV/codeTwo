---
id: "2026-09-02-cli-webui-entry"
stage: spec
schema: 3
status: accepted
owner: codex
created: 2026-09-02
based_on: intent.md
risk: medium
approved_by: "userthe direct 2026-09-02 CLI implementation request"
approved_at: "2026-09-02"
---

# Spec: Open the shared Web UI from the server CLI

## Requirements

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

## User experience

Not separately recorded in legacy change.md.

## Technical design

See Requirements and legacy Git history.

## Security and privacy

See migrated Decision and gates.

## Alternatives and non-goals

Not separately recorded in legacy change.md.

## Areas of concern

The user's direct request accepts this medium-risk implementation. Ponytail selected extension of
the existing server binary and build script rather than a new `codetwo` CLI framework, embedded
47-MiB generated asset tree, or a Vite child-process dependency. Codebase-design review keeps CLI
orchestration shallow and places authentication, static serving, command policy, and Core dispatch
behind existing server and PluginManager interfaces.

Human review remains required before merge. Publishing binaries, opening a public listener,
release, deployment, and production mutation remain closed Gates.

## Acceptance criteria

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

## Decision

The user's direct request accepts this medium-risk implementation. Ponytail selected extension of
the existing server binary and build script rather than a new `codetwo` CLI framework, embedded
47-MiB generated asset tree, or a Vite child-process dependency. Codebase-design review keeps CLI
orchestration shallow and places authentication, static serving, command policy, and Core dispatch
behind existing server and PluginManager interfaces.

Human review remains required before merge. Publishing binaries, opening a public listener,
release, deployment, and production mutation remain closed Gates.
