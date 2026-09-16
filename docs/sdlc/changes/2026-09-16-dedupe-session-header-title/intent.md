---
id: 2026-09-16-dedupe-session-header-title
schema: 5
stage: intent
status: accepted
owner: chenli
created: 2026-09-16
source: user
risk: low
approved_by: chenli
approved_at: 2026-09-16
approval_source: "Direct request: 这里有两篇一样的内容, with a screenshot boxing the same prompt twice in the session header."
next_trigger: chenli reviews the verified work.
---

# Intent: Stop printing the same name twice in the session header

## Intent

The user's screenshot boxes one prompt printed twice in the session header:
`IchenDEV.github.io / 帮我把这个项目里的图像都压缩成 WebP。 / 帮我把这个项目里的图像都压缩成 WebP`.

The header deliberately names a pane's board task and then trails the session title for context, but
suppresses the trailing copy when both carry the same name — "a task created from a single-prompt
thread". That guard compares the two titles with `trim()` only
(`apps/desktop/src/App.tsx`, `activeSessionTitle.trim() !== activeBoardTask.title.trim()`), while the
two names come from different derivations of the same prompt:

- the board auto-names the task from the submitted prompt (`summarizeDoc`, whitespace-collapsed and
  sliced to 72 characters) — for this session `帮我把这个项目里的图像都压缩成 WebP。` with the final
  punctuation;
- the session carries the core's automatic first-sentence title (`crates/core/src/session.rs`
  `initial_session_title`: leading markdown dropped, first sentence only, bounded) — the same text
  without the `。`, which is exactly what this session's durable `sessions.title` holds.

So the same thread is named twice. Outcome: the header prints that name once, for any pair of names
that differ only by the automatic derivation (sentence punctuation, surrounding whitespace, case,
leading markdown, or the independent length bounds), while genuinely different task and session names
still trail as before.

Constraints: keep the trailing-session-title behavior, the header layout, and the `site` of the
comparison in the header; no change to the task naming (`summarizeDoc`) or to the core's automatic
title, so no durable data is rewritten. Non-goals: changing session/task creation, the rail's
preview line, or any other title surface.

## Non-goals

No durable title migration or rewrite, no change to `initial_session_title` or the board's task
naming, and no change to the rail, task board, or pane-header titles.
