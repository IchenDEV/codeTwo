---
id: "2026-08-30-feishu-realtime-sync"
stage: intent
schema: 3
status: accepted
owner: codex
created: 2026-08-30
source: user request in this task, "支持飞书新消息的同步……有红点……立即更新，而不是通过轮询"
risk: high
approved_by: "chenli"
approved_at: "2026-08-30"
---

# Intent: Add realtime Feishu connector updates

## Problem

The Feishu collaboration surface currently reads messages and documents only when the user opens or
manually reloads them. The user requested event-driven updates, including a visible red dot for new
activity, without periodic message or document polling.

Official Feishu APIs do not expose an event that mirrors an authorized user's complete inbox.
`im.message.receive_v1` is an application/bot event and can cover bot direct messages and messages in
groups that contain the bot, subject to the granted scope. Cloud-document events can use user identity,
but only after a resource owner or manager subscribes each document or Base. The product must not
present either source as Feishu's global unread state.

## Proposed outcome

The Feishu collaboration surface currently reads messages and documents only when the user opens or

## Affected users and systems

Migrated from legacy change.md.

## Constraints

The user's direct implementation request approves this Intent and Spec, with chenli as the named
approver. The user later authorized PR #185 and explicitly authorized its merge on 2026-08-31.
No publication, deployment, or release is authorized.

## Out of scope

Not recorded in the legacy single-file Artifact.

## Success signals

See Spec acceptance criteria.

## Open questions

None recorded in migration.

## Decision

The user's direct implementation request approves this Intent and Spec, with chenli as the named
approver. The user later authorized PR #185 and explicitly authorized its merge on 2026-08-31.
No publication, deployment, or release is authorized.
