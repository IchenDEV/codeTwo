---
id: "2026-09-01-pr-workspace-and-dock"
stage: intent
schema: 3
status: accepted
owner: codex
created: 2026-09-01
source: direct user request with an attached PR-workspace reference, followed by approval of the rendered CodeTwo prototype and an explicit request to implement it
risk: medium
approved_by: "userthe 2026-09-01 PR workspace implementation approval"
approved_at: "2026-09-01"
---

# Intent: Improve the PR workspace and add a conversation-side PR surface

## Problem

The user wants CodeTwo's GitHub pull-request experience to carry the information hierarchy of the
supplied reference without copying its application-wide navigation. The full Pull requests page
currently has a list and detail view, but branch, review, checks, status, and task metadata compete
inside one central column. The right work Dock already contains a capable current-branch PR panel,
but it is hidden inside the broader Git surface and therefore is not a direct conversation-side PR
destination.

The desired outcome is a macOS-oriented split workspace: global PR selection on the leading side,
the selected PR's title and content in the primary region, and contextual merge/review/check/task
state in a trailing Inspector. Beside a coding conversation, PR must be a first-class Dock surface
that follows the focused session's checkout and branch. This change must reuse the existing GitHub
bridge, review/merge behavior, design tokens, workbench breakpoints, and Dock ownership. It must not
add another GitHub protocol, change merge authorization, create or mutate pull requests, redesign
the application rail, or introduce a mobile application layout.

## Proposed outcome

The user wants CodeTwo's GitHub pull-request experience to carry the information hierarchy of the

## Affected users and systems

Migrated from legacy change.md.

## Constraints

The user approved the rendered direction and explicitly requested implementation on 2026-09-01,
which accepts Intent, Spec, and the visual design Gate for execution. Codex owns implementation and
owner verification. No security, data migration, provider protocol, merge, release, deployment, or
production Gate is opened. The user's separate `pr` request on 2026-09-01 authorizes creating a
branch, pushing this verified scope, and opening a Draft PR; it does not authorize merging,
releasing, or deploying CodeTwo.

## Out of scope

Not recorded in the legacy single-file Artifact.

## Success signals

See Spec acceptance criteria.

## Open questions

None recorded in migration.

## Decision

The user approved the rendered direction and explicitly requested implementation on 2026-09-01,
which accepts Intent, Spec, and the visual design Gate for execution. Codex owns implementation and
owner verification. No security, data migration, provider protocol, merge, release, deployment, or
production Gate is opened. The user's separate `pr` request on 2026-09-01 authorizes creating a
branch, pushing this verified scope, and opening a Draft PR; it does not authorize merging,
releasing, or deploying CodeTwo.
