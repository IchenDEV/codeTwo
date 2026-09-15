---
id: 2026-09-15-purge-tui-documentation
schema: 5
stage: verification
status: passed
owner: chenli
created: 2026-09-15
based_on: plan.md
revision: 9de1ebb12e833ebfdfc07a725f65a4ecf31de5b7 + uncommitted worktree changes
verification_mode: owner
verified_by: chenli
verified_at: 2026-09-15
release_target: none
cleanup_status: complete
next_trigger: chenli reviews verified work.
---

# Verification: Purge the removed TUI from the documentation

## Verification

- AC-1: PASS — `website/guide/tui.md` is deleted (`git status` shows `D`), the
  `{ text: "The TUI", link: "/guide/tui" }` entry is removed from
  `website/.vitepress/config.mts`, and `rg "/guide/tui"` over `docs` and `website` matches nothing
  outside this change record.
- AC-2: PASS — `rg "codetwo-tui"` over `docs`, `website`, `README.md`, `AGENTS.md`, `CONTEXT.md`,
  `Design.md`, `script`, and `.agents` matches nothing outside historical change records.
- AC-3: PASS — `rg -i "\btui\b|ratatui"` over the same set matches nothing outside historical
  records; the replaced prose names the desktop, server, remote client, or NAPI addon.
- AC-4: PASS — `website/guide/introduction.md` now reads "One GUI over **eleven agent CLIs** — Claude
  Code, Codex, Grok, Cursor, OpenCode 1, OpenCode 2, Pi, Kimi, ZCode/GLM, Amp, Droid", matching the
  provider registry.
- AC-5: PASS — `bun script/verify/docs.ts` reports `[docs] catalog, links, schemas, and assets
  valid`; `bun run docs:build` from `website` reports `build complete in 1.20s` with no dead-link
  warning; `bun script/verify/sdlc.ts --worktree` reports `[sdlc] contract valid`.

Verdict: verified.
Residual risk: none identified for this change. The navigation entry removal is the only structural
edit, and the website build renders every edited page.

## Cleanup

Removed: the obsolete page `website/guide/tui.md`.
Retained: `website/node_modules` (installed to run the docs build) and the git-ignored
`website/.vitepress/{cache,dist}` build output. These are standard, ignored toolchain/build trees,
not task-owned scratch.
Retention owner: repository toolchain; next cleanup is the ordinary build-cache cleanup.
Cleanup trigger: not scheduled — ignored build caches only.
Processes: none started.
Evidence: `git status --porcelain` lists only the intended documentation, navigation, and record
edits plus the page deletion; `git check-ignore website/.vitepress/dist website/node_modules`
confirms the build outputs are ignored.

## Review and release

Approval: pending — merge and external actions require their own authorization.
Rollback: See plan.md.
Release: No release requested; merge and external actions require their own authorization.
Feedback: Link an Incident and regression Eval when a real failure occurs.
