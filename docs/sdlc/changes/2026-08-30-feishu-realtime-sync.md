---
id: change-2026-08-30-feishu-realtime-sync
kind: change
status: executing
owner: codex
approvers: chenli
created: 2026-08-30
updated: 2026-08-30
source: user request in this task, "支持飞书新消息的同步……有红点……立即更新，而不是通过轮询"
inputs: the Feishu collaboration connector, C2 process-runtime events, and the host-rendered Feishu sidebar
outputs: event-driven Feishu message and document updates with local unread/change indicators
next_trigger: generate one covered external Feishu event and verify immediate C2 refresh plus clear-on-open activity dots
---

# Add realtime Feishu connector updates

## Intent

The Feishu collaboration surface currently reads messages and documents only when the user opens or
manually reloads them. The user requested event-driven updates, including a visible red dot for new
activity, without periodic message or document polling.

Official Feishu APIs do not expose an event that mirrors an authorized user's complete inbox.
`im.message.receive_v1` is an application/bot event and can cover bot direct messages and messages in
groups that contain the bot, subject to the granted scope. Cloud-document events can use user identity,
but only after a resource owner or manager subscribes each document or Base. The product must not
present either source as Feishu's global unread state.

## Spec

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

### Acceptance criteria

- [x] Application registration requests the implemented tenant message/reaction events and user
      document/Base events, and increments its scope revision so an existing one-click application is
      prompted to approve the new configuration.
- [x] An authorized Runtime starts one official Feishu WebSocket client, deduplicates at-least-once
      delivery, emits normalized connector events, and stops it on disconnect or process exit.
- [x] Documents and Bases visible to C2 are subscribed with user identity when the current user is an
      owner or manager; unsupported resources remain usable and surface a bounded warning instead of
      failing the whole overview.
- [x] C2 authenticates the source plugin of each connector event and the renderer accepts events only
      for the currently active Feishu connector.
- [x] New covered messages and changed resources produce local dots; selecting the item clears the dot,
      while an already-visible item refreshes immediately without a recurring timer.
- [x] Product copy and documentation state that ordinary user-to-user chats and non-manageable
      documents do not have full realtime coverage and that C2 dots are not Feishu global unread counts.
- [x] Focused community-plugin, Rust, renderer, build, and SDLC checks pass within the documented
      native-link limitation.

## Decision and gates

The user's direct implementation request approves this Intent and Spec, with chenli as the named
approver. No PR, merge, publication, deployment, or release is authorized.

## Plan

Extend the one-click app configuration, bundle the official Node SDK into the self-contained Runtime,
subscribe eligible resources, add a source-authenticated connector event route, and update the existing
flat Feishu sidebar with event-driven refresh and local dots. Rollback removes the event registration,
WebSocket client, connector event route, and local dot state while retaining the current on-open reads.

## Build

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

## Verification

- Community Runtime `npx vitest run tests/codetwo-runtime.spec.ts`: 10 passed. This covers event/scope
  registration, scope-revision upgrade, OAuth, resource listing, user-identity document subscription,
  message rendering, sending, and credential storage.
- Community `npm run -s build`: passed and produced a 5.9 MB self-contained
  `codetwo/plugin.bundle.cjs`. A direct JSON-RPC initialize smoke test against that generated Bundle
  returned version 0.4.0 and the expected single connector command.
- C2 validator accepted the 0.4.0 adapter with one Runtime command and one connector.
- Renderer tests covering the plugin model and Feishu surface: 23 passed, including event-driven
  preview updates, resource and section dots, clear-on-open, visible-conversation refresh, Markdown,
  avatar, pin, limit, and bilingual UI behavior. Existing React `act(...)` warnings remain.
- `bun run build:renderer` passed design-system source/dist checks, TypeScript, and Vite production
  build; the existing large-chunk warning remains. A final `bunx tsc --noEmit` also passed.
- `DOCS_RS=1 cargo test -p codetwo-plugins --lib`: 38 passed, including normalization from internal
  `bundle:<id>` runtime names to authenticated installed bundle ids.
- `DOCS_RS=1 cargo check -p codetwo-plugins --tests` and
  `DOCS_RS=1 cargo check -p codetwo-desktop-host`: passed. The focused `plugin_protocol` integration
  binary still cannot link in this checkout because local Ghostty symbols are unavailable; its source
  type-checks, and this is the same known repository limitation recorded by the connector change.
- Rust formatting for changed files and both repositories' `git diff --check` passed.

Verdict: partial. The code, generated self-contained Bundle, UI behavior, static/runtime contracts,
packaged installation, application event configuration, and authorized transport startup pass. A
real external Feishu event has not yet been generated, so the final provider-to-red-dot observation
remains open.

The current packaged app now runs community adapter 0.5.0. Feishu reported the one-click application
and revision-5 event configuration successful, the user approved the ten-scope OAuth grant, and the
C2 connection panel reports the authorized account as Connected. The adapter's dedicated Node process
holds a live established TLS connection after overview loading and emits no realtime-start error,
which is consistent with the official WebSocket client remaining active. This proves transport
startup, not delivery of a particular message/document event.

Residual risk: Feishu does not provide user-identity realtime events for arbitrary colleague chats;
read-only/non-manageable documents cannot be subscribed. Multiple clients with one App ID share a
clustered event stream rather than receiving broadcast copies. The UI labels these events as local C2
activity and falls back to refresh-on-open for uncovered resources.

## Review and release

Approval: implementation approved by chenli through the user request.
Release target: none.
Release identity: not applicable until released.
Smoke evidence: not applicable until released.
Rollback: described in the Plan.
No release: no release was requested.

## Feedback

The research skill's official-source pass changed the implementation boundary: message realtime is
limited to bot/application coverage, while Docs/Base use per-resource user subscriptions. The UI and
documentation therefore avoid claiming a full user inbox mirror or Feishu global unread count.
