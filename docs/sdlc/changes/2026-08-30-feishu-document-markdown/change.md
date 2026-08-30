---
id: change-2026-08-30-feishu-document-markdown
kind: change
schema: 2
status: executing
risk: medium
owner: codex
approvers: chenli
approved_at: 2026-08-30
created: 2026-08-30
updated: 2026-08-31
source: user request in this task, "文档 md 渲染"
inputs: existing Feishu document detail and shared Markdown renderer
outputs: Feishu document, conversation, emoji, and reaction rendering with focused tests and rendered evidence
scope: community/plugins/feishu, apps/desktop
next_trigger: focused Feishu content rendering verification completes
verification_mode: owner
verified_by: pending
verified_at: pending
---

# Render Feishu documents and conversations

## Intent

The user requested that Feishu document content render as Markdown, then explicitly extended the
request to conversation, emoji, and reaction rendering. Document and message bodies should show
readable semantic content rather than raw Markdown delimiters or technical placeholders, and
reaction totals should remain visually attached to the message they annotate. The change affects
the read-only Feishu document and conversation detail surfaces. Editing, export, and adding or
removing reactions are non-goals.

## Spec

Reuse CodeTwo's existing `MarkdownContent` renderer for fetched document and conversation bodies.
Preserve the current loading and empty states, scroll containers, reading width, source text, and
external-link behavior. Plain text must remain readable because it is valid Markdown input. When a
message has no converted text, show a localized human label for common Feishu message types and a
generic "view in Feishu" fallback instead of a raw `[type]` marker.
The community plugin enriches one message page through Feishu's reaction batch API, converts common
Feishu emoji identifiers into visible emoji, and omits reaction data when none exists or enrichment
fails. CodeTwo renders each aggregate as a compact, accessible emoji-and-count pill beneath the
message without making the pill interactive.

### Acceptance criteria

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

## Decision and gates

The user's direct implementation request approves this narrowly scoped Intent and Spec, with
chenli as the named approver. The user later authorized PR #185 and explicitly authorized its merge
on 2026-08-31. No publication, deployment, or release is authorized.

## Plan

Replace the plain-text document body with the existing shared Markdown renderer, keep conversation
content on that same renderer, add localized message-type fallbacks, and extend only the focused
Feishu rendered test to protect semantic output, emoji, and reactions. The community plugin adds
the reaction read scope, advances its one-click scope revision, batch-enriches the visible message
page, and owns the Feishu emoji-name conversion. Verify the focused tests, renderer build,
lifecycle contract, and real document and conversation details in the existing single C2-dev
instance. Rollback is the inverse component, localization, and test change.

## Build

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

## Verification

Verdict: implementation checks passed; real-window verification pending an unlocked macOS session.

- `bun test ./tests/feishuWorkspaceRendered.test.tsx`: 7 passed, 0 failed, 253
  expectations. React emitted the suite's existing non-failing `act(...)` warnings.
- `npx vitest run tests/codetwo-runtime.spec.ts` in the community plugin: 9 tests passed, including
  one-click reaction scope registration, inline emotion conversion, batch reaction aggregation,
  and the runtime response contract.
- `bun run build:renderer`: passed, including the design-system check, TypeScript compilation, and
  Vite production build. Vite retained its existing large-chunk advisory.
- `bun run build`: passed and produced the development macOS app. The native helper linker retained
  existing missing CommandLineTools search-path warnings; package signing and notarization remain
  intentionally skipped for this development build.
- The first `bun script/check-sdlc.ts` run rejected non-scalar frontmatter and a pending output
  description. The artifact was corrected; the next run passed. `git diff --check` also passed.
- A later focused-test invocation used a repository-root path while already inside `apps/desktop`,
  so Bun found no matching test. Re-running the same test with the correct relative path passed.
- Real-window evidence is pending because macOS is locked; the existing single C2-dev instance has
  not been killed, duplicated, or reopened against shared state.

### Acceptance evidence

- AC-1: PASS — `Verification record above` preserves the original passing evidence.
- AC-2: PASS — `Verification record above` preserves the original passing evidence.
- AC-3: PASS — `Verification record above` preserves the original passing evidence.
- AC-4: PASS — `Verification record above` preserves the original passing evidence.
- AC-5: PASS — `Verification record above` preserves the original passing evidence.
- AC-6: PASS — `Verification record above` preserves the original passing evidence.
- AC-7: BLOCKED — `Verification record above` preserves the original unresolved criterion.

Residual risk: Feishu publishes many custom emoji identifiers. Common reactions map to matching
Unicode emoji; unknown identifiers fall back to a spaced readable name rather than the proprietary
Feishu artwork. Feishu rich blocks that the plugin does not convert to Markdown remain limited by
the fetched source representation.

## Review and release

Approval: implementation approved by chenli through the user request.
Merge approval: PR #185 explicitly approved for merge by chenli on 2026-08-31.
Release target: none.
Release identity: not applicable until released.
Smoke evidence: not applicable until released.
Rollback: restore the prior plain-text Feishu document body rendering.
No release: repository integration was approved; no release was requested.

## Feedback

No post-change feedback exists yet.
