---
id: "2026-08-30-feishu-document-component"
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

# Spec: Embed Feishu documents with the official component

## Requirements

C2 uses the current official `DocComponentSdk` as the primary renderer for Feishu document URLs.
The community Runtime obtains the user-identity JSAPI ticket and computes a one-use signature for
the exact C2 page URL; only the signed component-auth payload and public SDK URL cross the connector
boundary. The app secret, access token, and JSAPI ticket remain Runtime-only. The component is
destroyed when the document changes or the view unmounts, retries authorization once after an auth
failure, receives the current C2 theme and a bounded height, and exposes localized loading and
failure states.

A normal Feishu document URL is not placed directly in an iframe. Direct framing would rely on the
document site's login cookies and framing policy, while the official component owns its internal
iframe, permission handshake, supported document URLs, error model, and collaboration behavior.
When the SDK, signature, WebView environment, network, or document type is unsupported, C2 keeps the
existing OpenAPI-to-Markdown rendering visible and offers the canonical Feishu link.

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
No publication, deployment, permission approval, or release is authorized.

## Acceptance criteria

- [x] AC-1: Official current Feishu documentation, SDK identity, authorization flow, iframe boundary, and
      user-versus-app capabilities are recorded in a source-linked research note.
- [x] AC-2: A selected cloud document attempts the official component first and never embeds the ordinary
      Feishu document page as a raw iframe.
- [x] AC-3: Component authorization uses the user identity and one-use signature while secrets, access
      tokens, and JSAPI tickets remain inside the community Runtime.
- [x] AC-4: The SDK lifecycle handles mount, one authorization retry, document/theme changes, destruction,
      and bounded sizing without leaving duplicate iframes.
- [x] AC-5: Markdown remains a readable fallback, including a localized explanation and an open-in-Feishu
      action when the richer renderer is unavailable.
- [x] AC-6: Focused Runtime and rendered tests, renderer build, diff checks, and the SDLC contract pass;
      any unexercised real Feishu/WebView boundary is stated as residual risk.

## Decision

The user's direct implementation request approves this Intent and Spec, with chenli as the named
approver. The user later authorized PR #185 and explicitly authorized its merge on 2026-08-31.
No publication, deployment, permission approval, or release is authorized.
