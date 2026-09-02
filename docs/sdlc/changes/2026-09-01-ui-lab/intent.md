---
id: "2026-09-01-ui-lab"
stage: intent
schema: 3
status: accepted
owner: codex
created: 2026-09-01
source: direct user request after clarifying that the earlier PR screenshots came from a temporary fixture page
risk: low
approved_by: "userthe 2026-09-01 request to make UI test and design-system demo pages permanent"
approved_at: "2026-09-01"
---

# Intent: Add a permanent UI Lab and design-system demo catalog

## Problem

The repository has a substantial `?design-system` preview and several one-off development query
routes, but no single discoverable catalog for stable UI fixtures. During PR-workspace validation a
temporary page was useful for rendering real components with deterministic data, yet the resulting
screenshot could be mistaken for the actual desktop application. The user asked to make a fixed
set of UI test and design-system demo pages available for future design and regression work.

The desired outcome is a development-only UI Lab with canonical URLs, an explicit fixture identity,
and real production components driven by deterministic local data. It must reuse the existing
design system and previews, avoid a second visual language, avoid remote GitHub actions, and stay
out of normal production application behavior. It is a developer surface, not evidence that an
authenticated real-app workflow passed.

## Proposed outcome

The repository has a substantial `?design-system` preview and several one-off development query

## Affected users and systems

Migrated from legacy change.md.

## Constraints

The user's direct implementation request on 2026-09-01 accepts Intent and this narrowly scoped
developer-tool design. Codex owns implementation and owner verification. The user's later `pr`
request authorizes creating a branch, pushing this verified scope, and opening a Draft PR. Merge,
release, deployment, and production mutation remain unauthorized.

## Out of scope

Not recorded in the legacy single-file Artifact.

## Success signals

See Spec acceptance criteria.

## Open questions

None recorded in migration.

## Decision

The user's direct implementation request on 2026-09-01 accepts Intent and this narrowly scoped
developer-tool design. Codex owns implementation and owner verification. The user's later `pr`
request authorizes creating a branch, pushing this verified scope, and opening a Draft PR. Merge,
release, deployment, and production mutation remain unauthorized.
