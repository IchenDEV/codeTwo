---
id: change-2026-08-30-feishu-document-component
kind: change
status: executing
owner: codex
approvers: chenli
created: 2026-08-30
updated: 2026-08-31
source: user request in this task, "云文档的渲染考虑使用飞书云文档组件或者说是 iframe 来接"
inputs: the official Feishu Docs Component, the community Feishu Runtime, and the C2 document detail surface
outputs: an official-component-first Feishu document viewer with a readable Markdown fallback
next_trigger: resolve the official SDK's missing mount callback in Electrobun WebKit, then rerun the live component matrix
---

# Embed Feishu documents with the official component

## Intent

The current C2 document detail fetches raw document text and renders it as Markdown. The user asked
whether the official Feishu Docs Component or a direct iframe should become the richer document
surface. The preferred path must preserve Feishu permissions and live collaboration without exposing
the app secret or user token to the renderer, while retaining a usable result when the component
cannot load.

## Spec

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

### Acceptance criteria

- [x] Official current Feishu documentation, SDK identity, authorization flow, iframe boundary, and
      user-versus-app capabilities are recorded in a source-linked research note.
- [x] A selected cloud document attempts the official component first and never embeds the ordinary
      Feishu document page as a raw iframe.
- [x] Component authorization uses the user identity and one-use signature while secrets, access
      tokens, and JSAPI tickets remain inside the community Runtime.
- [x] The SDK lifecycle handles mount, one authorization retry, document/theme changes, destruction,
      and bounded sizing without leaving duplicate iframes.
- [x] Markdown remains a readable fallback, including a localized explanation and an open-in-Feishu
      action when the richer renderer is unavailable.
- [x] Focused Runtime and rendered tests, renderer build, diff checks, and the SDLC contract pass;
      any unexercised real Feishu/WebView boundary is stated as residual risk.

## Decision and gates

The user's direct implementation request approves this Intent and Spec, with chenli as the named
approver. The user later authorized PR #185 and explicitly authorized its merge on 2026-08-31.
No publication, deployment, permission approval, or release is authorized.

## Plan

Verify the current official component contract, add a narrowly scoped signed-auth connector
operation, isolate the vendor SDK lifecycle in one C2 component, and replace the document detail's
single Markdown body with component-first progressive enhancement. Rollback removes the signed-auth
operation and component host while restoring the existing Markdown-only document detail.

## Build

The community adapter is now version 0.5.0. Its Runtime exposes one
`document.component` connector operation, accepts only HTTPS Feishu/Lark tenant URLs supported by
SDK 1.0.13, obtains the user JSAPI ticket, signs the exact loopback page URL, and serves a short-lived
isolated component page. The page loads the pinned official SDK, constrains duplicate chrome, follows
the active theme, reports lifecycle events to C2, and destroys the SDK instance on page teardown.

C2 now attempts that component before showing the existing OpenAPI/Markdown document body. It
retries an authentication failure once with a forced user-token/ticket refresh, then shows a
localized Markdown fallback with Retry and Open in Feishu. The adapter does not pass its app secret,
user token, refresh token, or raw ticket to the page. Base and Slides remain on their existing C2
renderers because this SDK version rejects those URL shapes.

## Verification

Verdict: implementation, packaged installation, user authorization, and authenticated fallback smoke
pass. The official live component still times out in Electrobun WebKit and remains an open residual.

- `npm run check` in `dsh-feishu-docs`: 69 tests passed, typecheck passed, and the minified CodeTwo
  bundle rebuilt at 1.9 MiB, below C2's 4 MiB per-file installation limit.
- `CODETWO_RUNTIME_BUNDLE=1 npx vitest run tests/codetwo-runtime.spec.ts`: 11 tests passed against
  the actual packaged CommonJS bundle, including signature-host isolation, secret non-disclosure,
  forced token/ticket refresh, and marketplace/manifest version alignment.
- The native `plugins.install_marketplace` operation atomically replaced the existing installed
  Feishu bundle with version 0.5.0 while retaining its enabled and trusted state.
- `bun test` over the eight affected desktop suites: 93 tests passed with 777 expectations,
  including component-first rendering, Markdown fallback, one auth retry, connector slots, flat
  resource groups, and the shared titlebar/rail contract.
- `bunx tsc --noEmit`: passed.
- `bun run build:renderer`: passed; the design-system gate reported no new violations and the
  production renderer built successfully.
- `cargo build --release --bin codetwo-desktop-host`: passed after using the generated Ghostty
  pkg-config artifact to bypass the checkout's known unchanged Zig/libc++ `INFINITY` failure; the
  temporary feature toggle was reverted and no Ghostty source change remains.
- `bun scripts/validate-plugin.ts <community-plugin>/codetwo`: manifest 0.5.0 valid with one
  connector.
- `git diff --check` and `bun script/check-sdlc.ts`: passed before the final Artifact update and are
  rerun at handoff.
- The packaged a685 `C2-dev.app` launched with one Core owner on the default data directory. Native
  Computer Use verified that Contacts, Docs, and Base appear as flat collapsible groups directly in
  the main rail, with no duplicate search field or plugin-specific nested sidebar. The official
  Feishu launcher opened successfully, the user approved the one-click app permission and event
  configuration, and Feishu reported `配置成功`. The subsequent user OAuth page was reached and
  enumerated ten requested capabilities before the final grant. The user then approved that grant;
  C2 immediately loaded 8 recent contacts/groups and 36 cloud documents from the authorized account.
- Two different real Feishu cloud documents were opened in the packaged Electrobun WebView. For both,
  C2 created a signed short-lived loopback component page, the page returned HTTP 200, and the pinned
  official SDK returned HTTP 200. Neither page produced a mount success or error callback before the
  20-second product timeout, so C2 correctly replaced the live surface with the latest readable
  OpenAPI/Markdown preview and kept Retry and Open in Feishu available. A speculative WebKit
  `MessageEvent.source` relaxation did not change this result and was reverted.

Residual risk: the official SDK's live mount is not yet proven inside Electrobun WebKit. The
component-first boundary and no-blank-screen fallback are verified, but the SDK's missing callback
needs a separate WebKit/vendor-capability investigation before claiming live editing or collaboration.
Docs, Wiki, and Sheets should then be repeated in light and dark themes; this handoff makes no claim
that the live component itself succeeded.

## Review and release

Approval: implementation approved by chenli through the user request.
Merge approval: PR #185 explicitly approved for merge by chenli on 2026-08-31.
Release target: none.
Release identity: not applicable until released.
Smoke evidence: not applicable until released.
Rollback: described in the Plan.
No release: no release was requested.

## Feedback

The official component is the supported integration contract. A normal Feishu document URL may
happen to load in an iframe, but it does not provide the component's signed session, feature
configuration, error model, or documented collaboration boundary and is therefore not a product
fallback.
