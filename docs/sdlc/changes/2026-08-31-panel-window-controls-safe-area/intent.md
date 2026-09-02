---
id: "2026-08-31-panel-window-controls-safe-area"
stage: intent
schema: 3
status: accepted
owner: codex
created: 2026-08-31
source: user-supplied Pull requests and Automations overlap screenshots on 2026-08-31
risk: medium
approved_by: "[user]"
approved_at: "2026-08-31"
---

# Intent: Keep panel headers clear of macOS window controls

## Problem

The user supplied live macOS screenshots showing the collapsed-sidebar headers in Pull requests
and Automations underneath the traffic lights or system capture indicator. The title, leading
sidebar action, and filters must remain readable and operable without making the compact desktop
chrome taller or shifting unrelated detail panes.

The affected systems are the two split-panel renderer pages and their responsive header layout.
Data loading, GitHub behavior, automation scheduling, window ownership, other full-page panels,
and release behavior are non-goals. The direct request accepts this Intent and the visible design
correction; the later `pr` request authorizes an isolated Draft PR, but not merge or release.

## Proposed outcome

The user supplied live macOS screenshots showing the collapsed-sidebar headers in Pull requests

## Affected users and systems

Migrated from legacy change.md.

## Constraints

The user's direct screenshot-backed implementation request is Intent and visible-design approval.
The implementation reuses the established `window-controls-safe-main` contract and the two pages'
existing container queries. The user's direct `merge` instruction on 2026-08-31 accepts the Review
and Merge Gate for PR #186. It does not authorize release, deployment, or production mutation.

## Out of scope

Not recorded in the legacy single-file Artifact.

## Success signals

See Spec acceptance criteria.

## Open questions

None recorded in migration.

## Decision

The user's direct screenshot-backed implementation request is Intent and visible-design approval.
The implementation reuses the established `window-controls-safe-main` contract and the two pages'
existing container queries. The user's direct `merge` instruction on 2026-08-31 accepts the Review
and Merge Gate for PR #186. It does not authorize release, deployment, or production mutation.
