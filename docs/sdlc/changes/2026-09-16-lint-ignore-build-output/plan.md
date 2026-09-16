---
id: 2026-09-16-lint-ignore-build-output
schema: 5
stage: plan
status: accepted
owner: chenli
created: 2026-09-16
based_on: spec.md
scope: apps/desktop/oxfmt.config.ts, docs/sdlc/changes/2026-09-16-lint-ignore-build-output
---

# Plan: Keep the lint run away from build output

## Plan

1. `apps/desktop/oxfmt.config.ts` — add `**/dist/**` and `**/build/**` to `ignorePatterns` with the
   reason in a comment. (AC-1, AC-3)
2. Reproduce the state the watcher leaves behind (`apps/desktop/dist/` present) and run the two
   affected commands: `bun run lint` and `bun run build:renderer`. (AC-1, AC-2)
3. Confirm the maintained verdict is unchanged by running the same pair again after the fix and
   comparing with the earlier passing runs in this session.

Temporary resources: the ignored `apps/desktop/dist/` output that `build:renderer` recreates is
removed before handoff; no other scratch is created.

Rollback: revert the two added lines; no source, script, or rule depends on them.
