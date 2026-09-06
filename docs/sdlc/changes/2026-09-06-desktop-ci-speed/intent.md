---
id: "2026-09-06-desktop-ci-speed"
stage: intent
schema: 3
status: accepted
owner: auto
created: "2026-09-06"
source: "user request to fix slow desktop CI"
risk: medium
approved_by: "chenli"
approved_at: "2026-09-06"
---

# Intent: Speed up desktop design-system CI

## Problem

The Desktop design system workflow runs a full `bun test` on Ubuntu, macOS, and Windows with no
job timeout. After the type-safety pass, effect identity loops and React `act(...)` warning floods
caused `bun test` to run for hours until cancelled, blocking PR feedback.

## Proposed outcome

Desktop CI finishes in tens of minutes: one full timed suite on Ubuntu, smoke unit tests on macOS
and Windows, TaskBoard mutation only when taskboard paths change, and act-warning noise silenced
in the bun test preload. SourceControl effect deps no longer spin forever under bun test.

## Affected users and systems

GitHub Actions for `apps/desktop` PRs/pushes. Local `bun test` also benefits from the act preload.

## Constraints

- Keep a meaningful correctness Gate on Ubuntu (full suite + lint/typecheck + renderer build).
- Cross-platform coverage remains as a smoke of `tests/*.test.ts` (no happy-dom rendered suite).
- Do not disable TaskBoard mutation when taskboard sources change.
- Pin Bun to the repository CI version (`1.3.10`).

## Out of scope

- Fixing every non-hanging assertion failure in the full suite.
- Nightly/release macOS packaging workflows.
- Multi-instance desktop profile work.

## Success signals

- Desktop design-system jobs complete under configured timeouts instead of multi-hour cancels.
- `bun run test:smoke` and a timed `bun run test:ci` finish locally without hanging on SourceControl.
- `bun script/verify/sdlc.ts --worktree` accepts this change bundle.

## Open questions

None.

## Decision

The user's direct 2026-09-06 request to fix slow CI accepts this Intent, with user `chenli` as
named approver.
