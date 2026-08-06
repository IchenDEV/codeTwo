# Memory design and research

Code2 has two kinds of continuity that solve different problems:

1. **Provider-native context** continues one ACP session inside Claude Code, Codex, Grok, or
   another provider. The provider owns that context.
2. **Code2 project memory** is a local, provider-neutral recall layer. It can carry stable project
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

When recall is used, Code2 emits and stores a turn receipt containing the exact memory ids, layers,
categories, evidence pointer, retrieval score, text sent, and estimated prompt tokens. The Turn UI
shows it under **Memory used**. Receipts are metadata beside the transcript; the injected memory
block is never persisted as a user-authored message.

## What came from ec-mono's mem-lab

`mem-lab` is the explanatory surface; the production design is under
`packages/agent/src/memory` on ec-mono's `origin/main`. Code2 adopts its useful core ideas:

- distinguish raw records, stable atomic memories, scenario episodes, and a slow-changing profile;
- retain evidence instead of presenting model-derived text as canonical fact;
- combine layer-aware ranking with lexical relevance and hard result limits;
- treat automatic injection and explicit memory search as different operations;
- keep memory separate from context-window compression.

Code2 does not copy ec-mono's model-extraction pipeline. Its first release uses deterministic L1
capture and a structured L3 assembly so there is no surprise token cost or provider dependency.

## How Codex memory works

OpenAI's current Codex documentation describes a separate local memory system, unrelated to
ChatGPT web memory. It is opt-in, can be controlled per chat with `/memories`, performs background
memory work after a session is idle, redacts secrets, and stores generated state under
`~/.codex/memories/`. The documented controls separately govern generating and using memory, idle
delay, rollout age, startup selection, rate-limit headroom, and extraction/consolidation models.
See [OpenAI's Codex memories documentation](https://learn.chatgpt.com/docs/customization/memories.md).

A local installation currently materializes compact summaries, consolidated durable entries,
rollout summaries, and evidence artifacts in that directory. That file layout is an observed
implementation detail, not a compatibility API for Code2.

| Concern | ec-mono | Codex local memory | Code2 |
| --- | --- | --- | --- |
| Scope | user/session domain | local Codex tasks | project path |
| Capture | model-assisted staged pipeline | background extraction and consolidation | immediate L2 plus delayed deterministic L1/L3 consolidation |
| Raw evidence | L0 repository records | rollout/evidence artifacts | existing SQLite transcript |
| Recall | automatic context plus explicit retrieval | compact memory summary at task startup/use | bounded prompt block plus Settings search |
| Controls | service/tool contract | config plus per-chat `/memories` | global controls, per-session read/write presets, provenance gate, inspect, pin, forget, undo |
| Provider portability | agent service | Codex only | any ACP provider |

## Known boundaries

- Global settings and per-session policies are both enforced; stored and recalled items remain
  isolated by exact project path.
- Derived capture is intentionally conservative and can miss an implicit preference or decision.
- Search is lexical, not embedding-based; it works offline but will miss some semantic matches.
- The desktop app exposes inspection controls today. The core data remains available to other
  frontends, but the TUI and remote UI do not yet have a memory manager.
- Disabling recall leaves stored rows untouched. **Forget** deactivates an editable derived row;
  **Undo** reactivates it. Raw transcripts and the L3 profile are inspection-only.
