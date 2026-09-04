---
id: "2026-08-30-desktop-pet-pointer-interaction"
stage: verification
schema: 3
status: passed
owner: codex
created: 2026-08-30
based_on: plan.md
commit: ""
verification_mode: owner
verified_by: "codex"
verified_at: "2026-08-30"
release_target: none
release_identity: ""
---

# Verification: Restore desktop pet pointer interaction

## Automated checks

- Before the fix, `bun test tests/petSettings.test.tsx tests/pluginComponentPolicyContract.test.ts`
  produced 8 passes and 1 failure: the host still contained `passthrough: true`. After the fix, the
  same command produced 9 passes and 0 failures. The existing renderer harness still emits
  non-failing React `act(...)` warnings.
- `./script/dev/run.sh --verify` completed renderer, design, type, native Core, and package
  checks using the machine's existing Xcode beta / macOS 26.5 SDK compatibility setup. The design
  check reported 0 new violations; legacy debt remains 657.
- Real macOS-window verification used the built `C2-dev.app` with an isolated data directory while
  leaving the user's existing CodeTwo process running. After the main window was minimized, the
  separate `C2 Dev Pet` window remained visible at `views://main/desktop-pet.html`; the first mascot
  click visibly rendered the waving frame.
- The isolated Core later exited with `Resource temporarily unavailable (os error 35)`, so this
  evidence does not claim that the whole development runtime stayed healthy. The Electrobun pet
  window and its renderer remained available long enough to reproduce and verify the input fix.
- `bun script/verify/sdlc.ts` reported `[sdlc] contract valid`; task-scoped
  `git diff --check` passed.

Verdict: verified.

### Acceptance evidence

- AC-1: PASS — the recorded real-window check kept the mascot in the dedicated Electrobun pet window. Evidence: `Verification record above`.
- AC-2: PASS — `./script/dev/run.sh --verify` and host-contract inspection confirmed pointer passthrough was disabled for the pet surface.
- AC-3: PASS — the recorded click interaction visibly switched the mascot to its waving animation. Evidence: `Verification record above`.
- AC-4: PASS — `bun test tests/petSettings.test.tsx tests/pluginComponentPolicyContract.test.ts` preserved the existing pet paths.
- AC-5: PASS — focused tests, host verification, `bun script/verify/sdlc.ts`, real-window inspection, and `git diff --check` passed.

Residual risk: the isolated Core later exited with the recorded `os error 35`; evidence verifies
the pet window interaction, not long-running Core health or a versioned product release.

## Behavioral evidence

- Before the fix, `bun test tests/petSettings.test.tsx tests/pluginComponentPolicyContract.test.ts`
  produced 8 passes and 1 failure: the host still contained `passthrough: true`. After the fix, the
  same command produced 9 passes and 0 failures. The existing renderer harness still emits
  non-failing React `act(...)` warnings.
- `./script/dev/run.sh --verify` completed renderer, design, type, native Core, and package
  checks using the machine's existing Xcode beta / macOS 26.5 SDK compatibility setup. The design
  check reported 0 new violations; legacy debt remains 657.
- Real macOS-window verification used the built `C2-dev.app` with an isolated data directory while
  leaving the user's existing CodeTwo process running. After the main window was minimized, the
  separate `C2 Dev Pet` window remained visible at `views://main/desktop-pet.html`; the first mascot
  click visibly rendered the waving frame.
- The isolated Core later exited with `Resource temporarily unavailable (os error 35)`, so this
  evidence does not claim that the whole development runtime stayed healthy. The Electrobun pet
  window and its renderer remained available long enough to reproduce and verify the input fix.
- `bun script/verify/sdlc.ts` reported `[sdlc] contract valid`; task-scoped
  `git diff --check` passed.

Verdict: verified.

### Acceptance evidence

- AC-1: PASS — the recorded real-window check kept the mascot in the dedicated Electrobun pet window. Evidence: `Verification record above`.
- AC-2: PASS — `./script/dev/run.sh --verify` and host-contract inspection confirmed pointer passthrough was disabled for the pet surface.
- AC-3: PASS — the recorded click interaction visibly switched the mascot to its waving animation. Evidence: `Verification record above`.
- AC-4: PASS — `bun test tests/petSettings.test.tsx tests/pluginComponentPolicyContract.test.ts` preserved the existing pet paths.
- AC-5: PASS — focused tests, host verification, `bun script/verify/sdlc.ts`, real-window inspection, and `git diff --check` passed.

Residual risk: the isolated Core later exited with the recorded `os error 35`; evidence verifies
the pet window interaction, not long-running Core health or a versioned product release.

## Visual evidence

See bundle evidence/ when present.

## Security and privacy evidence

Not separately recorded unless present in legacy Verification.

## Deviations and residual risk

Residual risk: the isolated Core later exited with the recorded `os error 35`; evidence verifies

## Verdict

Verdict: verified..

## Review and release

The user explicitly authorized creating and merging the repository pull request on 2026-08-30.
[PR #181](https://github.com/IchenDEV/codeTwo/pull/181) carries the implementation; repository
integration remains pending until its checks pass and the merge is observed.

## Feedback

The repaired surface responded on the first click; no second click or main-window activation was
required. No additional pet-selection or active-task animation regression was observed in the
focused checks.
