---
id: 2026-09-15-structured-diff-review
schema: 5
stage: intent
status: accepted
owner: chenli
created: 2026-09-15
source: user
risk: medium
approved_by: chenli
approved_at: 2026-09-15
approval_source: "Direct request: 开工，四项全做，分批。Batch 2 = 变更审核：diff 引擎已有，升级成逐文件折叠 + 行数统计并入审核流。"
next_trigger: chenli reviews verified work.
---

# Intent: Structured per-file diff review

## Intent

The core deliberately returns a **flat, byte-bounded unified diff string** with only an aggregate
line-count triple: `DiffResult.text` with `files: usize` (`crates/core/src/git.rs:63-79`), and
`parse_numstat` discards per-path counts (`crates/core/src/git.rs:1067-1103`). The desktop renders
that blob into a single `<pre>` with no hunk parsing, no old/new line numbers, and no per-file
sections (`apps/desktop/src/git/SourceControl.tsx:88-159`, `apps/desktop/src/git/state.ts:210-240`).
Review therefore cannot be read or referenced file by file, and it is not wired into any approval
entry point.

Outcome: a structured diff (per-file hunks with addition/deletion counts and old/new line numbers)
is parsed once at the existing bounded assembly point and shipped on the existing `git.diff` /
`git.diff_since` payloads; the desktop reviews it as per-file collapsible sections with line-number
gutters and file-level `+N −M` statistics.

Constraints: no new git invocation and no change to the existing 2 MiB / 256-file / 10 s bounds;
the flat `text` field stays for every current consumer; parsing is a pure function over the already
bounded text. Non-goals: side-by-side view, inline line comments, streaming/virtualized rendering,
and diff-aware approval wiring (Mission Control / suggestions / scene gates) — those are follow-ups.

## Non-goals recorded for the deferred half

Diff-aware approval entry points remain out of scope: Mission Control's Review opens the generic
Source Control modal (`apps/desktop/src/App.tsx:6022-6028`), team Suggestion approval runs a text
goal (`crates/server/src/lib.rs:1780-1793`), and scene confirm gates carry no diff
(`apps/desktop/src/session/StageTrack.tsx:160-163`).
