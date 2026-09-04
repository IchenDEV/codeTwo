---
id: "2026-08-31-desktop-pet-conversation-bubble"
stage: intent
schema: 3
status: accepted
owner: codex
created: 2026-08-31
source: user-supplied desktop-pet screenshot and direct implementation request on 2026-08-31
risk: medium
approved_by: "[user]"
approved_at: "2026-08-31"
---

# Intent: Simplify the desktop pet and surface active conversation

## Problem

The user supplied a rendered desktop-pet screenshot showing a persistent rounded selection fill and
an independent hide button below the mascot. Those controls make the companion look selected and
turn a quiet floating surface into a small toolbar. The pet should remain visually unframed, expose
current assistant conversation through a speech bubble only while a conversation is in progress,
and use the platform-native secondary-click menu for closing.

The affected users are people who keep the independent desktop pet visible while CodeTwo works.
Pet selection/settings, composer behavior, session persistence, voice input, provider execution,
and release behavior are non-goals. The direct request accepts this Intent and observable UI
direction. The user's later direct `pr & merge` instruction on 2026-08-31 authorizes repository
pull-request creation and merge after required checks pass; it does not authorize publication,
deployment, or a product release.

## Proposed outcome

The user supplied a rendered desktop-pet screenshot showing a persistent rounded selection fill and

## Affected users and systems

Migrated from legacy change.md.

## Constraints

The user's direct screenshot-backed request accepts Intent, the visible-design direction, and
implementation. Apple HIG context-menu guidance supports moving the item-specific Close command out
of persistent chrome and into a native secondary-click menu. CodeTwo's existing design tokens,
session activity projection, and context-menu bridge remain authoritative. The later direct
`pr & merge` instruction accepts the repository Review Gate and authorizes PR creation plus merge
after required checks pass. No separate security, data, release, deployment, or production Gate is
approved.

## Out of scope

Not recorded in the legacy single-file Artifact.

## Success signals

See Spec acceptance criteria.

## Open questions

None recorded in migration.

## Decision

The user's direct screenshot-backed request accepts Intent, the visible-design direction, and
implementation. Apple HIG context-menu guidance supports moving the item-specific Close command out
of persistent chrome and into a native secondary-click menu. CodeTwo's existing design tokens,
session activity projection, and context-menu bridge remain authoritative. The later direct
`pr & merge` instruction accepts the repository Review Gate and authorizes PR creation plus merge
after required checks pass. No separate security, data, release, deployment, or production Gate is
approved.
