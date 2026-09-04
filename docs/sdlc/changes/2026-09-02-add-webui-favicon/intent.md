---
id: "2026-09-02-add-webui-favicon"
stage: intent
schema: 3
status: accepted
owner: codex
created: 2026-09-02
source: direct screenshot feedback that the CLI Web UI browser tab needs a C2 icon
risk: low
approved_by: "userthe direct 2026-09-02 screenshot feedback"
approved_at: "2026-09-02"
---

# Intent: Add the C2 icon to the Web UI browser tab

## Problem

The CLI Web UI browser tab currently falls back to the browser's generic globe because the shared
HTML entry does not declare an icon. The user asked for the tab to show a product icon. The desired
outcome is to reuse the repository's existing C2 application mark without creating a Web-only
brand asset or changing the application shell.

## Proposed outcome

The CLI Web UI browser tab currently falls back to the browser's generic globe because the shared

## Affected users and systems

Migrated from legacy change.md.

## Constraints

The user's direct screenshot feedback accepts this low-risk visual correction. Ponytail selected
one HTML metadata declaration at the shared entry and the existing app icon; no duplicated favicon,
new dependency, Web-only component, or configuration surface is justified.

Human review remains required before merge. Merge, release, deployment, and publication are not
authorized.

## Out of scope

Not recorded in the legacy single-file Artifact.

## Success signals

See Spec acceptance criteria.

## Open questions

None recorded in migration.

## Decision

The user's direct screenshot feedback accepts this low-risk visual correction. Ponytail selected
one HTML metadata declaration at the shared entry and the existing app icon; no duplicated favicon,
new dependency, Web-only component, or configuration surface is justified.

Human review remains required before merge. Merge, release, deployment, and publication are not
authorized.
