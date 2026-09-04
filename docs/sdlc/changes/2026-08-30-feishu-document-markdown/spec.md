---
id: "2026-08-30-feishu-document-markdown"
stage: spec
schema: 3
status: accepted
owner: codex
created: 2026-08-30
based_on: intent.md
risk: medium
approved_by: "chenli"
approved_at: "2026-08-30"
---

# Spec: Render Feishu documents and conversations

## Requirements

Reuse CodeTwo's existing `MarkdownContent` renderer for fetched document and conversation bodies.
Preserve the current loading and empty states, scroll containers, reading width, source text, and
external-link behavior. Plain text must remain readable because it is valid Markdown input. When a
message has no converted text, show a localized human label for common Feishu message types and a
generic "view in Feishu" fallback instead of a raw `[type]` marker.
The community plugin enriches one message page through Feishu's reaction batch API, converts common
Feishu emoji identifiers into visible emoji, and omits reaction data when none exists or enrichment
fails. CodeTwo renders each aggregate as a compact, accessible emoji-and-count pill beneath the
message without making the pill interactive.

## User experience

Not separately recorded in legacy change.md.

## Technical design

See Requirements and legacy Git history.

## Security and privacy

See migrated Decision and gates.

## Alternatives and non-goals

Not separately recorded in legacy change.md.

## Areas of concern

The user's direct implementation request approves this narrowly scoped Intent and Spec, with
chenli as the named approver. The user later authorized PR #185 and explicitly authorized its merge
on 2026-08-31. No publication, deployment, or release is authorized.

## Acceptance criteria

- [x] AC-1: A fetched document containing Markdown headings, emphasis, lists, links, and code renders
      semantic HTML instead of visible Markdown delimiters.
- [x] AC-2: Conversation text, rich-text posts, and converted message cards use Markdown semantics; empty
      media or unsupported payloads show localized readable fallbacks rather than `[type]`.
- [x] AC-3: Inline Feishu emotion nodes render as visible emoji, and message reactions render as compact
      emoji-and-count aggregates with accessible names.
- [x] AC-4: Reaction enrichment uses one batch request for the visible message page, requires only the
      read scope, and fails without hiding the underlying messages.
- [x] AC-5: The loading state and localized empty-document state remain unchanged.
- [x] AC-6: Focused rendered tests, the renderer and full desktop builds, the SDLC check, and diff checks
      pass.
- [ ] AC-7: A real C2-dev conversation view passes without a visible error overlay after macOS is
      unlocked and the existing single Core can be restarted safely.

## Decision

The user's direct implementation request approves this narrowly scoped Intent and Spec, with
chenli as the named approver. The user later authorized PR #185 and explicitly authorized its merge
on 2026-08-31. No publication, deployment, or release is authorized.
