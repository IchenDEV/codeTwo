---
id: "2026-08-26-plugin-hot-reload"
stage: plan
schema: 3
status: accepted
owner: repository maintainers
created: 2026-08-26
based_on: spec.md
risk: low
scope: crates/plugins, apps/desktop, docs/reference/plugins.md
approved_by: "#decision-and-gates"
approved_at: "2026-08-26"
---

# Plan: Plugin hot reload and developer tools

## Files and ownership

crates/plugins, apps/desktop, docs/reference/plugins.md

## Order of work

The implementation was split across targeted runtime reload, watcher/commands, desktop event and
bridge wiring, Developer settings, documentation, and focused Rust/Bun verification.

## Test-first proof

See legacy Verification section.

## Visual or integration proof

See legacy Verification section.

## Risks and mitigations

See legacy Decision and gates.

## Rollback

See legacy Review and release.

## Deviations

Implementation commit `dc177195221760f56b7ce6ddfc57708ea862c6ac` added the feature. Later Core
boundary refactors moved shared composition to `crates/plugins` without introducing a second
plugin-development path. Current behavior is documented in [`docs/reference/plugins.md`](../../../reference/plugins.md#developing-an-installed-bundle).

## Decision

The design and implementation were accepted through GitHub PR #110. Trust remains an execution
Gate for installed process runtimes, and this developer switch does not expand bundle permissions.
