---
id: "2026-08-26-plugin-hot-reload"
stage: spec
schema: 3
status: accepted
owner: repository maintainers
created: 2026-08-26
based_on: intent.md
risk: low
approved_by: "#decision-and-gates"
approved_at: "2026-08-26"
---

# Spec: Plugin hot reload and developer tools

## Requirements

The accepted design required a persisted global developer-mode switch, a native watcher over the
installed Bundle directory, debounced reload of only affected Bundle runtimes, explicit status and
manual reload commands, and a quiet accessible Developer settings surface. Native Rust plugins
remain on the rebuild-and-restart path.

## User experience

Not separately recorded in legacy change.md.

## Technical design

See Requirements and legacy Git history.

## Security and privacy

See migrated Decision and gates.

## Alternatives and non-goals

Not separately recorded in legacy change.md.

## Areas of concern

The design and implementation were accepted through GitHub PR #110. Trust remains an execution
Gate for installed process runtimes, and this developer switch does not expand bundle permissions.

## Acceptance criteria

- [x] AC-1: Targeted reload replaces the affected Bundle runtime without replacing an unrelated runtime.
- [x] AC-2: Developer mode persists, starts/stops watching, and leaves manual reload available.
- [x] AC-3: Desktop bridge and settings expose status, reload, error, and WebView DevTools behavior.
- [x] AC-4: The installed-directory and native-plugin boundaries are documented.

## Decision

The design and implementation were accepted through GitHub PR #110. Trust remains an execution
Gate for installed process runtimes, and this developer switch does not expand bundle permissions.
