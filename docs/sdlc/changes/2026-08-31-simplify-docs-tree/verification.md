---
id: "2026-08-31-simplify-docs-tree"
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

# Verification: Simplify the docs directory tree

## Automated checks

Verdict: verified.

### Acceptance evidence

- AC-1: PASS — `find docs -maxdepth 1 -type f` returns only `docs/README.md` and `docs/catalog.json`; `find docs -mindepth 1 -maxdepth 1 -type d` returns exactly the six documented categories.
- AC-2: PASS — [`docs/README.md`](../../../README.md), [`reference/README.md`](../../../reference/README.md), and [`design/README.md`](../../../design/README.md) route to every moved maintained document, while `bun script/verify/docs.ts` classifies all 78 retained files exactly once.
- AC-3: PASS — `bun script/verify/docs.ts` returned `[docs] catalog, links, schemas, and assets valid`, and `rg 'docs/(architecture|design|memory|plugin-protocol|plugin-standard|plugins|remote-agent|scenes)\.md'` found no obsolete canonical path.
- AC-4: PASS — the pre-consolidation docs and SDLC suites plus `bun test apps/desktop/tests/uiStack.test.ts` passed 25 tests with 65 assertions; both lifecycle modes and both diff checks passed. A temporary committed copy of every tracked and untracked change also passed the docs Gate, lifecycle `--base HEAD~1` Gate, affected UI-stack test, and diff check.

Residual risk: external links into the old GitHub paths will not redirect until a hosting layer or
compatibility stub is added; adding duplicate stub documents would undermine the requested clean
tree, so this change updates all repository-owned callers instead. Hosted CI and human semantic
review have not run for this unpushed worktree. Git will determine final rename similarity only
when the files are staged or committed.

## Behavioral evidence

Verdict: verified.

### Acceptance evidence

- AC-1: PASS — `find docs -maxdepth 1 -type f` returns only `docs/README.md` and `docs/catalog.json`; `find docs -mindepth 1 -maxdepth 1 -type d` returns exactly the six documented categories.
- AC-2: PASS — [`docs/README.md`](../../../README.md), [`reference/README.md`](../../../reference/README.md), and [`design/README.md`](../../../design/README.md) route to every moved maintained document, while `bun script/verify/docs.ts` classifies all 78 retained files exactly once.
- AC-3: PASS — `bun script/verify/docs.ts` returned `[docs] catalog, links, schemas, and assets valid`, and `rg 'docs/(architecture|design|memory|plugin-protocol|plugin-standard|plugins|remote-agent|scenes)\.md'` found no obsolete canonical path.
- AC-4: PASS — the pre-consolidation docs and SDLC suites plus `bun test apps/desktop/tests/uiStack.test.ts` passed 25 tests with 65 assertions; both lifecycle modes and both diff checks passed. A temporary committed copy of every tracked and untracked change also passed the docs Gate, lifecycle `--base HEAD~1` Gate, affected UI-stack test, and diff check.

Residual risk: external links into the old GitHub paths will not redirect until a hosting layer or
compatibility stub is added; adding duplicate stub documents would undermine the requested clean
tree, so this change updates all repository-owned callers instead. Hosted CI and human semantic
review have not run for this unpushed worktree. Git will determine final rename similarity only
when the files are staged or committed.

## Visual evidence

See bundle evidence/ when present.

## Security and privacy evidence

Not separately recorded unless present in legacy Verification.

## Deviations and residual risk

Residual risk: external links into the old GitHub paths will not redirect until a hosting layer or

## Verdict

Verdict: verified..

## Review and release

Approval: user approved pull-request creation and merge on 2026-08-31.
Pull request: [#189](https://github.com/IchenDEV/codeTwo/pull/189).
Release target: none.
Release identity: not applicable until released.
Smoke evidence: not applicable until released.
Rollback: revert this documentation-path change.
No release: this organization-only change does not publish a product package.

Preparing or verifying this change does not authorize merge, push, deployment, or release.

## Feedback

The catalog should explain the tree, but it should not be needed to compensate for a visually
confusing root. Physical placement now carries the primary meaning.
