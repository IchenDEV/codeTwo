---
id: "2026-08-31-normalize-all-docs"
stage: plan
schema: 3
status: accepted
owner: codex
created: 2026-08-31
based_on: spec.md
risk: medium
scope: docs, README.md, AGENTS.md, .github/workflows/sdlc.yml, script/verify/docs.ts, script/verify/sdlc.ts, script/verify/checks.test.ts, apps/desktop/src/App.tsx, apps/desktop/src/session/toolActivity.ts, apps/desktop/src/sidebar/MissionControl.tsx, crates/core/src/scene_runtime.rs
approved_by: "userthe current 2026-08-31 full-document audit request"
approved_at: "2026-08-31"
---

# Plan: Normalize every project document

## Files and ownership

docs, README.md, AGENTS.md, .github/workflows/sdlc.yml, script/verify/docs.ts, script/verify/sdlc.ts, script/verify/checks.test.ts, apps/desktop/src/App.tsx, apps/desktop/src/session/toolActivity.ts, apps/desktop/src/sidebar/MissionControl.tsx, crates/core/src/scene_runtime.rs

## Order of work

1. Inventory every document and asset, its status language, local references, and source ownership.
2. Define the live/archive taxonomy and a catalog that enumerates files rather than only folders.
3. Move dated research and completed Scenes 1.0 plans with their assets; add archive boundaries and
   repair links.
4. Upgrade all remaining schema-1 change Artifacts without altering their historical outcome.
5. Audit current contracts, guides, ADRs, active designs, templates, Evals, and screenshots for
   truthful status and references.
6. Run catalog completeness, orphan-asset, local-link, lifecycle, worktree, diff, and isolated
   committed-diff validation.

Rollback is one repository revert restoring the pre-audit paths and metadata. No data migration,
generated runtime state, or external cleanup is required.

## Test-first proof

See legacy Verification section.

## Visual or integration proof

See legacy Verification section.

## Risks and mitigations

See legacy Decision and gates.

## Rollback

See legacy Review and release.

## Deviations

[`docs/catalog.json`](../../../catalog.json) now classifies all 78 retained files with exactly one
authority rule: 8 current contracts, 5 active-design files, 2 accepted ADRs, 3 publication assets,
5 SDLC authority files, 29 change records, 23 archive files, and 3 catalog files. The rewritten
[`docs/README.md`](../../../README.md) is the human authority map. It leaves 55 files in the live
tree and places 23 files behind the explicit non-normative
[`archive boundary`](../../../archive/README.md).

Twelve dated research reports moved to [`archive/research`](../../../archive/research/README.md). The
current memory contract was separated from its historical ec-mono and Codex comparison into a
dated archive snapshot. The completed Scenes 1.0 roadmap, Core/frontend implementation plans, and
three historical screenshots moved together under
[`archive/scenes-v1`](../../../archive/scenes-v1/README.md). The implemented
[`scenes.md`](../../../reference/scenes.md) contract remains live until the accepted Scenes 2.0 breaking
cutover is actually built and verified. Source comments were changed only to repair the four moved
document paths. The two superseded 2026-08-06 t3code reports deleted by the preceding organization
change remain recoverable from Git rather than being reintroduced as archive duplicates.

The maintained architecture, memory, plugin, remote-agent, Scenes, design, ADR, and screenshot
documents now state or inherit their authority. The architecture and root README enumerate all 11
current built-in provider CLIs instead of the obsolete three-provider snapshot. All seven retained
images were visually inspected; current concepts and publication screenshots stay with their live
owners, while Scenes 1.0 evidence stays with its archive owner.

All 29 change records now use schema 2. The last schema-1 compatibility exception was removed from
[`check-sdlc.ts`](../../../../script/verify/sdlc.ts), and its Eval now proves legacy Artifacts fail
even during path-only migration. The new [`check-docs.ts`](../../../../script/verify/docs.ts) Gate and
focused fixtures enforce exact catalog coverage, archive placement for dated snapshots, schema-2
history, local-link closure, and image ownership. Repository instructions, the SDLC workflow, and
CI invoke the same Gate. No product behavior, persisted data, public website content, release
automation, or external state changed.

## Decision

The current user request accepts this Intent and observable Spec. It authorizes repository-local
documentation moves, schema migration, archive notices, reference repair, and removal of files
proven redundant or unowned. It does not authorize commit, push, pull-request creation, merge,
release, deployment, external settings, or production mutation.

This is medium risk because it moves most historical documentation and rewrites lifecycle metadata,
but it does not alter runtime behavior or user data. The Gate requires a complete before/after file
inventory, explicit archive manifest, local-link closure, lifecycle Evals, and a committed-diff
dry-run before `verified`.
