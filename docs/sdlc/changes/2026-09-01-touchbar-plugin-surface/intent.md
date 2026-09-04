---
id: "2026-09-01-touchbar-plugin-surface"
stage: intent
schema: 3
status: accepted
owner: codex
created: 2026-09-01
source: user request on 2026-09-01 for a foreground-only Touch Bar plugin, followed by explicit direction to keep the plugin framework target-neutral and apply Ponytail at full intensity
risk: medium
approved_by: "[user]"
approved_at: "2026-09-01"
---

# Intent: Project existing plugin UI actions to the Touch Bar

## Problem

C2 should show agent-session actions on the public macOS Touch Bar while C2 is foreground. Session
selection, ordering, labels, and actions remain owned by an installable plugin. Core must not know
about AppKit, Touch Bar, windows, or a particular bundle.

The implementation must reuse the existing plugin model wherever it already satisfies the need. It
does not add cross-application persistence, private macOS APIs, arbitrary plugin renderer code,
direct SQLite reads, approval actions, or a universal UI document language.

## Proposed outcome

C2 should show agent-session actions on the public macOS Touch Bar while C2 is foreground. Session

## Affected users and systems

Migrated from legacy change.md.

## Constraints

The user's direct implementation request accepts this medium-risk Intent. The later full Ponytail
request replaces the earlier parallel `surfaces` design with reuse of the existing UI contribution
path. Codex owns implementation and verification. Merge, release, deployment, plugin publication,
and production mutation remain separate human Gates.

## Out of scope

Not recorded in the legacy single-file Artifact.

## Success signals

See Spec acceptance criteria.

## Open questions

None recorded in migration.

## Decision

The user's direct implementation request accepts this medium-risk Intent. The later full Ponytail
request replaces the earlier parallel `surfaces` design with reuse of the existing UI contribution
path. Codex owns implementation and verification. Merge, release, deployment, plugin publication,
and production mutation remain separate human Gates.
