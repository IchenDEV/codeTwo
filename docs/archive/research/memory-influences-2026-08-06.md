# Memory-system influences and comparison

Status: **archived research snapshot from 2026-08-06; non-normative**.

The current C2 memory contract is [`../../memory.md`](../../reference/memory.md). This file preserves the
comparative research that informed the first implementation.

## What came from ec-mono's mem-lab

`mem-lab` was the explanatory surface; the observed production design was under
`packages/agent/src/memory` on ec-mono's `origin/main`. C2 adopted these ideas:

- distinguish raw records, stable atomic memories, scenario episodes, and a slow-changing profile;
- retain evidence instead of presenting model-derived text as canonical fact;
- combine layer-aware ranking with lexical relevance and hard result limits;
- treat automatic injection and explicit memory search as different operations;
- keep memory separate from context-window compression.

C2 did not copy ec-mono's model-extraction pipeline. Its first release used deterministic L1
capture and structured L3 assembly to avoid surprise token cost or provider dependency.

## How Codex memory was observed

The Codex documentation reviewed at the time described a separate local memory system, unrelated
to ChatGPT web memory. It was opt-in, controllable per chat, performed background work after an idle
period, redacted secrets, and stored generated state under `~/.codex/memories/`. That documentation
and the observed local layout were research inputs, not compatibility APIs for C2.

| Concern | ec-mono | Codex local memory | C2 at the snapshot |
| --- | --- | --- | --- |
| Scope | user/session domain | local Codex tasks | project path |
| Capture | model-assisted staged pipeline | background extraction and consolidation | immediate L2 plus delayed deterministic L1/L3 consolidation |
| Raw evidence | L0 repository records | rollout/evidence artifacts | existing SQLite transcript |
| Recall | automatic context plus explicit retrieval | compact memory summary at task startup/use | bounded prompt block plus Settings search |
| Controls | service/tool contract | config plus per-chat controls | global controls, per-session read/write presets, provenance gate, inspect, pin, forget, undo |
| Provider portability | agent service | Codex only | any ACP provider |
