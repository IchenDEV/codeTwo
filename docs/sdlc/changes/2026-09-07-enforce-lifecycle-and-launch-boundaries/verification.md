---
id: "2026-09-07-enforce-lifecycle-and-launch-boundaries"
stage: verification
schema: 3
status: passed
owner: codex
created: "2026-09-07"
based_on: plan.md
commit: ""
verification_mode: owner
verified_by: "codex"
verified_at: "2026-09-07"
release_target: none
release_identity: ""
---

# Verification: Enforce Lifecycle And Launch Boundaries

## Automated checks

`bun test script/verify/checks.test.ts script/devflow.test.ts script/dev/run.test.ts`: PASS, 14 tests and 106 assertions. The new Gate cases first failed on the original checker; the launcher cases first failed on implicit replacement and the missing explicit restart mode.

`bash -n script/dev/run.sh`: PASS.

`bun script/verify/docs.ts`, `bun script/verify/sdlc.ts`, and `bun script/verify/sdlc.ts --worktree`: PASS before closing this record.

`git diff --check`: PASS.

## Behavioral evidence

- AC-1: PASS — `script/dev/run.test.ts` runs the shell entrypoint in disposable directories with mocked process/build/log commands: ordinary modes preserve the owner, logs and telemetry only attach, explicit restart waits, and a stubborn owner prevents rebuilding.
- AC-2: PASS — `script/verify/checks.test.ts` rejects unchanged historical approval for edits, deletions, and renames in both worktree and committed differences; updating the covering Plan restores the valid path.
- AC-3: PASS — `script/verify/checks.test.ts` rejects different-result and different-detail duplicate mappings, accepts exact repeated records, and validates genuine failed evidence. The four mappings in [the historical record](../2026-09-02-four-stage-sdlc/verification.md) each retain both original descriptions.
- AC-4: PASS — `script/devflow.test.ts` exercises creation, validation, review approval, Draft and Ready PR checks. `script/verify/checks.test.ts` accepts valid stage prefixes and blocks gaps, unapproved predecessors, implementation under a draft Plan, and release without passing verification.
- AC-5: PASS — `script/verify/checks.test.ts` rejects unfinished markers while accepting ordinary words and identifier substrings. The full live Artifact tree validates.
- AC-6: PASS — `docs/sdlc/workflow.md`, the operator guide and stage reference now describe actual stage states, current-change coverage, and evidence uniqueness. `README.md` documents explicit restart and non-mutating log inspection.

## Visual evidence

Not applicable: no rendered UI changes. No production desktop instance was launched.

## Security and privacy evidence

Approval identity, accepted prerequisites, release target/approval/rollback, and independent high-risk verification remain checked. All executable probes used temporary repositories or mock process operations; no user process was signalled.

## Deviations and residual risk

Residual risk: the shell guard protects the tracked launcher owner and cannot provide race-free data-directory ownership across separate launchers or worktrees; the native OS-lock/profile contract remains unimplemented. Mock process tests verify control flow, not full desktop runtime isolation.

## Verdict

Verdict: verified.

## Review and release

Approval: Chen Li authorized the five repairs with “开始修复” on 2026-09-07; merge and release are not authorized.
Release target: none.
Release identity: not applicable until released.
Smoke evidence: not applicable until released.
Rollback: revert only this repair’s scoped edits while retaining the preceding scaffold cleanup.
No release: Chen Li requested PR creation on 2026-09-07; merge and deployment remain unapproved.

## Feedback

Only exact repeated historical evidence is treated as one record. Differing evidence is rejected. Conditional provider-rule loading remains outside this repair.
