---
id: 2026-09-16-dedupe-session-header-title
schema: 5
stage: plan
status: accepted
owner: chenli
created: 2026-09-16
based_on: spec.md
scope: apps/desktop/src/App.tsx, apps/desktop/src/session/title.ts, apps/desktop/src/session/SessionTitlePair.tsx, apps/desktop/tests/sessionTitle.test.ts, apps/desktop/tests/sessionTitlePairRendered.test.tsx, docs/sdlc/changes/2026-09-16-dedupe-session-header-title
---

# Plan: Stop printing the same name twice in the session header

## Plan

1. `apps/desktop/src/session/title.ts` — new module owning the comparison key, the same-thread
   predicate, and the trailing-title decision, with the two derivations documented.
2. `apps/desktop/src/session/SessionTitlePair.tsx` — new presentational component owning the
   header's `/` + trailing-session-title span (or nothing), so the affected render is addressable.
3. `apps/desktop/src/App.tsx` — render `SessionTitlePair` when a board task is active and remove the
   raw trimmed-title comparison.
4. `apps/desktop/tests/sessionTitle.test.ts` — unit cases for the reported pair, whitespace/case/
   markdown/prefix normalization, genuinely different names, and empty titles, plus a source contract
   that the header uses the component and no longer compares raw trimmed titles.
5. `apps/desktop/tests/sessionTitlePairRendered.test.tsx` — DOM-rendered cases for the pair markup:
   the reported pair prints nothing, a different session name trails after `/`, an empty title prints
   nothing.

Checks by risk and affected behavior:

- Desktop renderer: `bun run lint`, `bunx tsc --noEmit`, and `bun test` from `apps/desktop`.
- Rendered pair (AC-3): the DOM-rendering harness mounts the real component with the reported pair;
  the full-window end-to-end run was attempted with `./script/build/hosts.sh debug` plus
  `./target/debug/codetwo-server webui --data-dir <task tmp> --ui-dir target/debug/web-ui --no-open`
  (a task-owned data directory with one seeded project, the user's instance untouched) and a Vite web
  server proxying that Core, but this session's collaborative browser could not reach the
  environment's local HTTP port, so the in-app confirmation is recorded as residual risk for the
  user's next build instead of being claimed.
- Repository: `bun script/verify/sdlc.ts --worktree` and `bun script/verify/docs.ts` before handoff.

Temporary resources: the task-owned roots `.codex/run/instances/dedupe-header-title/` (server log,
Core data directory, seeded project folder) and `.codex/run/instances/dedupe-header/` (Vite profile
cache), the repository's ignored `target/` build output (Cargo, tool broker, Web UI), and the local
server processes on ports 4599 and 1499. All are stopped or removed before handoff.

Rollback: revert the App.tsx render call and delete the two new modules and their tests; no data,
protocol, or persistence surface is involved.
