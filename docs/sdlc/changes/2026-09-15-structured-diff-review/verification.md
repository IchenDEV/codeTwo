---
id: 2026-09-15-structured-diff-review
schema: 5
stage: verification
status: blocked
owner: chenli
created: 2026-09-15
based_on: plan.md
revision: 9de1ebb12e833ebfdfc07a725f65a4ecf31de5b7 + uncommitted worktree changes
verification_mode: owner
verified_by: chenli
verified_at: 2026-09-15
release_target: none
cleanup_status: complete
next_trigger: A human opens Source Control on a real multi-file worktree diff and confirms per-file collapse, `+N −M` stats, and old/new gutters; then set AC-5 and this stage to passed.
---

# Verification: Structured per-file diff review

## Verification

- AC-1: PASS — `cargo test -p codetwo-core --lib git::tests` ran
  `parses_per_file_hunks_with_line_numbers_and_counts`: two `diff --git` sections parse in order with
  `src/a.rs` (2 additions, 1 deletion) and `b.txt` (1 addition, 0 deletions).
- AC-2: PASS — the same test asserts `@@ -1,3 +1,4 @@` ranges and per-kind line numbers (context in
  both gutters, removed only old, added only new), and `parses_renames_and_tolerates_empty_or_truncated_text`
  asserts the omitted-count form `@@ -7 +9 @@` as `(7,1)`/`(9,1)` with `old_line = 7`, `new_line = 9`.
- AC-3: PASS — the same test parses `rename from old.rs` / `rename to new.rs` into
  `path = "new.rs"`, `old_path = Some("old.rs")`, and the new-file case resolves `b.txt` from `+++`
  while ignoring the `/dev/null` pre-image (`old_path` stays `None`).
- AC-4: PASS — the same test asserts `parse_unified_diff("")` is empty and a truncated tail yields
  exactly one file with its single hunk and 1/1 counts, without panicking.
- AC-5: BLOCKED — `bun test tests/diffReviewRendered.test.tsx` renders `DiffReview` through the DOM
  harness and asserts two `details.diff-file` sections, the sticky path, `from src/old_a.rs`, `+2`,
  `−1`, per-kind classes, and the old/new gutter values (`2`/`` and ``/`2`); `bun run lint`,
  `bun run lint:styles`, `bunx tsc --noEmit`, the full `bun test` (901 pass, 3 pre-existing
  `pluginBridgeContract` failures from the absent `crates/plugins`), and `bunx vite build` all pass.
  The requirement is an actual rendered window over a real worktree diff; no display or instance was
  available, so that observation was not performed.

Verdict: blocked — the parser and the review component are verified by tests and the desktop builds,
but AC-5's real-window observation is outstanding.
Residual risk: the structured view is capped by the same core byte/file bounds, so a diff truncated
before a complete `diff --git` section falls back to the flat preview; very large diffs still render
every parsed line with no virtualization.

## Cleanup

Removed: none — no task-owned scratch roots were created.
Retained: none.
Retention owner: not applicable.
Cleanup trigger: not applicable.
Processes: none started; no desktop instance, server, or test daemon was launched.
Evidence: `git status --porcelain` lists only the intended source, style, test, and record edits;
`git check-ignore apps/desktop/dist` confirms the build output is ignored.

## Review and release

Approval: pending — merge and external actions require their own authorization.
Rollback: See plan.md.
Release: No release requested; merge and external actions require their own authorization.
Feedback: Link an Incident and regression Eval when a real failure occurs.
