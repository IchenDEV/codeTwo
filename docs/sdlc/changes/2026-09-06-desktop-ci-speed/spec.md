---
id: "2026-09-06-desktop-ci-speed"
stage: spec
schema: 3
status: accepted
owner: auto
created: "2026-09-06"
based_on: intent.md
risk: medium
approved_by: "chenli"
approved_at: "2026-09-06"
---

# Spec: Speed up desktop design-system CI

## Requirements

- `desktop-design-system.yml` pins Bun `1.3.10`, sets job `timeout-minutes`, and cancels in-progress
  runs via existing concurrency.
- Ubuntu `validate` runs lint/typecheck, `bun run test:ci` (full suite with per-test timeout),
  renderer `vite build`, and TaskBoard mutation only when taskboard-related paths change.
- macOS/Windows matrix runs `bun run test:smoke` (unit `tests/*.test.ts` only) instead of the full
  rendered suite.
- `apps/desktop/bunfig.toml` preloads `tests/silenceActWarnings.ts` to drop known React act
  environment warnings that flood CI logs.
- `SourceControl` effects depend on stable values (`cwd`, selection/status), not on fresh function
  identities each render, so bun test cannot spin forever.

## User experience

PR authors get desktop CI results within the job timeouts. Local `bun test` is quieter under
happy-dom. Cross-platform still catches Node/Bun platform differences in unit tests.

## Technical design

- Add `dorny/paths-filter` job to gate `mutation:taskboard`.
- Split lint/typecheck from `build:renderer` so lint failures surface before Vite.
- Package scripts: `test:ci`, `test:smoke` (+ `scripts/run-smoke-tests.ts` for Windows-safe globs).
- Keep rendered/integration coverage on Ubuntu only.

## Security and privacy

No product runtime change beyond SourceControl effect dependency hygiene. CI uses public Actions
only; no new secrets.

## Alternatives and non-goals

- Dropping macOS/Windows entirely was rejected; smoke coverage stays.
- Keeping three full `bun test` matrices was rejected as the primary wall-time driver.
- Disabling mutation permanently was rejected; it stays path-gated.

## Areas of concern

- Smoke tests will not catch happy-dom-only regressions on macOS/Windows; Ubuntu remains the Gate.
- Remaining non-hanging assertion failures may still fail Ubuntu `test:ci` until fixed separately.

## Acceptance criteria

- [ ] AC-1: Desktop design-system workflow uses Bun 1.3.10, job timeouts, Ubuntu full `test:ci`,
  and macOS/Windows `test:smoke`.
- [ ] AC-2: TaskBoard mutation runs only when taskboard paths change.
- [ ] AC-3: Act-warning preload is configured; SourceControl confirmation rendered tests finish
  without hanging under a 15s per-test timeout.
- [ ] AC-4: `bun script/verify/sdlc.ts` and `bun script/verify/sdlc.ts --worktree` pass for this
  bundle.

## Decision

The user's direct CI-speed request accepts this Spec, with user `chenli` as named approver.
