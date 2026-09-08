---
id: "2026-09-06-desktop-ci-pr-slim"
stage: plan
schema: 3
status: accepted
owner: auto
created: "2026-09-06"
based_on: spec.md
risk: low
scope: .github/workflows/desktop-design-system.yml, docs/sdlc/changes/2026-09-06-desktop-ci-pr-slim
approved_by: "chenli"
approved_at: "2026-09-06"
---

# Plan: Slim desktop PR CI to Ubuntu only

## Files and ownership

- `.github/workflows/desktop-design-system.yml` — drop matrix; rename job to `desktop`
- `docs/sdlc/changes/2026-09-06-desktop-ci-pr-slim/` — this bundle

## Order of work

1. Rewrite the workflow to Ubuntu-only `desktop` job.
2. Record verification; push.

## Test-first proof

- `rg 'matrix:|test-cross-platform|macos-latest|windows-latest' .github/workflows/desktop-design-system.yml`
  returns no matches for matrix smoke.
- `rg '^  desktop:' .github/workflows/desktop-design-system.yml` matches.
- `bun script/verify/sdlc.ts --worktree` exits 0.

## Visual or integration proof

GitHub Actions Desktop design system run after push shows `changes` + `desktop` only.

## Risks and mitigations

- Missed OS-specific unit bugs — mitigated by existing Nightly macOS and Windows package workflows.

## Rollback

Restore the prior smoke matrix from `2026-09-06-desktop-ci-speed` workflow revision.

## Deviations

Supersedes the earlier Spec decision in `2026-09-06-desktop-ci-speed` that kept PR smoke on
macOS/Windows.

## Decision

The user's 2026-09-06 "开始处理" request accepts this Plan, with user `chenli` as named approver.
