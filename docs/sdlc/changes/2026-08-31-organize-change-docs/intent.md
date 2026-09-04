---
id: "2026-08-31-organize-change-docs"
stage: intent
schema: 3
status: accepted
owner: codex
created: 2026-08-31
source: current user request to organize changes like the adjacent project and remove stale documentation
risk: medium
approved_by: "userthe current 2026-08-31 implementation request"
approved_at: "2026-08-31"
---

# Intent: Organize change bundles and project documentation

## Problem

The canonical change history is currently a flat list of Markdown files. That makes per-change
evidence awkward to colocate and is visually harder to scan than the adjacent project's
one-directory-per-change layout. Project documentation also has no index separating normative
contracts, implementation guides, dated research, and historical material. A live link audit found
stale source paths, while two early t3code reports are explicitly superseded by the later expanded
gap audit and still point at the removed Tauri host.

The outcome is a navigable change-bundle directory and a smaller, explicit documentation surface.
Historical facts and Git history remain intact; content is removed only when a later retained
document explicitly supersedes it or the repository no longer contains the described source path.

## Proposed outcome

The canonical change history is currently a flat list of Markdown files. That makes per-change

## Affected users and systems

Migrated from legacy change.md.

## Constraints

The current user request accepts this Intent and observable Spec. It authorizes in-repository moves,
document consolidation, deletion of proven superseded files, and applicable local validation. It
does not authorize commit, push, PR creation, merge, release, deployment, external settings, or
production mutation.

This is medium risk because it changes canonical paths and deletes documentation, but it does not
change application behavior or user data. The Gate is broken-link, content-preservation, checker,
and committed-diff verification before the change may become `verified`.

## Out of scope

Not recorded in the legacy single-file Artifact.

## Success signals

See Spec acceptance criteria.

## Open questions

None recorded in migration.

## Decision

The current user request accepts this Intent and observable Spec. It authorizes in-repository moves,
document consolidation, deletion of proven superseded files, and applicable local validation. It
does not authorize commit, push, PR creation, merge, release, deployment, external settings, or
production mutation.

This is medium risk because it changes canonical paths and deletes documentation, but it does not
change application behavior or user data. The Gate is broken-link, content-preservation, checker,
and committed-diff verification before the change may become `verified`.
