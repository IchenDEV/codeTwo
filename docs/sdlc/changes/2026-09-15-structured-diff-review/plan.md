---
id: 2026-09-15-structured-diff-review
schema: 5
stage: plan
status: accepted
owner: chenli
created: 2026-09-15
based_on: spec.md
scope: docs/sdlc/changes/2026-09-15-structured-diff-review/intent.md, docs/sdlc/changes/2026-09-15-structured-diff-review/spec.md, docs/sdlc/changes/2026-09-15-structured-diff-review/plan.md, docs/sdlc/changes/2026-09-15-structured-diff-review/verification.md, crates/core/src/git.rs, apps/desktop/src/bridge.ts, apps/desktop/src/git/DiffReview.tsx, apps/desktop/src/git/SourceControl.tsx, apps/desktop/src/styles.css, apps/desktop/tests/diffReviewRendered.test.tsx
---

# Plan: Structured per-file diff review

## Plan

1. `crates/core/src/git.rs` — add `FileDiff`/`DiffHunk`/`DiffLine`/`DiffLineKind` and the pure
   `parse_unified_diff`, add the additive `file_diffs` field to `DiffResult`, populate it once in
   `diff_with_limits` from the already-bounded `text`, and add parser unit tests.
2. `apps/desktop/src/bridge.ts` — mirror the structured types on `GitDiffResult.file_diffs` and the
   empty constant.
3. `apps/desktop/src/git/DiffReview.tsx` — new per-file collapsible review component with `+N −M`
   statistics and old/new line-number gutters.
4. `apps/desktop/src/git/SourceControl.tsx` — `DiffView` uses `DiffReview` when `file_diffs` is
   present and keeps the flat `<pre>` as the fallback; the truncation banner becomes a shared notice.
5. `apps/desktop/src/styles.css` — add `diff-review`/`diff-file`/`diff-gutter` rules scoped so the
   existing `.diff-line` consumers (for example the PR panel) are unchanged.
6. `apps/desktop/tests/diffReviewRendered.test.tsx` — render `DiffReview` and assert sections, stats,
   gutters, kinds, and the notice.

Checks by risk and affected behavior:

- Rust core (pure parser over bounded text): `cargo test -p codetwo-core --lib git::tests`.
- Desktop renderer: `bun run lint`, `bun run lint:styles`, `bunx tsc --noEmit`, `bun test`,
  `bunx vite build`.
- Repository: `bun script/verify/sdlc.ts --worktree` and `bun script/verify/docs.ts` before handoff.
- AC-5's real-window check is required by the workflow. The environment has no display and no
  instance was launched, so that part is recorded as not performed with its residual risk; the
  component itself is exercised by the DOM-rendering test harness.

Temporary resources: none. Tests use the shared ignored `target/` directory, the jest-less Bun DOM
harness, and the git-ignored `apps/desktop/dist/` build output.

Rollback: revert the change commit and delete this record's directory. `file_diffs` is additive
with a serde default, so older renderers and stored payloads remain valid.
