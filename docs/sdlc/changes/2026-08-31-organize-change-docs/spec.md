---
id: "2026-08-31-organize-change-docs"
stage: spec
schema: 3
status: accepted
owner: codex
created: 2026-08-31
based_on: intent.md
risk: medium
approved_by: "userthe current 2026-08-31 implementation request"
approved_at: "2026-08-31"
---

# Spec: Organize change bundles and project documentation

## Requirements

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

## User experience

Not separately recorded in legacy change.md.

## Technical design

See Requirements and legacy Git history.

## Security and privacy

See migrated Decision and gates.

## Alternatives and non-goals

Not separately recorded in legacy change.md.

## Areas of concern

The current user request accepts this Intent and observable Spec. It authorizes in-repository moves,
document consolidation, deletion of proven superseded files, and applicable local validation. It
does not authorize commit, push, PR creation, merge, release, deployment, external settings, or
production mutation.

This is medium risk because it changes canonical paths and deletes documentation, but it does not
change application behavior or user data. The Gate is broken-link, content-preservation, checker,
and committed-diff verification before the change may become `verified`.

## Acceptance criteria

- [x] AC-1: Every existing change Artifact is discoverable at one canonical bundle path and keeps its id, state, substantive history, and Git-move provenance.
- [x] AC-2: The checker accepts bundle paths, rejects flat change files, and applies schema/scope Gates to added or updated `change.md` files.
- [x] AC-3: `docs/README.md` gives one non-duplicated route to every maintained project-document category and states the authority boundary.
- [x] AC-4: The two explicitly superseded t3code reports are removed, retained research links resolve to current source paths, and no local Markdown links are broken.
- [x] AC-5: Normative Scenes 1.0, pending Scenes 2.0, plugin, architecture, design, memory, remote, ADR, and later research documents remain available and truthfully classified.
- [x] AC-6: Focused lifecycle tests, repository validation, worktree validation, committed-diff dry-run, and `git diff --check` pass with evidence recorded in the bundle.

## Decision

The current user request accepts this Intent and observable Spec. It authorizes in-repository moves,
document consolidation, deletion of proven superseded files, and applicable local validation. It
does not authorize commit, push, PR creation, merge, release, deployment, external settings, or
production mutation.

This is medium risk because it changes canonical paths and deletes documentation, but it does not
change application behavior or user data. The Gate is broken-link, content-preservation, checker,
and committed-diff verification before the change may become `verified`.
