---
id: 2026-09-16-dedupe-session-header-title
schema: 5
stage: spec
status: accepted
owner: chenli
created: 2026-09-16
based_on: intent.md
---

# Spec: Stop printing the same name twice in the session header

## Design

One owner for the rule, in a new `apps/desktop/src/session/title.ts`:

- `threadTitleKey(value)` — comparison key: whitespace collapsed, trim, leading markdown
  (`#`, `>`, `*`, `-`, `+`, backtick, quotes) dropped, then trailing sentence punctuation
  (`.!?。？！;；:：,，、` and closing quotes) dropped, case-folded. This mirrors the two derivations
  in play: the core's `initial_session_title` drops leading markdown and stops at the first sentence,
  while the board's `summarizeDoc` slice keeps the raw punctuation.
- `sameThreadTitle(left, right)` — equal keys, or one key a prefix of the other, because the prompt
  slice (72 chars) and the automatic title (8 words / 40 chars, 24 for unspaced scripts) stop at
  independent bounds.
- `sessionTitleTail(taskTitle, sessionTitle)` — the session name to trail, or `null` when the task
  already names the thread or the session title is empty/missing.

`apps/desktop/src/session/SessionTitlePair.tsx` owns the header's rendered pair: the `/` separator
plus the trailing session-title span, or nothing. `apps/desktop/src/App.tsx` renders that component
when a board task is active and drops the raw
`activeSessionTitle.trim() !== activeBoardTask.title.trim()` comparison, so the rendered span (and its
classes) stay addressable by a DOM test.

Boundaries: the header keeps its markup, classes, localization, and the task title as the primary
name; both derivations keep their owners (no durable data changes); an empty session title still
renders nothing. Failure path: a task/session name pair that differs beyond these normalizations
still trails (unchanged behavior), and the source contract in the test file fails if the header goes
back to comparing raw titles.

## Acceptance criteria

- [x] AC-1: The session header suppresses the trailing session title when the task and session names
  describe the same thread, including the reported pair that differs only by the final `。`.
- [x] AC-2: Genuinely different names still trail, and an empty or missing session title still
  renders nothing.
- [x] AC-3: The rendered header pair prints nothing for the reported pair and still trails a
  genuinely different session name after the `/` separator.
- [x] AC-4: No regression: desktop lint, type, and test checks pass, and no other title surface or
  derivation changes.
