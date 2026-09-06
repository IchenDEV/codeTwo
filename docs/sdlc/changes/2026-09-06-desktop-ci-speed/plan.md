---
id: "2026-09-06-desktop-ci-speed"
stage: plan
schema: 3
status: accepted
owner: auto
created: "2026-09-06"
based_on: spec.md
risk: medium
scope: .github/workflows/desktop-design-system.yml, apps/desktop/bunfig.toml, apps/desktop/package.json, apps/desktop/scripts/run-smoke-tests.ts, apps/desktop/tests/silenceActWarnings.ts, apps/desktop/src/git/SourceControl.tsx, docs/sdlc/changes/2026-09-06-desktop-ci-speed
approved_by: "chenli"
approved_at: "2026-09-06"
---

# Plan: Speed up desktop design-system CI

## Files and ownership

- `.github/workflows/desktop-design-system.yml` — timeouts, path filter, smoke matrix (owner: auto)
- `apps/desktop/package.json` + `scripts/run-smoke-tests.ts` — `test:ci` / `test:smoke`
- `apps/desktop/bunfig.toml` + `tests/silenceActWarnings.ts` — act-warning preload
- `apps/desktop/src/git/SourceControl.tsx` — stable effect deps
- `docs/sdlc/changes/2026-09-06-desktop-ci-speed/` — this bundle

## Order of work

1. Stop SourceControl effect loops; add act-warning preload.
2. Add smoke/ci scripts; rewrite the workflow.
3. Record verification evidence; push and confirm SDLC Gates.

## Test-first proof

- `bun test --timeout 15000 tests/sourceControlConfirmationRendered.test.tsx`
- `bun run test:smoke` completes
- Timed sample of `bun run test:ci` progresses past SourceControl without hanging

## Visual or integration proof

GitHub Actions run for the PR after push (Desktop design system + SDLC).

## Risks and mitigations

- Path filter false negatives — include stryker config and taskBoard test globs in the filter.
- Windows glob expansion — use a Bun script instead of shell `find`.

## Rollback

Revert the workflow/script/preload/SourceControl commits; CI returns to the prior full-matrix shape.

## Deviations

None yet.

## Decision

The user's direct CI-speed request accepts this Plan, with user `chenli` as named approver.
