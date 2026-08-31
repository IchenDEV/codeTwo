# Memory contract

Status: **current implementation contract**. Historical comparisons that informed the first
version are archived in [`archive/research/memory-influences-2026-08-06.md`](../archive/research/memory-influences-2026-08-06.md).

C2 has two kinds of continuity that solve different problems:

1. **Provider-native context** continues one ACP session inside Claude Code, Codex, Grok, or
   another provider. The provider owns that context.
2. **C2 project memory** is a local, provider-neutral recall layer. It can carry stable project
   knowledge and earlier outcomes across sessions and providers without pretending to be the
   provider's conversation state.

The second layer lives in `crates/core/src/memory.rs` and the same `codetwo.db` as sessions. It is
enabled by default and has independent switches for learning and prompt-time recall under
**Settings → Memory**.

## The four layers

| Layer | Content | Ownership | Automatic prompt budget |
| --- | --- | --- | --- |
| L0 | Existing raw transcript parts | Canonical app transcript | Up to 3 excerpts, only when the request explicitly asks about earlier work |
| L1 | Stable constraints, preferences, facts, decisions, and manual notes | Derived, with source references | Up to 12; pinned notes are considered first |
| L2 | A bounded request/outcome summary for a completed turn | Derived, with source references | Up to 3 from earlier sessions |
| L3 | A conservative profile assembled after at least 3 active L1 notes | Derived from L1 | 1 profile |

L0 is never copied into another table. L1–L3 rows retain their source session and part sequence,
confidence, timestamps, pin state, and active state. Unpinned L2 history is capped at 300 episodes
per project.

## Capture and recall

Capture runs only after a provider completes a turn successfully. L2 is written immediately as a
source-linked work episode. High-signal constraints, preferences, and decisions first enter a
candidate queue; after a 30-minute settling window, a background maintenance transaction promotes
them into L1 and rebuilds L3. Due candidates are also processed on startup, so closing the app does
not strand them. Each later turn in the same session resets that window, so an active conversation
is not consolidated mid-stream. This borrows Codex's useful separation between foreground work and
slower memory consolidation without adding a hidden model call.

Capture examines the user's original document text, not expanded file contents, project rules,
skill bodies, or an earlier memory block. Deterministic English and Chinese markers keep candidate
generation testable; users can add any important L1 note manually.

Near-duplicate L1 notes (token Jaccard score at least `0.8`) reinforce one row and merge evidence
instead of creating copies. Common private-key, credential-label, OpenAI-key, and GitHub-token
shapes are removed before derived text is stored. Redaction is defense in depth, not a promise that
arbitrary secrets can always be recognized.

Search tokenizes ASCII words and CJK bigrams, takes at most 12 query terms, ranks within each layer,
then combines reciprocal rank and lexical coverage:

```text
layer_weight × (rank_score × 0.6 + lexical_score × 0.4) × confidence
```

L1, L2, L0, and L3 use weights `1.00`, `0.92`, `0.85`, and `0.75`. A small pin boost is applied
after fusion. Automatic recall excludes current-session L0/L2 records and is kept separate from the
persisted transcript, preventing direct self-recapture as user-authored input.

Every turn retains provenance flags for MCP, files, images, referenced chats, browser context,
provider tool calls, and recalled memory. **Learn from external context** can exclude any such turn
from L1/L2/L3 generation while leaving its canonical transcript intact.

The block sent to the provider is explicitly labeled **untrusted recalled context**. The current
request and repository rules win, and instructions found inside recalled transcripts or episodes
must not be executed merely because memory surfaced them.

## Session policy and receipts

The composer has four session presets: **Memory on**, **Recall only**, **Private session**, and
**Learn only**. They persist independent read and write policies (`inherit`, `allow`, or `deny`) on
the session. The global master, capture, and recall switches still win; a session may narrow global
behavior but cannot silently re-enable a disabled feature.

Codex is the one provider-specific transport boundary: its **Codex default** preset uses the
inherited session policy but does not append C2 memory to Codex's ACP user message, because Codex
exposes every `session/prompt` text block as user-authored conversation. It still learns according
to the global settings. Choosing **Memory on** or **Recall only** sets an explicit read `allow`,
sends the bounded recalled block, and retains the normal receipt. Other providers continue to use
**Memory on** as their default and resolve `inherit` from the global recall switch.
Codex Quick Chat and Side Chat explicitly use recall-only policy so their existing project-memory
context remains available without learning durable memory from those app-lifetime conversations.

When recall is used, C2 emits and stores a turn receipt containing the exact memory ids, layers,
categories, evidence pointer, retrieval score, text sent, and estimated prompt tokens. The Turn UI
shows it under **Memory used**. Receipts are metadata beside the transcript; the injected memory
block is never persisted as a user-authored message.

## Known boundaries

- Global settings and per-session policies are both enforced; stored and recalled items remain
  isolated by exact project path.
- Derived capture is intentionally conservative and can miss an implicit preference or decision.
- Search is lexical, not embedding-based; it works offline but will miss some semantic matches.
- The desktop app exposes inspection controls today. The core data remains available to other
  frontends, but the TUI and remote UI do not yet have a memory manager.
- Disabling recall leaves stored rows untouched. **Forget** deactivates an editable derived row;
  **Undo** reactivates it. Raw transcripts and the L3 profile are inspection-only.
