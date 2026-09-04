---
id: "2026-08-30-feishu-document-component"
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

# Verification: Embed Feishu documents with the official component

## Automated checks

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

### Acceptance evidence

- AC-1: PASS — `Verification record above` preserves the original passing evidence.
- AC-2: PASS — `Verification record above` preserves the original passing evidence.
- AC-3: PASS — `Verification record above` preserves the original passing evidence.
- AC-4: PASS — `Verification record above` preserves the original passing evidence.
- AC-5: PASS — `Verification record above` preserves the original passing evidence.
- AC-6: PASS — `Verification record above` preserves the original passing evidence.

Residual risk: the official SDK's live mount is not yet proven inside Electrobun WebKit. The
component-first boundary and no-blank-screen fallback are verified, but the SDK's missing callback
needs a separate WebKit/vendor-capability investigation before claiming live editing or collaboration.
Docs, Wiki, and Sheets should then be repeated in light and dark themes; this handoff makes no claim
that the live component itself succeeded.

## Behavioral evidence

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

### Acceptance evidence

- AC-1: PASS — `Verification record above` preserves the original passing evidence.
- AC-2: PASS — `Verification record above` preserves the original passing evidence.
- AC-3: PASS — `Verification record above` preserves the original passing evidence.
- AC-4: PASS — `Verification record above` preserves the original passing evidence.
- AC-5: PASS — `Verification record above` preserves the original passing evidence.
- AC-6: PASS — `Verification record above` preserves the original passing evidence.

Residual risk: the official SDK's live mount is not yet proven inside Electrobun WebKit. The
component-first boundary and no-blank-screen fallback are verified, but the SDK's missing callback
needs a separate WebKit/vendor-capability investigation before claiming live editing or collaboration.
Docs, Wiki, and Sheets should then be repeated in light and dark themes; this handoff makes no claim
that the live component itself succeeded.

## Visual evidence

See bundle evidence/ when present.

## Security and privacy evidence

Not separately recorded unless present in legacy Verification.

## Deviations and residual risk

Residual risk: the official SDK's live mount is not yet proven inside Electrobun WebKit. The

## Verdict

Verdict: implementation, packaged installation, user authorization, and authenticated fallback smoke.

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
