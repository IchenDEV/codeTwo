---
id: "2026-09-02-cli-webui-entry"
stage: intent
schema: 3
status: accepted
owner: codex
created: 2026-09-02
source: direct user request to add a CLI entry that opens the shared browser Web UI
risk: medium
approved_by: "userthe direct 2026-09-02 CLI implementation request"
approved_at: "2026-09-02"
---

# Intent: Open the shared Web UI from the server CLI

## Problem

The shared React renderer can now attach to a paired Core, but its only launch entry is the
repository-only `bun run dev:web` script. The user requested a real CLI entry. It must not create a
new business runtime, duplicate browser command policy, or require a second Core process.

The smallest product-shaped outcome is a `webui` mode on the existing `codetwo-server` binary.
That binary already owns standalone Core startup, pairing, networking, and host packaging. The new
mode adds shared React static assets and browser launch orchestration while keeping the existing
compact remote mode backward compatible.

## Proposed outcome

The shared React renderer can now attach to a paired Core, but its only launch entry is the

## Affected users and systems

Migrated from legacy change.md.

## Constraints

The user's direct request accepts this medium-risk implementation. Ponytail selected extension of
the existing server binary and build script rather than a new `codetwo` CLI framework, embedded
47-MiB generated asset tree, or a Vite child-process dependency. Codebase-design review keeps CLI
orchestration shallow and places authentication, static serving, command policy, and Core dispatch
behind existing server and PluginManager interfaces.

Human review remains required before merge. Publishing binaries, opening a public listener,
release, deployment, and production mutation remain closed Gates.

## Out of scope

Not recorded in the legacy single-file Artifact.

## Success signals

See Spec acceptance criteria.

## Open questions

None recorded in migration.

## Decision

The user's direct request accepts this medium-risk implementation. Ponytail selected extension of
the existing server binary and build script rather than a new `codetwo` CLI framework, embedded
47-MiB generated asset tree, or a Vite child-process dependency. Codebase-design review keeps CLI
orchestration shallow and places authentication, static serving, command policy, and Core dispatch
behind existing server and PluginManager interfaces.

Human review remains required before merge. Publishing binaries, opening a public listener,
release, deployment, and production mutation remain closed Gates.
