# Project memory

Code2 can remember stable project facts and earlier outcomes across sessions — even when the next
session uses a different agent provider. The memory stays local in Code2's SQLite store and is
scoped to the exact project path.

Open **Settings → Memory** to control or inspect it.

## What the layers mean

| Layer | Meaning |
| --- | --- |
| **L0 · Raw transcript** | Your existing Code2 conversation history. It is searched, not duplicated. |
| **L1 · Stable notes** | Constraints, preferences, facts, decisions, and notes you add yourself. |
| **L2 · Work episodes** | A compact request/outcome record from a completed turn. |
| **L3 · Project profile** | A conservative roll-up made after the project has at least three stable notes. |

Every derived item keeps a pointer back to the session and transcript part that produced it. A
manual note is labeled `manual`.

## Controls

- **Enable memory** is the master switch.
- **Learn from completed turns** controls new L1–L3 capture.
- **Recall into prompts** controls whether a small relevant memory block is sent with new prompts.
- **Learn from external context** controls whether turns that used tools, files, MCP, browser
  context, images, referenced chats, or recalled memory may create durable memory.
- Search finds records across all four layers. Chinese text uses bigram matching, so a query does
  not need spaces between words.
- Pin a stable L1 note to keep it in the bounded automatic-recall pocket.
- Forget an editable memory to deactivate it. The toast's **Undo** action restores it.

Turning memory off does not erase data. That makes it safe to pause recall without losing the
project's history.

Stable L1 facts do not become durable immediately. They wait in a visible candidate count for 30
minutes after the session's latest completed turn, then background maintenance promotes them and
refreshes L3. L2 work episodes remain immediate and source-linked.

The composer also controls each session independently:

- **Memory on** recalls and learns.
- **Recall only** recalls but does not learn from the session.
- **Private session** neither recalls nor learns.
- **Learn only** learns without sending existing memory into the session.

## What reaches the model

Code2 sends at most 12 L1 notes, 3 earlier L2 episodes, 1 L3 profile, and — only when you explicitly
ask about earlier work — 3 raw L0 excerpts. Current-session episodes are excluded.

Recalled material is labeled as untrusted reference data. Your current request and repository
rules always take precedence, and recalled transcript text is never treated as an instruction by
itself. The injected block is not saved back into the transcript, so it is not recaptured as
user-authored input.

Each turn that receives recalled context shows a **Memory used** receipt. Expand it to inspect the
exact items, source pointers, and estimated prompt tokens. The receipt is stored separately from
the conversation, so transparency does not contaminate future transcript recall.

Capture ignores expanded file contents, rule bodies, and skill bodies. It also redacts common
secret shapes before saving derived text, though you should still avoid placing credentials in a
manual memory.

## Memory and provider sessions

Project memory complements provider-native session context; it does not replace it. Continuing one
Codex or Claude Code session still uses that provider's ACP session state. Project memory supplies a
small, inspectable bridge when you start another session or use a different provider.
