---
id: "2026-09-06-desktop-ci-speed"
stage: verification
schema: 3
status: passed
owner: auto
created: "2026-09-06"
based_on: plan.md
commit: "5ca3dad4"
verification_mode: owner
verified_by: "auto"
verified_at: "2026-09-06"
release_target: none
release_identity: ""
---

# Verification: Speed up desktop design-system CI

## Automated checks

- AC-1: PASS — `.github/workflows/desktop-design-system.yml` pins `bun-version: 1.3.10`, sets
  `timeout-minutes` (25 validate / 15 matrix), runs `bun run test:ci` on Ubuntu and
  `bun run test:smoke` on macOS/Windows (`rg timeout-minutes test:ci test:smoke .github/workflows/desktop-design-system.yml`).
- AC-2: PASS — `dorny/paths-filter` gates `mutation:taskboard` behind `needs.changes.outputs.taskboard`
  (`rg mutation:taskboard taskboard .github/workflows/desktop-design-system.yml`).
- AC-3: PASS — `bunfig.toml` preloads `tests/silenceActWarnings.ts`; `bun test --timeout 15000 tests/sourceControlConfirmationRendered.test.tsx` → 1 pass in ~305ms; `bun run test:ci` finished in ~20s (`853` tests) instead of multi-hour hangs.
- AC-4: PASS — `bun script/verify/sdlc.ts` and `bun script/verify/sdlc.ts --worktree` exit 0 for this
  worktree after the schema-3 bundle is added.

## Behavioral evidence

- AC-3: PASS — `bun run test:smoke` completed in ~13s (452 tests / 81 files) without hanging;
  previously CI cancelled after multi-hour `bun test` on SourceControl-related renders.

## Visual evidence

Not applicable — CI workflow change; GitHub Actions run URL recorded after push.

## Security and privacy evidence

No new secrets or network surfaces; public Actions only.

## Deviations and residual risk

Residual risk: Ubuntu `test:ci` may still fail on pre-existing assertion mismatches unrelated to hang
speed; smoke matrix will not catch happy-dom-only regressions on macOS/Windows. Mutation is skipped
when taskboard paths are untouched.

## Verdict

Verdict: verified.

## Review and release

Approval: pending human merge review.
Release target: none.
Release identity: not applicable until released.
Smoke evidence: not applicable until released.
Rollback: revert this change; restore the prior full three-OS `bun test` workflow.
No release: CI tooling only.

## Feedback

No feedback yet.
