---
id: "2026-08-30-feishu-realtime-sync"
stage: spec
schema: 3
status: accepted
owner: codex
created: 2026-08-30
based_on: intent.md
risk: high
approved_by: "chenli"
approved_at: "2026-08-30"
---

# Spec: Add realtime Feishu connector updates

## Requirements

The community Feishu Runtime establishes the official Feishu WebSocket client after an authorized
connection becomes active. It declares the message, reaction, document, and Base events in the
one-click application registration add-ons and requests only the scopes required by the implemented
coverage. Visible documents and Bases are subscribed with the user's access token when Feishu permits
the current user to manage that resource.

The Runtime emits a typed connector event through the process protocol. C2 authenticates the source
bundle before adding its bundle id and forwarding the event to the renderer. The Feishu surface accepts
events only from its active connector, deduplicates provider event ids, refreshes the currently visible
conversation or resource immediately, and records local unread/change dots for background resources.
Opening a resource clears its local dot. Periodic polling is not used for messages, documents, or Base;
OAuth completion polling remains a separate short-lived authorization mechanism.

## User experience

Not separately recorded in legacy change.md.

## Technical design

See Requirements and legacy Git history.

## Security and privacy

See migrated Decision and gates.

## Alternatives and non-goals

Not separately recorded in legacy change.md.

## Areas of concern

The user's direct implementation request approves this Intent and Spec, with chenli as the named
approver. The user later authorized PR #185 and explicitly authorized its merge on 2026-08-31.
No publication, deployment, or release is authorized.

## Acceptance criteria

- [x] AC-1: Application registration requests the implemented tenant message/reaction events and user
      document/Base events, and increments its scope revision so an existing one-click application is
      prompted to approve the new configuration.
- [x] AC-2: An authorized Runtime starts one official Feishu WebSocket client, deduplicates at-least-once
      delivery, emits normalized connector events, and stops it on disconnect or process exit.
- [x] AC-3: Documents and Bases visible to C2 are subscribed with user identity when the current user is an
      owner or manager; unsupported resources remain usable and surface a bounded warning instead of
      failing the whole overview.
- [x] AC-4: C2 authenticates the source plugin of each connector event and the renderer accepts events only
      for the currently active Feishu connector.
- [x] AC-5: New covered messages and changed resources produce local dots; selecting the item clears the dot,
      while an already-visible item refreshes immediately without a recurring timer.
- [x] AC-6: Product copy and documentation state that ordinary user-to-user chats and non-manageable
      documents do not have full realtime coverage and that C2 dots are not Feishu global unread counts.
- [x] AC-7: Focused community-plugin, Rust, renderer, build, and SDLC checks pass within the documented
      native-link limitation.

## Decision

The user's direct implementation request approves this Intent and Spec, with chenli as the named
approver. The user later authorized PR #185 and explicitly authorized its merge on 2026-08-31.
No publication, deployment, or release is authorized.
