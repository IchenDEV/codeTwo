---
id: change-2026-08-31-simplify-docs-tree
kind: change
schema: 2
status: verified
risk: low
owner: codex
approvers: user via the current 2026-08-31 request to make the docs directory less messy
approved_at: 2026-08-31
created: 2026-08-31
updated: 2026-08-31
source: current user clarification that the core problem is physical docs-directory organization
inputs: the fully classified documentation tree and all repository references to root-level docs
outputs: a shallow purpose-based docs tree with repaired links and unchanged product behavior
scope: docs, README.md, website, apps, crates, packs
next_trigger: merge the approved pull request after required checks pass
verification_mode: owner
verified_by: codex
verified_at: 2026-08-31
---

# Simplify the docs directory tree

## Intent

The previous audit classified every file and separated historical material, but eight maintained
documents still sit directly beside the catalog at the `docs/` root. The user clarified that the
main problem is the directory looking messy. The desired outcome is a small, obvious set of
top-level categories rather than another layer of documentation-process prose.

## Spec

- Keep only `README.md` and `catalog.json` as files at the `docs/` root.
- Put maintained technical contracts and guides under `docs/reference/` with a short local index.
- Put the design-system contract beside the existing active designs under `docs/design/`.
- Keep `adr/`, `archive/`, `screenshots/`, and `sdlc/` focused on their existing single purpose.
- Preserve file content and Git move provenance except for links, status/index text, and paths that
  must change because of the moves.
- Repair repository source comments, tests, README links, website links, archive links, and SDLC
  evidence links. Do not change runtime behavior or external state.

### Acceptance criteria

- [x] AC-1: `docs/` has no loose maintained documents beside its README and catalog.
- [x] AC-2: Every moved document has one obvious category and is reachable from the docs index.
- [x] AC-3: Every repository-local link and source reference resolves to the new canonical path.
- [x] AC-4: Catalog, lifecycle, worktree, test, and diff Gates pass with an isolated committed-diff check.

## Decision and gates

The user's direct request approves this low-risk repository-local organization change. It does not
authorize commit, push, pull-request creation, merge, release, deployment, or external mutation.
The Gate is complete link closure and preservation of the existing documentation classifications.

## Plan

1. Create `reference/`, move the seven technical reference documents, and add its index.
2. Move the design-system contract to `design/system.md`.
3. Rewrite the top-level docs map and catalog paths, then repair every repository reference.
4. Run the documentation, lifecycle, worktree, test, diff, and isolated committed-diff checks.

Rollback is a repository revert restoring the prior paths. No runtime data or external cleanup is
required.

## Build

The seven current technical documents formerly loose at the root moved under
[`reference/`](../../../reference/README.md): architecture, memory, plugin standard, plugin
protocol, internal plugins, remote agent, and Scenes 1.0. The desktop design-system contract moved
beside the other design material as [`design/system.md`](../../../design/system.md). A short index
inside each category makes its contents discoverable without knowing filenames in advance.

The rewritten [`docs/README.md`](../../../README.md) now exposes six purpose-based directories:
`reference/`, `design/`, `adr/`, `screenshots/`, `sdlc/`, and `archive/`. Only the README and the
machine [`catalog.json`](../../../catalog.json) remain as root files. The empty legacy `research/`
directory was removed; dated research already lives under `archive/research/`.

All Markdown links, root README links, public-site source links, test fixtures, schemas, Cargo
comments, Rust comments, TypeScript comments, pack examples, and historical evidence paths were
updated to their new canonical locations. Document contents and product behavior did not otherwise
change.

## Verification

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

## Review and release

Approval: user approved pull-request creation and merge on 2026-08-31.
Release target: none.
Release identity: not applicable until released.
Smoke evidence: not applicable until released.
Rollback: revert this documentation-path change.
No release: this organization-only change does not publish a product package.

Preparing or verifying this change does not authorize merge, push, deployment, or release.

## Feedback

The catalog should explain the tree, but it should not be needed to compensate for a visually
confusing root. Physical placement now carries the primary meaning.
