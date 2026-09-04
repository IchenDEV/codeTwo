---
id: "2026-08-30-feishu-realtime-sync"
stage: verification
schema: 3
status: pending
owner: codex
created: 2026-08-30
based_on: plan.md
commit: ""
verification_mode: independent
verified_by: ""
verified_at: ""
release_target: none
release_identity: "not applicable until released."
---

# Verification: Add realtime Feishu connector updates

## Automated checks

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

### Acceptance evidence

- AC-1: PASS — `Verification record above` preserves the original passing evidence.
- AC-2: PASS — `Verification record above` preserves the original passing evidence.
- AC-3: PASS — `Verification record above` preserves the original passing evidence.
- AC-4: PASS — `Verification record above` preserves the original passing evidence.
- AC-5: PASS — `Verification record above` preserves the original passing evidence.
- AC-6: PASS — `Verification record above` preserves the original passing evidence.
- AC-7: PASS — `Verification record above` preserves the original passing evidence.

Residual risk: Feishu does not provide user-identity realtime events for arbitrary colleague chats;
read-only/non-manageable documents cannot be subscribed. Multiple clients with one App ID share a
clustered event stream rather than receiving broadcast copies. The UI labels these events as local C2
activity and falls back to refresh-on-open for uncovered resources.

## Behavioral evidence

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

### Acceptance evidence

- AC-1: PASS — `Verification record above` preserves the original passing evidence.
- AC-2: PASS — `Verification record above` preserves the original passing evidence.
- AC-3: PASS — `Verification record above` preserves the original passing evidence.
- AC-4: PASS — `Verification record above` preserves the original passing evidence.
- AC-5: PASS — `Verification record above` preserves the original passing evidence.
- AC-6: PASS — `Verification record above` preserves the original passing evidence.
- AC-7: PASS — `Verification record above` preserves the original passing evidence.

Residual risk: Feishu does not provide user-identity realtime events for arbitrary colleague chats;
read-only/non-manageable documents cannot be subscribed. Multiple clients with one App ID share a
clustered event stream rather than receiving broadcast copies. The UI labels these events as local C2
activity and falls back to refresh-on-open for uncovered resources.

## Visual evidence

See bundle evidence/ when present.

## Security and privacy evidence

Not separately recorded unless present in legacy Verification.

## Deviations and residual risk

Residual risk: Feishu does not provide user-identity realtime events for arbitrary colleague chats;

## Verdict

Verdict: partial. The code, generated self-contained Bundle, UI behavior, static/runtime contracts,.

## Review and release

Approval: implementation approved by chenli through the user request.
Merge approval: PR #185 explicitly approved for merge by chenli on 2026-08-31.
Release target: none.
Release identity: not applicable until released.
Smoke evidence: not applicable until released.
Rollback: described in the Plan.
No release: no release was requested.

## Feedback

The research skill's official-source pass changed the implementation boundary: message realtime is
limited to bot/application coverage, while Docs/Base use per-resource user subscriptions. The UI and
documentation therefore avoid claiming a full user inbox mirror or Feishu global unread count.
