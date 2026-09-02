---
id: "2026-08-31-simplify-docs-tree"
stage: plan
schema: 3
status: accepted
owner: codex
created: 2026-08-31
based_on: spec.md
risk: low
scope: docs, README.md, website, apps, crates, packs
approved_by: "userthe current 2026-08-31 request to make the docs directory less messy"
approved_at: "2026-08-31"
---

# Plan: Simplify the docs directory tree

## Files and ownership

docs, README.md, website, apps, crates, packs

## Order of work

1. Create `reference/`, move the seven technical reference documents, and add its index.
2. Move the design-system contract to `design/system.md`.
3. Rewrite the top-level docs map and catalog paths, then repair every repository reference.
4. Run the documentation, lifecycle, worktree, test, diff, and isolated committed-diff checks.

Rollback is a repository revert restoring the prior paths. No runtime data or external cleanup is
required.

## Test-first proof

See legacy Verification section.

## Visual or integration proof

See legacy Verification section.

## Risks and mitigations

See legacy Decision and gates.

## Rollback

See legacy Review and release.

## Deviations

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

## Decision

The user's direct request approves this low-risk repository-local organization change. It does not
authorize commit, push, pull-request creation, merge, release, deployment, or external mutation.
The Gate is complete link closure and preservation of the existing documentation classifications.
