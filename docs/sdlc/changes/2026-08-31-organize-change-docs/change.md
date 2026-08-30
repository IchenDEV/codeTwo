---
id: change-2026-08-31-organize-change-docs
kind: change
schema: 2
status: verified
risk: medium
owner: codex
approvers: user via the current 2026-08-31 implementation request
approved_at: 2026-08-31
created: 2026-08-31
updated: 2026-08-31
source: current user request to organize changes like the adjacent project and remove stale documentation
inputs: the current schema-2 SDLC worktree, the adjacent doubao-work-skin change bundles, and the live documentation link graph
outputs: one-directory-per-change layout, a project documentation index, and removal or correction of proven stale documents
scope: docs, script/verify/sdlc.ts, script/verify/checks.test.ts, AGENTS.md, .github/pull_request_template.md, README.md
next_trigger: merge the approved pull request after required checks pass
verification_mode: owner
verified_by: codex
verified_at: 2026-08-31
---

# Organize change bundles and project documentation

## Intent

The canonical change history is currently a flat list of Markdown files. That makes per-change
evidence awkward to colocate and is visually harder to scan than the adjacent project's
one-directory-per-change layout. Project documentation also has no index separating normative
contracts, implementation guides, dated research, and historical material. A live link audit found
stale source paths, while two early t3code reports are explicitly superseded by the later expanded
gap audit and still point at the removed Tauri host.

The outcome is a navigable change-bundle directory and a smaller, explicit documentation surface.
Historical facts and Git history remain intact; content is removed only when a later retained
document explicitly supersedes it or the repository no longer contains the described source path.

## Spec

- Every canonical change lives at `docs/sdlc/changes/<date>-<slug>/change.md`; future runtime or
  visual evidence may live beside it without creating another registry.
- The compact `change.md` remains the single lifecycle state authority. Intent, Spec, Plan, Build,
  Verification, Review/Release, and Feedback stay as sections rather than duplicated stage facts.
- The checker, tests, workflow, root instructions, templates, PR handoff, and all local links use
  the directory layout. Flat change Markdown files are rejected after migration.
- Add a concise `docs/README.md` that distinguishes normative documents, current designs, user or
  operator guides, dated research snapshots, SDLC records, and generated screenshots.
- Remove only the two 2026-08-06 t3code reports that the retained 2026-08-07 audit explicitly
  supersedes. Preserve later incremental research and repair its live source links after module
  moves.
- Do not delete the implemented Agent Scenes 1.0 contract or its maintained implementation records;
  Scenes 2.0 is accepted but still pending and therefore does not supersede the live 1.0 contract.

### Acceptance criteria

- [x] AC-1: Every existing change Artifact is discoverable at one canonical bundle path and keeps its id, state, substantive history, and Git-move provenance.
- [x] AC-2: The checker accepts bundle paths, rejects flat change files, and applies schema/scope Gates to added or updated `change.md` files.
- [x] AC-3: `docs/README.md` gives one non-duplicated route to every maintained project-document category and states the authority boundary.
- [x] AC-4: The two explicitly superseded t3code reports are removed, retained research links resolve to current source paths, and no local Markdown links are broken.
- [x] AC-5: Normative Scenes 1.0, pending Scenes 2.0, plugin, architecture, design, memory, remote, ADR, and later research documents remain available and truthfully classified.
- [x] AC-6: Focused lifecycle tests, repository validation, worktree validation, committed-diff dry-run, and `git diff --check` pass with evidence recorded in the bundle.

## Decision and gates

The current user request accepts this Intent and observable Spec. It authorizes in-repository moves,
document consolidation, deletion of proven superseded files, and applicable local validation. It
does not authorize commit, push, PR creation, merge, release, deployment, external settings, or
production mutation.

This is medium risk because it changes canonical paths and deletes documentation, but it does not
change application behavior or user data. The Gate is broken-link, content-preservation, checker,
and committed-diff verification before the change may become `verified`.

## Plan

1. Move every flat change file into a same-id directory as `change.md`, then repair relative links.
2. Update checker path discovery, id derivation, forbidden-flat-file enforcement, tests, workflow,
   root instructions, template guidance, and PR handoff.
3. Add the documentation index; remove the two explicitly superseded research inputs; repair live
   source links in retained research.
4. Run content/link inventories, lifecycle Evals, live worktree validation, and an isolated
   committed-diff dry-run.

Rollback is a repository revert that restores the flat files, prior checker path rules, and removed
research files from Git. No migration, generated asset, or external cleanup is required.

## Build

Fourteen existing flat Artifacts moved into same-id bundles. Eleven are exact `R100` moves; the
three whose relative links changed were also upgraded to schema 2 so edited historical records do
not bypass the stricter contract. The strict-SDLC and documentation-organization Artifacts were
created directly in bundle form. The checker now derives ids from bundle names, rejects flat files,
discovers `change.md`, and permits only unchanged legacy `R100` layout migrations without upgrade.

The rebase onto `origin/main` brought ten additional flat change records created by intervening
merged PRs. They were moved into the same bundle layout and upgraded to schema 2 while preserving
their status, approval, acceptance, verification, and residual-risk record. Two newly merged Feishu
research reports were placed directly in the research archive and added to its index.

[`docs/README.md`](../../../README.md) now separates current contracts, active designs, dated
research, assets, and development records. The root README routes through that map. The two
superseded 2026-08-06 t3code reports were deleted; the retained
[`expanded gap audit`](../../../archive/research/t3code-expanded-gap-audit-2026-08-07.md) records their
replacement and Git-history recovery boundary. Retained iCloud and t3code research links now point
to the Rust host and moved plugin module. [`scenes.md`](../../../reference/scenes.md) identifies 1.0 as the
implemented normative contract and links the accepted, pending 2.0 design. No product runtime,
website content, release automation, or external state changed.

## Verification

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

## Review and release

Approval: user approved pull-request creation and merge on 2026-08-31.
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
