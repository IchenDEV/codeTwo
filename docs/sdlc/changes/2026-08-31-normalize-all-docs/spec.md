---
id: "2026-08-31-normalize-all-docs"
stage: spec
schema: 3
status: accepted
owner: codex
created: 2026-08-31
based_on: intent.md
risk: medium
approved_by: "userthe current 2026-08-31 full-document audit request"
approved_at: "2026-08-31"
---

# Spec: Normalize every project document

## Requirements

- Audit every file under `docs/`, including Markdown, images, SDLC records, templates, and Evals.
- Keep only maintained contracts, current guides, active designs, accepted ADRs, current assets,
  and current SDLC machinery outside `docs/archive/`.
- Move dated research and completed product/design plans into topic-based archive directories.
  Archived content remains immutable historical evidence except for path/link repair and a clear
  archive notice; Git history preserves provenance.
- Migrate every historical change Artifact to schema 2 rather than retaining the legacy exception.
  Preserve its id, status, original claim boundaries, approval source, and evidence.
- Give every maintained or archived Markdown document a visible status and authority boundary,
  either in its own header or through an enclosing archive/catalog contract.
- Add a deterministic catalog Gate that rejects unclassified files, ambiguous classification,
  active dated research, legacy change schemas, and unreferenced documentation images; run it in
  the existing SDLC CI workflow.
- Repair all repository-local links after moves. Remove unreferenced documentation assets only when
  they have no retained evidentiary value; otherwise colocate them with the document they support.
- Update source comments only where a moved document would otherwise leave a dead reference. Do not
  change product behavior, public website content, or external repository state.

## User experience

Not separately recorded in legacy change.md.

## Technical design

See Requirements and legacy Git history.

## Security and privacy

See migrated Decision and gates.

## Alternatives and non-goals

Not separately recorded in legacy change.md.

## Areas of concern

The current user request accepts this Intent and observable Spec. It authorizes repository-local
documentation moves, schema migration, archive notices, reference repair, and removal of files
proven redundant or unowned. It does not authorize commit, push, pull-request creation, merge,
release, deployment, external settings, or production mutation.

This is medium risk because it moves most historical documentation and rewrites lifecycle metadata,
but it does not alter runtime behavior or user data. The Gate requires a complete before/after file
inventory, explicit archive manifest, local-link closure, lifecycle Evals, and a committed-diff
dry-run before `verified`.

## Acceptance criteria

- [x] AC-1: A machine-checkable catalog accounts for every retained file under `docs/` with one classification and authority rule.
- [x] AC-2: Only maintained contracts, current guides, active designs, ADRs, assets, and SDLC machinery remain outside the archive.
- [x] AC-3: Every dated research report and completed Scenes 1.0 plan is archived with provenance and working links.
- [x] AC-4: Every canonical change Artifact uses schema 2 and passes the current acceptance-evidence and verification-identity contract.
- [x] AC-5: Every live Markdown document states or inherits a truthful current status; no archived document is presented as a current specification.
- [x] AC-6: Every retained image is referenced by a live or archived document and stored with the owning documentation category.
- [x] AC-7: Full link, catalog, lifecycle, worktree, diff, and isolated committed-diff checks pass with failures and residual risk recorded.

## Decision

The current user request accepts this Intent and observable Spec. It authorizes repository-local
documentation moves, schema migration, archive notices, reference repair, and removal of files
proven redundant or unowned. It does not authorize commit, push, pull-request creation, merge,
release, deployment, external settings, or production mutation.

This is medium risk because it moves most historical documentation and rewrites lifecycle metadata,
but it does not alter runtime behavior or user data. The Gate requires a complete before/after file
inventory, explicit archive manifest, local-link closure, lifecycle Evals, and a committed-diff
dry-run before `verified`.
