---
id: 2026-09-15-structured-diff-review
schema: 5
stage: spec
status: accepted
owner: chenli
created: 2026-09-15
based_on: intent.md
---

# Spec: Structured per-file diff review

## Design

Core gains a pure parser over the already-bounded unified diff text, and `DiffResult` gains an
additive `file_diffs` field:

```text
FileDiff { path, old_path: Option<String>, additions: u64, deletions: u64, hunks: Vec<DiffHunk> }
DiffHunk { old_start, old_lines, new_start, new_lines, lines: Vec<DiffLine> }
DiffLine { kind: context|added|removed, old_line: Option<u32>, new_line: Option<u32>, text }
```

`parse_unified_diff(text)` walks `diff --git` sections, reads `rename from/to`, `---`, and `+++`
to resolve paths (a `/dev/null` side is ignored rather than stored), parses each `@@ -a,b +c,d @@`
header (the omitted `,count` form means one line), and assigns old/new line numbers per kind. It
borrows only the bounded text, so the existing limits and the flat `text` field are unchanged;
`file_diffs` defaults to empty for the truncation early-returns.

The desktop adds matching types to `bridge.ts` and a `DiffReview` component that renders one
collapsible section per file — sticky file path with `+N −M`, and a two-gutter line list using the
existing add/remove/hunk color tokens. It replaces the flat `<pre>` in `SourceControl.tsx`'s
`DiffView`, keeping the truncation banner.

## Acceptance criteria

- [x] AC-1: `DiffResult.file_diffs` lists every `diff --git` section in order with its resolved
      path, additions, and deletions.
- [x] AC-2: Hunk headers parse old/new start and count, including the omitted `,count` form, and each
      line carries the correct old/new line number by kind (context both, added new, removed old).
- [x] AC-3: A rename populates `old_path` and a `/dev/null` side never becomes a path.
- [x] AC-4: Empty text and a truncated text parse without panicking, and the parsed file count never
      exceeds the sections present in the input.
- [x] AC-5: The desktop renders per-file collapsible sections with `+N −M` statistics and old/new
      line-number gutters for a real worktree diff.
