---
id: "2026-09-06-desktop-ci-pr-slim"
stage: spec
schema: 3
status: accepted
owner: auto
created: "2026-09-06"
based_on: intent.md
risk: low
approved_by: "chenli"
approved_at: "2026-09-06"
---

# Spec: Slim desktop PR CI to Ubuntu only

## Requirements

- `.github/workflows/desktop-design-system.yml` runs only on `ubuntu-latest` for correctness work.
- The correctness job is named `desktop` (not `validate`) to avoid colliding with SDLC.
- That job keeps Bun `1.3.10`, `timeout-minutes: 25`, lint/typecheck, `bun run test:ci`,
  path-gated `mutation:taskboard`, and `vite build`.
- The `changes` path-filter job remains for TaskBoard gating.
- No `strategy.matrix` / `test-cross-platform` jobs remain in this workflow.
- Local `bun run test:smoke` may stay in `apps/desktop/package.json` for optional use.

## User experience

PR authors see fewer Desktop checks and no duplicate `validate` label from this workflow.

## Technical design

Delete the macOS/Windows smoke matrix from `desktop-design-system.yml`. Rename `validate` →
`desktop`. Leave Nightly/Windows package workflows alone.

## Security and privacy

CI-only change; no product runtime or secrets.

## Alternatives and non-goals

- Keeping smoke matrix — rejected by the user as over-testing for PRs.
- Moving smoke into Nightly — optional later; not required for this change.
- Fixing failing assertions — out of scope.

## Areas of concern

Ubuntu-only PR Gate will not catch rare Bun/path differences on macOS/Windows until package/nightly
runs. Acceptable because packaging workflows already exercise those OSes.

## Acceptance criteria

- [ ] AC-1: `desktop-design-system.yml` has jobs `changes` and `desktop` only; no OS matrix.
- [ ] AC-2: Correctness job id/name is `desktop`, not `validate`.
- [ ] AC-3: `bun script/verify/sdlc.ts` and `bun script/verify/sdlc.ts --worktree` pass.

## Decision

The user's 2026-09-06 "开始处理" request accepts this Spec, with user `chenli` as named approver.
