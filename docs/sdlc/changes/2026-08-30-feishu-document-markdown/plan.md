---
id: "2026-08-30-feishu-document-markdown"
stage: plan
schema: 3
status: accepted
owner: codex
created: 2026-08-30
based_on: spec.md
risk: medium
scope: community/plugins/feishu, apps/desktop
approved_by: "chenli"
approved_at: "2026-08-30"
---

# Plan: Render Feishu documents and conversations

## Files and ownership

community/plugins/feishu, apps/desktop

## Order of work

Replace the plain-text document body with the existing shared Markdown renderer, keep conversation
content on that same renderer, add localized message-type fallbacks, and extend only the focused
Feishu rendered test to protect semantic output, emoji, and reactions. The community plugin adds
the reaction read scope, advances its one-click scope revision, batch-enriches the visible message
page, and owns the Feishu emoji-name conversion. Verify the focused tests, renderer build,
lifecycle contract, and real document and conversation details in the existing single C2-dev
instance. Rollback is the inverse component, localization, and test change.

## Test-first proof

See legacy Verification section.

## Visual or integration proof

See legacy Verification section.

## Risks and mitigations

See legacy Decision and gates.

## Rollback

See legacy Review and release.

## Deviations

The Feishu document detail now passes its fetched body through the existing shared
`MarkdownContent` renderer instead of presenting the source as whitespace-preserved plain text.
The surrounding document container, loading state, localized empty fallback, reading width, and
external-link behavior remain unchanged. The document stylesheet now applies its reading line
height to the renderer's `.codetwo-markdown` child. A focused rendered regression test covers a
heading, emphasis, a list, a link, inline code, and the absence of raw Markdown delimiters. The
conversation path already shared this renderer; it now also replaces empty `[type]` placeholders
with localized labels for images, files, audio, video, stickers, cards, rich text, and unsupported
messages.
The conversation row now renders reaction aggregates beneath the Markdown body using quiet,
non-interactive pills. The community plugin adapter `0.2.11` requests
`im:message.reactions:read`, uses `/open-apis/im/v1/messages/reactions/batch_query`, maps common
emoji identifiers to Unicode, and degrades to readable names for unknown identifiers. Reaction
enrichment is fail-soft so message history remains available when the extra request is unavailable.

## Decision

The user's direct implementation request approves this narrowly scoped Intent and Spec, with
chenli as the named approver. The user later authorized PR #185 and explicitly authorized its merge
on 2026-08-31. No publication, deployment, or release is authorized.
