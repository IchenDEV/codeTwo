---
id: "2026-08-31-separate-quick-and-side-chat"
stage: intent
schema: 3
status: accepted
owner: Codex
created: 2026-08-31
source: User request and four attached reference screenshots in the current Codex task
risk: medium
approved_by: "[chenli]"
approved_at: "2026-08-31"
---

# Intent: Separate Quick Chat from Side Chat

## Problem

The desktop currently presents a centered floating panel as Side Chat even though the supplied
reference identifies that interaction as Quick Chat. The same state is also opened from the
right-side Dock's Side Chat card, so Quick Chat and Side Chat are not distinct product surfaces.
The New task row additionally exposes both a temporary-session plus button and a chat-plus button,
which reads as two adjacent ways to add a conversation. The centered panel cannot be moved.

The desired outcome is one clear Quick Chat entry beside New task, a genuine Side Chat surface in
the right Dock, and a Quick Chat panel that can be repositioned without being dragged out of view.
This affects the desktop renderer only. Provider protocol, durable Task behavior, and persisted
Task history are out of scope.

## Proposed outcome

The desktop currently presents a centered floating panel as Side Chat even though the supplied

## Affected users and systems

Migrated from legacy change.md.

## Constraints

User `chenli` directly approved Intent and implementation through the current request on
2026-08-30/31, including the supplied Quick Chat, Side Chat, and duplicate-button evidence.
Codex owns implementation and verification. No separate security, data, migration, deployment, or
release Gate is needed because this is a local renderer behavior change. The user subsequently
authorized PR creation and merge on 2026-08-31. Publication and release remain unapproved.

## Out of scope

Not recorded in the legacy single-file Artifact.

## Success signals

See Spec acceptance criteria.

## Open questions

None recorded in migration.

## Decision

User `chenli` directly approved Intent and implementation through the current request on
2026-08-30/31, including the supplied Quick Chat, Side Chat, and duplicate-button evidence.
Codex owns implementation and verification. No separate security, data, migration, deployment, or
release Gate is needed because this is a local renderer behavior change. The user subsequently
authorized PR creation and merge on 2026-08-31. Publication and release remain unapproved.
