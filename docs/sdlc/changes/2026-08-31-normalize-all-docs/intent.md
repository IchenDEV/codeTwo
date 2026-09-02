---
id: "2026-08-31-normalize-all-docs"
stage: intent
schema: 3
status: accepted
owner: codex
created: 2026-08-31
source: current user request to inspect every file under docs and archive or migrate anything outside the current documentation standard
risk: medium
approved_by: "userthe current 2026-08-31 full-document audit request"
approved_at: "2026-08-31"
---

# Intent: Normalize every project document

## Problem

The first documentation pass created navigation and removed two proven duplicates, but it still
leaves dated research, completed implementation plans, current contracts, assets, and historical
SDLC records mixed under live-looking paths. Eleven historical change Artifacts also remain on the
legacy schema. The user requested an explicit decision for every file under `docs/`, with old or
non-current material archived and maintained material migrated to one current convention.

The outcome is a documentation tree where location communicates authority: maintained contracts,
guides, active designs, ADRs, and lifecycle machinery stay live; completed plans, snapshots, and
dated research move under a visible archive; every change record uses the current schema; and one
catalog accounts for every retained file and asset.

## Proposed outcome

The first documentation pass created navigation and removed two proven duplicates, but it still

## Affected users and systems

Migrated from legacy change.md.

## Constraints

The current user request accepts this Intent and observable Spec. It authorizes repository-local
documentation moves, schema migration, archive notices, reference repair, and removal of files
proven redundant or unowned. It does not authorize commit, push, pull-request creation, merge,
release, deployment, external settings, or production mutation.

This is medium risk because it moves most historical documentation and rewrites lifecycle metadata,
but it does not alter runtime behavior or user data. The Gate requires a complete before/after file
inventory, explicit archive manifest, local-link closure, lifecycle Evals, and a committed-diff
dry-run before `verified`.

## Out of scope

Not recorded in the legacy single-file Artifact.

## Success signals

See Spec acceptance criteria.

## Open questions

None recorded in migration.

## Decision

The current user request accepts this Intent and observable Spec. It authorizes repository-local
documentation moves, schema migration, archive notices, reference repair, and removal of files
proven redundant or unowned. It does not authorize commit, push, pull-request creation, merge,
release, deployment, external settings, or production mutation.

This is medium risk because it moves most historical documentation and rewrites lifecycle metadata,
but it does not alter runtime behavior or user data. The Gate requires a complete before/after file
inventory, explicit archive manifest, local-link closure, lifecycle Evals, and a committed-diff
dry-run before `verified`.
