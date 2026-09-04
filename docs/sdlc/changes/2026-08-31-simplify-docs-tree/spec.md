---
id: "2026-08-31-simplify-docs-tree"
stage: spec
schema: 3
status: accepted
owner: codex
created: 2026-08-31
based_on: intent.md
risk: low
approved_by: "userthe current 2026-08-31 request to make the docs directory less messy"
approved_at: "2026-08-31"
---

# Spec: Simplify the docs directory tree

## Requirements

- Keep only `README.md` and `catalog.json` as files at the `docs/` root.
- Put maintained technical contracts and guides under `docs/reference/` with a short local index.
- Put the design-system contract beside the existing active designs under `docs/design/`.
- Keep `adr/`, `archive/`, `screenshots/`, and `sdlc/` focused on their existing single purpose.
- Preserve file content and Git move provenance except for links, status/index text, and paths that
  must change because of the moves.
- Repair repository source comments, tests, README links, website links, archive links, and SDLC
  evidence links. Do not change runtime behavior or external state.

## User experience

Not separately recorded in legacy change.md.

## Technical design

See Requirements and legacy Git history.

## Security and privacy

See migrated Decision and gates.

## Alternatives and non-goals

Not separately recorded in legacy change.md.

## Areas of concern

The user's direct request approves this low-risk repository-local organization change. It does not
authorize commit, push, pull-request creation, merge, release, deployment, or external mutation.
The Gate is complete link closure and preservation of the existing documentation classifications.

## Acceptance criteria

- [x] AC-1: `docs/` has no loose maintained documents beside its README and catalog.
- [x] AC-2: Every moved document has one obvious category and is reachable from the docs index.
- [x] AC-3: Every repository-local link and source reference resolves to the new canonical path.
- [x] AC-4: Catalog, lifecycle, worktree, test, and diff Gates pass with an isolated committed-diff check.

## Decision

The user's direct request approves this low-risk repository-local organization change. It does not
authorize commit, push, pull-request creation, merge, release, deployment, or external mutation.
The Gate is complete link closure and preservation of the existing documentation classifications.
