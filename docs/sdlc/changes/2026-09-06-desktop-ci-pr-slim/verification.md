---
id: "2026-09-06-desktop-ci-pr-slim"
stage: verification
schema: 3
status: passed
owner: auto
created: "2026-09-06"
based_on: plan.md
commit: "2c10b9b4"
verification_mode: owner
verified_by: "auto"
verified_at: "2026-09-06"
release_target: none
release_identity: ""
---

# Verification: Slim desktop PR CI to Ubuntu only

## Automated checks

- AC-1: PASS — `desktop-design-system.yml` jobs are `changes` and `desktop` only;
  `rg 'matrix:|test-cross-platform|macos-latest|windows-latest' .github/workflows/desktop-design-system.yml`
  has no matches.
- AC-2: PASS — correctness job is `desktop` (`rg '^  desktop:' .github/workflows/desktop-design-system.yml`).
- AC-3: PASS — `bun script/verify/sdlc.ts` and `bun script/verify/sdlc.ts --worktree` exit 0.

## Behavioral evidence

PR Desktop workflow no longer schedules macOS/Windows smoke; Nightly/Windows package workflows
remain the OS packaging Gates.

## Visual evidence

Not applicable until post-push Actions URL is recorded.

## Security and privacy evidence

CI-only; no secrets.

## Deviations and residual risk

Supersedes PR smoke matrix from `2026-09-06-desktop-ci-speed`.

Residual risk: OS-specific unit quirks only surface on package/nightly until asserted there;
Ubuntu `test:ci` may still fail on pre-existing assertion mismatches.

## Verdict

Verdict: verified.

## Review and release

Approval: pending human merge review.
Release target: none.
Release identity: not applicable.
Smoke evidence: not applicable.
Rollback: restore prior smoke-matrix workflow revision.
No release: CI tooling only.

## Feedback

No feedback yet.
