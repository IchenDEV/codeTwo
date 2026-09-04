---
id: "2026-08-31-normalize-all-docs"
stage: verification
schema: 3
status: passed
owner: codex
created: 2026-08-31
based_on: plan.md
commit: ""
verification_mode: owner
verified_by: "codex"
verified_at: "2026-08-31"
release_target: none
release_identity: "not applicable until released."
---

# Verification: Normalize every project document

## Automated checks

Verdict: verified.

### Acceptance evidence

- AC-1: PASS — `bun script/verify/docs.ts` returned `[docs] catalog, links, schemas, and assets valid`; an independent rule count classified all 78 files exactly once.
- AC-2: PASS — a `find docs -type f` inventory resolved through [`docs/catalog.json`](../../../catalog.json) found 55 live files and 23 archive files; the live tree contains only catalog, contract, accepted ADR, active-design, publication-asset, SDLC-authority, and change-record classifications.
- AC-3: PASS — `git diff origin/main...HEAD --summary` preserves move provenance for twelve research reports, three completed plans, and three screenshots; archive manifests enumerate the moved evidence, and the local-link Gate passes.
- AC-4: PASS — the schema inventory found 29 change records and zero legacy schemas; `bun script/verify/sdlc.ts` and the focused Eval both pass after deletion of the schema-1 exception.
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

## Behavioral evidence

Verdict: verified.

### Acceptance evidence

- AC-1: PASS — `bun script/verify/docs.ts` returned `[docs] catalog, links, schemas, and assets valid`; an independent rule count classified all 78 files exactly once.
- AC-2: PASS — a `find docs -type f` inventory resolved through [`docs/catalog.json`](../../../catalog.json) found 55 live files and 23 archive files; the live tree contains only catalog, contract, accepted ADR, active-design, publication-asset, SDLC-authority, and change-record classifications.
- AC-3: PASS — `git diff origin/main...HEAD --summary` preserves move provenance for twelve research reports, three completed plans, and three screenshots; archive manifests enumerate the moved evidence, and the local-link Gate passes.
- AC-4: PASS — the schema inventory found 29 change records and zero legacy schemas; `bun script/verify/sdlc.ts` and the focused Eval both pass after deletion of the schema-1 exception.
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

## Visual evidence

See bundle evidence/ when present.

## Security and privacy evidence

Not separately recorded unless present in legacy Verification.

## Deviations and residual risk

Residual risk: archived research remains historical evidence, not a fresh validation of its

## Verdict

Verdict: verified..

## Review and release

Approval: user approved pull-request creation and merge on 2026-08-31.
Pull request: [#189](https://github.com/IchenDEV/codeTwo/pull/189).
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
