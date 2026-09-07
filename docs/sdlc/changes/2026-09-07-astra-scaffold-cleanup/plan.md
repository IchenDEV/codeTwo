---
id: "2026-09-07-astra-scaffold-cleanup"
stage: plan
schema: 3
status: accepted
owner: codex
created: "2026-09-07"
based_on: spec.md
risk: "low"
scope: AGENTS.md, docs/catalog.json, docs/reference/desktop-development-profiles.md, docs/sdlc/workflow.md, docs/sdlc/development-workflow.md, crates/core/src/engine.rs, docs/sdlc/changes/2026-09-07-astra-scaffold-cleanup
approved_by: "Chen Li"
approved_at: 2026-09-07
---

# Plan: Astra Scaffold Cleanup

## Files and ownership

Codex owns the exact paths in scope: routing sentence, instruction documentation, catalog registration, and this canonical bundle.

## Order of work

Preserve the existing profile-contract text; move it and add the contextual link. Narrow Sites and lifecycle-skill triggers. Align handoff commands and run the targeted routing regression plus lifecycle checks.

## Test-first proof

Use the existing codex_sites_routing_preserves_the_production_boundary regression. Check moved text and retained safety clauses against HEAD; no new tests that merely mirror wording.

## Visual or integration proof

No rendered UI changes. Inspect the emitted prompt policy through the existing routing test; do not claim a live model-selection evaluation.

## Risks and mitigations

Keep safety text verbatim and preserve every isolation criterion. Run the active lifecycle Eval because project instructions change.

## Rollback

Revert only the scoped patch and remove its new reference document and bundle; no application data or external state changes.

## Deviations

None. Ponytail is excluded by the user’s explicit instruction.

## Decision

Chen Li approved this bounded implementation through “除`ponytail` 立即处理” on 2026-09-07 following the file-scoped audit proposals. The follow-up “clean up code/docs” authorizes wording, formatting, and schema terminology cleanup within the same paths. Merge and release are not authorized.
