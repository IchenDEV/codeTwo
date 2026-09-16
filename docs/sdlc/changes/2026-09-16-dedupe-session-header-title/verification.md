---
id: 2026-09-16-dedupe-session-header-title
schema: 5
stage: verification
status: passed
owner: chenli
created: 2026-09-16
based_on: plan.md
revision: worktree 9823fc74 (branch t3code/fix-tool-card-alignment) plus this uncommitted change
verification_mode: owner
verified_by: chenli
verified_at: 2026-09-16
release_target: none
cleanup_status: complete
---

# Verification: Stop printing the same name twice in the session header

## Verification

- AC-1: PASS — `bun test tests/sessionTitle.test.ts` passes the case that reproduces the report:
  task `帮我把这个项目里的图像都压缩成 WebP。` (the board's `summarizeDoc` slice) against session
  `帮我把这个项目里的图像都压缩成 WebP` (the core's automatic first-sentence title) is
  `sameThreadTitle(...) === true` and `sessionTitleTail(...) === null`, so the header no longer prints
  the second copy.
- AC-2: PASS — `bun test tests/sessionTitle.test.ts` also covers whitespace/case/leading-markdown
  equality, both bounded-prefix directions, genuinely different names (`Release notes` / `Fix the
  parser` keeps the session title), and `null`/`undefined`/blank session titles returning `null`.
- AC-3: PASS — `bun test tests/sessionTitlePairRendered.test.tsx` mounts the real component in the DOM
  harness: the reported pair renders zero spans and empty text, a different session name renders
  exactly `/` + `Fix the parser`, and a blank session title renders nothing.
- AC-4: PASS — `bun run lint`, `bunx tsc --noEmit`, and `bun test` pass in `apps/desktop` (925
  passed, 3 skipped, 0 failed across 166 files); the only changed production paths are the new
  `session/title.ts`, the new `SessionTitlePair.tsx`, and the header render call in `App.tsx`, which
  no longer contains the raw `activeSessionTitle.trim() !==` comparison; the source contract asserts
  the component route.

Verdict: verified.
Residual risk: the full-window header was not observed live in this session. The shared Web UI was
built and served against a task-owned Core (`./script/build/hosts.sh debug`, then
`codetwo-server webui --data-dir .codex/run/instances/dedupe-header-title/data --no-open` with one
seeded project), but the collaborative browser could not reach the environment's local HTTP port
(every `localhost:4599`/`localhost:1499` navigation returned a Chrome error page while public sites
loaded), so the end-to-end screenshot is left to the user's next build. The change only removes two
spans for an equivalent pair and leaves the surrounding header markup, classes, and the genuinely
different-name path untouched, which the DOM-rendered component cases cover. The comparison is
deliberately prefix-tolerant, so a task title that merely starts with a different session's
automatic title suppresses that trailing name.

## Cleanup

Removed: `.codex/run/instances/dedupe-header-title/` (server log, task-owned Core data directory,
seeded project folder) and `.codex/run/instances/dedupe-header/` (Vite profile cache), plus the
repository's ignored `target/` output created by `./script/build/hosts.sh debug` (Cargo, tool broker,
and Web UI build).
Retained: none. No evidence file was produced because the browser check could not run;
`apps/desktop/node_modules` stays in place as the shared package install.
Processes: the task-owned `codetwo-server webui` process (port 4599) and the `vite --mode web` dev
server (port 1499) were stopped; the user's running C2 Nightly instance, its data directory, and its
paired sessions were never touched.
Evidence: `pgrep -fl "codetwo-server webui"` and `pgrep -fl "apps/desktop/node_modules/.bin/vite"`
matched nothing after the stop, `lsof -nP -iTCP:4599 -sTCP:LISTEN` and
`lsof -nP -iTCP:1499 -sTCP:LISTEN` were empty, and `ls target .codex/run/instances` confirmed the
removals.

## Review and release

Approval: implementation was requested directly by the user on 2026-09-16 (这里有两篇一样的内容);
merge, release, and external actions are not authorized.
Rollback: revert the App.tsx render call and delete `session/title.ts`, `SessionTitlePair.tsx`, and
their tests; no data, protocol, or persistence surface is involved.
Release: No release requested; merge and external actions require their own authorization.
Feedback: Link an Incident and regression Eval when a real failure occurs.
