---
id: change-2026-08-31-normalize-all-docs
kind: change
schema: 2
status: verified
risk: medium
owner: codex
approvers: user via the current 2026-08-31 full-document audit request
approved_at: 2026-08-31
created: 2026-08-31
updated: 2026-08-31
source: current user request to inspect every file under docs and archive or migrate anything outside the current documentation standard
inputs: the organized change bundles, current source tree, all files under docs, and the current SDLC workflow
outputs: a complete documentation catalog, an explicit archive boundary, migrated current documents, and schema-2 change history
scope: docs, README.md, AGENTS.md, .github/workflows/sdlc.yml, script/verify/docs.ts, script/verify/sdlc.ts, script/verify/checks.test.ts, apps/desktop/src/App.tsx, apps/desktop/src/session/toolActivity.ts, apps/desktop/src/sidebar/MissionControl.tsx, crates/core/src/scene_runtime.rs
next_trigger: merge the approved pull request after required checks pass
verification_mode: owner
verified_by: codex
verified_at: 2026-08-31
---

# Normalize every project document

## Intent

The first documentation pass created navigation and removed two proven duplicates, but it still
leaves dated research, completed implementation plans, current contracts, assets, and historical
SDLC records mixed under live-looking paths. Eleven historical change Artifacts also remain on the
legacy schema. The user requested an explicit decision for every file under `docs/`, with old or
non-current material archived and maintained material migrated to one current convention.

The outcome is a documentation tree where location communicates authority: maintained contracts,
guides, active designs, ADRs, and lifecycle machinery stay live; completed plans, snapshots, and
dated research move under a visible archive; every change record uses the current schema; and one
catalog accounts for every retained file and asset.

## Spec

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

### Acceptance criteria

- [x] AC-1: A machine-checkable catalog accounts for every retained file under `docs/` with one classification and authority rule.
- [x] AC-2: Only maintained contracts, current guides, active designs, ADRs, assets, and SDLC machinery remain outside the archive.
- [x] AC-3: Every dated research report and completed Scenes 1.0 plan is archived with provenance and working links.
- [x] AC-4: Every canonical change Artifact uses schema 2 and passes the current acceptance-evidence and verification-identity contract.
- [x] AC-5: Every live Markdown document states or inherits a truthful current status; no archived document is presented as a current specification.
- [x] AC-6: Every retained image is referenced by a live or archived document and stored with the owning documentation category.
- [x] AC-7: Full link, catalog, lifecycle, worktree, diff, and isolated committed-diff checks pass with failures and residual risk recorded.

## Decision and gates

The current user request accepts this Intent and observable Spec. It authorizes repository-local
documentation moves, schema migration, archive notices, reference repair, and removal of files
proven redundant or unowned. It does not authorize commit, push, pull-request creation, merge,
release, deployment, external settings, or production mutation.

This is medium risk because it moves most historical documentation and rewrites lifecycle metadata,
but it does not alter runtime behavior or user data. The Gate requires a complete before/after file
inventory, explicit archive manifest, local-link closure, lifecycle Evals, and a committed-diff
dry-run before `verified`.

## Plan

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

## Build

[`docs/catalog.json`](../../../catalog.json) now classifies all 63 retained files with exactly one
authority rule: 8 current contracts, 5 active-design files, 2 accepted ADRs, 3 publication assets,
5 SDLC authority files, 17 change records, 21 archive files, and 2 catalog files. The rewritten
[`docs/README.md`](../../../README.md) is the human authority map. It leaves 42 files in the live
tree and places 21 files behind the explicit non-normative
[`archive boundary`](../../../archive/README.md).

Ten dated research reports moved to [`archive/research`](../../../archive/research/README.md). The
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

All 17 change records now use schema 2. The last schema-1 compatibility exception was removed from
[`check-sdlc.ts`](../../../../script/verify/sdlc.ts), and its Eval now proves legacy Artifacts fail
even during path-only migration. The new [`check-docs.ts`](../../../../script/verify/docs.ts) Gate and
focused fixtures enforce exact catalog coverage, archive placement for dated snapshots, schema-2
history, local-link closure, and image ownership. Repository instructions, the SDLC workflow, and
CI invoke the same Gate. No product behavior, persisted data, public website content, release
automation, or external state changed.

## Verification

Verdict: verified.

### Acceptance evidence

- AC-1: PASS — `bun script/verify/docs.ts` returned `[docs] catalog, links, schemas, and assets valid`; an independent rule count classified all 63 files exactly once.
- AC-2: PASS — a `find docs -type f` inventory resolved through [`docs/catalog.json`](../../../catalog.json) found 42 live files and 21 archive files; the live tree contains only catalog, contract, accepted ADR, active-design, publication-asset, SDLC-authority, and change-record classifications.
- AC-3: PASS — `git diff HEAD --summary` preserves move provenance for ten research reports, three completed plans, and three screenshots; archive manifests enumerate the moved evidence, and the local-link Gate passes.
- AC-4: PASS — the schema inventory found 17 change records and zero legacy schemas; `bun script/verify/sdlc.ts` and the focused Eval both pass after deletion of the schema-1 exception.
- AC-5: PASS — [`docs/README.md`](../../../README.md), the archive boundary, design index, screenshot owner, and status lines in current contracts distinguish maintained, accepted-pending, publication, historical-state, and non-normative material.
- AC-6: PASS — `bun script/verify/docs.ts` found no unreferenced image; the seven retained images are owned by active design, publication screenshots, or the Scenes 1.0 archive.
- AC-7: PASS — the pre-consolidation docs and SDLC suites passed 20 tests with 44 assertions; the docs checker, plain lifecycle checker, `--worktree` Gate, `git diff --check`, and `git diff --cached --check` passed. A temporary committed copy of the complete tracked and untracked diff also passed both repository Gates with `--base HEAD~1` and diff checking.

The first live documentation-Gate run produced 20 errors because it included VitePress
extensionless publication routes, three moved research links still used their old relative depth,
the old documentation index was incomplete, and one publication screenshot was not Markdown
linked. The checker scope was narrowed to repository documentation rather than the independent
website router, and the actual links, catalog, and image owner were repaired. The first migrated
schema-history run then exposed 29 acceptance mappings without concrete evidence citations and one
research link moved by this audit; all records were repaired before the passing results above.

Residual risk: archived research remains historical evidence, not a fresh validation of its
conclusions against current upstream products. Link validation proves repository-local target
closure, not external URL availability or semantic freshness. The retained publication screenshots
were classified and owned rather than recaptured. Hosted CI and human semantic review have not run
for this unpushed worktree. Git viewers may show the schema-upgraded historical files as lower-score
renames, but their ids, states, claim boundaries, and original outcomes remain intact.

## Review and release

Approval: user approved pull-request creation and merge on 2026-08-31.
Release target: none.
Release identity: not applicable until released.
Smoke evidence: not applicable until released.
Rollback: revert this documentation-normalization diff.
No release: this repository-documentation change does not publish a product package.

Preparing or verifying this change does not authorize merge, push, deployment, or release.

## Feedback

The previous pass proved that folder-level navigation is insufficient when individual files still
look current despite representing historical research or completed plans. This change therefore
uses an exhaustive file catalog and a first-class archive boundary. The failed first Gate also
showed that repository-contract links and VitePress publication routes need separate resolvers; the
documentation checker deliberately owns only the former while the website retains its own build
validation.
