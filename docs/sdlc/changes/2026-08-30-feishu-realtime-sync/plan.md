---
id: "2026-08-30-feishu-realtime-sync"
stage: plan
schema: 3
status: accepted
owner: codex
created: 2026-08-30
based_on: spec.md
risk: high
scope: community/plugins/feishu, apps/desktop, crates/plugins
approved_by: "chenli"
approved_at: "2026-08-30"
---

# Plan: Add realtime Feishu connector updates

## Files and ownership

community/plugins/feishu, apps/desktop, crates/plugins

## Order of work

Extend the one-click app configuration, bundle the official Node SDK into the self-contained Runtime,
subscribe eligible resources, add a source-authenticated connector event route, and update the existing
flat Feishu sidebar with event-driven refresh and local dots. Rollback removes the event registration,
WebSocket client, connector event route, and local dot state while retaining the current on-open reads.

## Test-first proof

See legacy Verification section.

## Visual or integration proof

See legacy Verification section.

## Risks and mitigations

See legacy Decision and gates.

## Rollback

See legacy Review and release.

## Deviations

- Added `im.message.receive_v1`, reaction events, Drive edit, and Base record/field events to the
  one-click registration add-ons. Scope revision 5 makes an already-authorized one-click app return
  to the Feishu confirmation flow before C2 treats the connection as ready.
- Added the official `@larksuiteoapi/node-sdk` WebSocket client to the community Runtime, with one
  client per authorized process, automatic reconnect, bounded event-id/message-id deduplication,
  normalized connector events, and shutdown on disconnect or stdin close. The SDK and its runtime
  dependencies are bundled into the self-contained `plugin.bundle.cjs`; the C2 adapter is version
  0.4.0.
- Added user-token `document.subscribe` and `table.subscribe` operations. The renderer subscribes
  the small visible set, the current selection, and pinned Docs/Base resources; owner/manager
  failures degrade to an English/Chinese informational message rather than failing the workspace.
- Added a typed internal `ConnectorEvent`. The process protocol strips the internal `bundle:` prefix,
  attaches the authenticated installed-bundle id, and does not place connector payloads on the
  host-wide public JSON bus. The desktop forwards only that attributed envelope; App matches both
  plugin id and connector id before dispatching it to Feishu UI state.
- Added local per-resource and per-section activity dots, immediate current-detail refresh, event
  coalescing for Drive/Base bursts, preview reordering for new messages, and clear-on-open behavior.
  The only remaining interval in the component is the short-lived OAuth-completion poll; provider
  data refresh has no recurring timer.
- Added an official-source research note and updated the C2 Plugin Protocol, Plugin Standard, and
  community README files with identity, coverage, confidentiality, and multi-client limitations.

## Decision

The user's direct implementation request approves this Intent and Spec, with chenli as the named
approver. The user later authorized PR #185 and explicitly authorized its merge on 2026-08-31.
No publication, deployment, or release is authorized.
