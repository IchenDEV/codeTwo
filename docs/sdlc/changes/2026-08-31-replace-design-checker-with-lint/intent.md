---
id: "2026-08-31-replace-design-checker-with-lint"
stage: intent
schema: 3
status: accepted
owner: codex
created: 2026-08-31
source: direct user request to delete the custom design checker and use lint wherever possible
risk: medium
approved_by: "[user]"
approved_at: "2026-08-31"
---

# Intent: Replace the custom design checker with standard lint tooling

## Problem

The desktop currently carries a bespoke TypeScript source scanner, a generated occurrence baseline,
and a file-scoped allowlist. The user explicitly requested that this checker be removed and that
maintained lint tooling perform the checks wherever practical. The desired result is a smaller,
ordinary toolchain with errors reported by lint rules instead of a repository-specific policy
engine.

This change covers the desktop checker, its tests and data files, package commands, the desktop
design workflow, and documentation that instructs contributors to use it. Product behavior,
design-token values, unrelated worktree changes, native Core ownership, and release packaging are
out of scope. The initial request authorized local implementation. The user subsequently authorized
PR creation and merge on 2026-08-31; release, deployment, and production mutation remain out of
scope.

## Proposed outcome

The desktop currently carries a bespoke TypeScript source scanner, a generated occurrence baseline,

## Affected users and systems

Migrated from legacy change.md.

## Constraints

The user's direct implementation request accepts Intent and the deletion-first direction. Mature
lint dependencies are permitted because no suitable linter is currently installed. The user
accepted the human review Gate and authorized PR creation and merge on 2026-08-31. Publication and
release remain unapproved.

## Out of scope

Not recorded in the legacy single-file Artifact.

## Success signals

See Spec acceptance criteria.

## Open questions

None recorded in migration.

## Decision

The user's direct implementation request accepts Intent and the deletion-first direction. Mature
lint dependencies are permitted because no suitable linter is currently installed. The user
accepted the human review Gate and authorized PR creation and merge on 2026-08-31. Publication and
release remain unapproved.
