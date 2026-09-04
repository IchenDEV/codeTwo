---
id: "2026-09-02-browser-core-transport"
stage: intent
schema: 3
status: accepted
owner: codex
created: 2026-09-02
source: direct user request to begin a browser Web UI mode while reusing existing modules and preventing future product-surface divergence
risk: medium
approved_by: "userthe direct 2026-09-02 implementation request"
approved_at: "2026-09-02"
---

# Intent: Reuse the desktop React renderer as a browser Web UI

## Problem

C2 already has one Rust Core shared by Desktop, TUI, and the paired remote server, but the complete
React renderer can reach product commands only through Electrobun. Plain-browser rendering therefore
falls back to fixtures and no-op event subscriptions, while the separate remote HTML client repeats
chat interaction logic. The user directly requested implementation of a browser mode that reuses the
existing modules and does not create another product surface that can drift during later iteration.

The desired first outcome is one shared React product tree with a small Core transport interface.
Electrobun and paired Web access are adapters at that seam; native window, dialog, updater, Appshot,
pet, and embedded-WebView capabilities remain owned by the desktop container. This request approves
implementation, but not a pull request, merge, release, deployment, or production mutation.

## Proposed outcome

C2 already has one Rust Core shared by Desktop, TUI, and the paired remote server, but the complete

## Affected users and systems

Migrated from legacy change.md.

## Constraints

The user accepted the browser direction and directly requested implementation on 2026-09-02.
Ponytail selected reuse of the existing React tree, CoreApp command seam, C2 bearer/ticket flow, and
remote engine event stream. Codebase-design review places one real seam between the renderer and its
two transport adapters; it does not introduce command-specific Web modules or another business
runtime.

This is medium risk because it adds an authenticated route to trusted local product commands. The
initial capability set is explicit and member devices are rejected. Human review remains required
before merge. Packaging, remote-wide capability expansion, release, and production remain closed
Gates.

## Out of scope

Not recorded in the legacy single-file Artifact.

## Success signals

See Spec acceptance criteria.

## Open questions

None recorded in migration.

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
