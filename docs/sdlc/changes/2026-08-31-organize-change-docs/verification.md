---
id: "2026-08-31-organize-change-docs"
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

# Verification: Organize change bundles and project documentation

## Automated checks

Verdict: verified.

### Acceptance evidence

- AC-1: PASS — `find docs/sdlc/changes -mindepth 2 -maxdepth 2 -name change.md` found 29 bundles, the flat-file inventory found zero, and Git retained rename provenance for the 24 records moved by this branch.
- AC-2: PASS — `bun test script/verify/checks.test.ts` passed 16 tests with 37 assertions, including canonical bundle, forbidden flat path, schema upgrade, scope, and unchanged `R100` migration fixtures.
- AC-3: PASS — [`docs/README.md`](../../../README.md) links each maintained category once and `bun script/verify/docs.ts` resolves the final repository link graph.
- AC-4: PASS — the exact-file and stale-path inventory found neither removed report nor the obsolete Bun database and Core plugin links; `bun script/verify/docs.ts` reports the final catalog and local links valid.
- AC-5: PASS — [`docs/README.md`](../../../README.md), [`scenes.md`](../../../reference/scenes.md), and `find docs -maxdepth 2 -type f` retain and classify current contracts, pending Scenes 2.0 records, ADRs, guides, assets, and archived research.
- AC-6: PASS — `bun script/verify/sdlc.ts`, `bun script/verify/sdlc.ts --worktree`, `git diff --check`, and `git diff --cached --check` passed; an isolated committed copy of all tracked and untracked changes also passed `bun script/verify/sdlc.ts --base HEAD~1` and diff checking.

The first focused test run after adding bundle cases failed three fixtures: two replacement strings
still named old relative paths and the branch Gate did not exclude the source of an unchanged
rename. The fixtures and Gate were corrected before the 16-test passing result.

After the rebase migration, the consolidated Gate passed 5 focused tests with 23 assertions; the
plain docs and lifecycle checks also passed with 29 schema-2 bundles and no flat change files.

Residual risk: Git viewers may render the three schema-upgraded historical Artifacts as lower-score
renames, although their ids, status, conclusions, and original evidence remain intact. The two
deleted research inputs are recoverable from Git but no longer discoverable in the live tree.
Hosted CI and human semantic review have not run for this unpushed worktree; the local link audit
checks targets, not whether every retained research conclusion is still current.

## Behavioral evidence

Verdict: verified.

### Acceptance evidence

- AC-1: PASS — `find docs/sdlc/changes -mindepth 2 -maxdepth 2 -name change.md` found 29 bundles, the flat-file inventory found zero, and Git retained rename provenance for the 24 records moved by this branch.
- AC-2: PASS — `bun test script/verify/checks.test.ts` passed 16 tests with 37 assertions, including canonical bundle, forbidden flat path, schema upgrade, scope, and unchanged `R100` migration fixtures.
- AC-3: PASS — [`docs/README.md`](../../../README.md) links each maintained category once and `bun script/verify/docs.ts` resolves the final repository link graph.
- AC-4: PASS — the exact-file and stale-path inventory found neither removed report nor the obsolete Bun database and Core plugin links; `bun script/verify/docs.ts` reports the final catalog and local links valid.
- AC-5: PASS — [`docs/README.md`](../../../README.md), [`scenes.md`](../../../reference/scenes.md), and `find docs -maxdepth 2 -type f` retain and classify current contracts, pending Scenes 2.0 records, ADRs, guides, assets, and archived research.
- AC-6: PASS — `bun script/verify/sdlc.ts`, `bun script/verify/sdlc.ts --worktree`, `git diff --check`, and `git diff --cached --check` passed; an isolated committed copy of all tracked and untracked changes also passed `bun script/verify/sdlc.ts --base HEAD~1` and diff checking.

The first focused test run after adding bundle cases failed three fixtures: two replacement strings
still named old relative paths and the branch Gate did not exclude the source of an unchanged
rename. The fixtures and Gate were corrected before the 16-test passing result.

After the rebase migration, the consolidated Gate passed 5 focused tests with 23 assertions; the
plain docs and lifecycle checks also passed with 29 schema-2 bundles and no flat change files.

Residual risk: Git viewers may render the three schema-upgraded historical Artifacts as lower-score
renames, although their ids, status, conclusions, and original evidence remain intact. The two
deleted research inputs are recoverable from Git but no longer discoverable in the live tree.
Hosted CI and human semantic review have not run for this unpushed worktree; the local link audit
checks targets, not whether every retained research conclusion is still current.

## Visual evidence

See bundle evidence/ when present.

## Security and privacy evidence

Not separately recorded unless present in legacy Verification.

## Deviations and residual risk

Residual risk: Git viewers may render the three schema-upgraded historical Artifacts as lower-score

## Verdict

Verdict: verified..

## Review and release

Approval: user approved pull-request creation and merge on 2026-08-31.
Pull request: [#189](https://github.com/IchenDEV/codeTwo/pull/189).
Release target: none.
Release identity: not applicable until released.
Smoke evidence: not applicable until released.
Rollback: revert this documentation-organization diff.
No release: this documentation and repository-process change does not publish a product package.

Preparing or verifying this change does not authorize merge, push, deployment, or release.

## Feedback

The adjacent project shows that change evidence is easier to navigate when it is colocated per
change. CodeTwo retains one compact lifecycle file inside each bundle because splitting the same
state across four stage files would duplicate release and feedback authority.
