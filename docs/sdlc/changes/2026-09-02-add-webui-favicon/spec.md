---
id: "2026-09-02-add-webui-favicon"
stage: spec
schema: 3
status: accepted
owner: codex
created: 2026-09-02
based_on: intent.md
risk: low
approved_by: "userthe direct 2026-09-02 screenshot feedback"
approved_at: "2026-09-02"
---

# Spec: Add the C2 icon to the Web UI browser tab

## Requirements

The main HTML entry declares the existing SVG application icon as its favicon. Vite must include
the asset in its Web build and keep the generated URL valid under the CLI server's relative asset
base. The desktop pet entry, product title, runtime transport, and native application icon pipeline
are out of scope.

## User experience

Not separately recorded in legacy change.md.

## Technical design

See Requirements and legacy Git history.

## Security and privacy

See migrated Decision and gates.

## Alternatives and non-goals

Not separately recorded in legacy change.md.

## Areas of concern

The user's direct screenshot feedback accepts this low-risk visual correction. Ponytail selected
one HTML metadata declaration at the shared entry and the existing app icon; no duplicated favicon,
new dependency, Web-only component, or configuration surface is justified.

Human review remains required before merge. Merge, release, deployment, and publication are not
authorized.

## Acceptance criteria

- [x] AC-1: The built and served CLI Web UI declares a reachable C2 favicon instead of relying on
      the browser's generic fallback, verified against the generated HTML, HTTP response, and a
      live Browser reload.
- [x] AC-2: The favicon reuses the existing C2 SVG asset and the desktop renderer still passes its
      lint, type, and production-build checks.

## Decision

The user's direct screenshot feedback accepts this low-risk visual correction. Ponytail selected
one HTML metadata declaration at the shared entry and the existing app icon; no duplicated favicon,
new dependency, Web-only component, or configuration surface is justified.

Human review remains required before merge. Merge, release, deployment, and publication are not
authorized.
