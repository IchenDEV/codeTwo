---
id: "2026-08-30-feishu-document-component"
stage: plan
schema: 3
status: accepted
owner: codex
created: 2026-08-30
based_on: spec.md
risk: high
scope: community/plugins/feishu, apps/desktop
approved_by: "chenli"
approved_at: "2026-08-30"
---

# Plan: Embed Feishu documents with the official component

## Files and ownership

community/plugins/feishu, apps/desktop

## Order of work

Verify the current official component contract, add a narrowly scoped signed-auth connector
operation, isolate the vendor SDK lifecycle in one C2 component, and replace the document detail's
single Markdown body with component-first progressive enhancement. Rollback removes the signed-auth
operation and component host while restoring the existing Markdown-only document detail.

## Test-first proof

See legacy Verification section.

## Visual or integration proof

See legacy Verification section.

## Risks and mitigations

See legacy Decision and gates.

## Rollback

See legacy Review and release.

## Deviations

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

## Decision

The user's direct implementation request approves this Intent and Spec, with chenli as the named
approver. The user later authorized PR #185 and explicitly authorized its merge on 2026-08-31.
No publication, deployment, permission approval, or release is authorized.
