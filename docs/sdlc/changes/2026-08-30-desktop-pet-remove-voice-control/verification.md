---
id: "2026-08-30-desktop-pet-remove-voice-control"
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

# Verification: Remove the desktop pet voice control

## Automated checks

- Before implementation, `bun test tests/pluginComponentPolicyContract.test.ts` produced 2 passes
  and 1 failure because the app still projected `voiceEnabled` into both the composer and desktop
  pet. After implementation,
  `bun test tests/petSettings.test.tsx tests/pluginComponentPolicyContract.test.ts` produced 9
  passes and 0 failures. The existing renderer harness still emits non-failing React `act(...)`
  warnings.
- `bunx tsc --noEmit` passed.
- `./script/dev/run.sh --verify` completed design, type, renderer, native, and package checks.
  The design check reported 0 new violations; legacy debt remains 657.
- The built app ran with a fresh isolated data directory while the user's existing CodeTwo process
  remained running. With the main window minimized, the independent `C2 Dev Pet` window at
  `views://main/desktop-pet.html` exposed only `Say hello to the pet` and `Hide desktop pet`; no
  microphone or voice control appeared in the accessibility tree or rendered screenshot.
- Clicking the mascot in that real window still rendered its waving frame.
- `bun script/verify/sdlc.ts` reported `[sdlc] contract valid`; task-scoped
  `git diff --check` passed.

Verdict: verified.

### Acceptance evidence

- AC-1: PASS — the recorded real-window inspection found no microphone or pet voice-input control. Evidence: `Verification record above`.
- AC-2: PASS — focused host-contract inspection confirmed the pet-only voice state and RPC path were removed. Evidence: `Verification record above`.
- AC-3: PASS — `bun test tests/pluginComponentPolicyContract.test.ts` retained composer voice policy wiring.
- AC-4: PASS — `bun test tests/petSettings.test.tsx tests/pluginComponentPolicyContract.test.ts` retained greeting, animation, drag, and hide behavior.
- AC-5: PASS — focused tests, `bunx tsc --noEmit`, `./script/dev/run.sh --verify`, `bun script/verify/sdlc.ts`, real-window inspection, and `git diff --check` passed.

Residual risk: validation used an isolated development build; no versioned product release or
public distribution was requested or observed.

## Behavioral evidence

- Before implementation, `bun test tests/pluginComponentPolicyContract.test.ts` produced 2 passes
  and 1 failure because the app still projected `voiceEnabled` into both the composer and desktop
  pet. After implementation,
  `bun test tests/petSettings.test.tsx tests/pluginComponentPolicyContract.test.ts` produced 9
  passes and 0 failures. The existing renderer harness still emits non-failing React `act(...)`
  warnings.
- `bunx tsc --noEmit` passed.
- `./script/dev/run.sh --verify` completed design, type, renderer, native, and package checks.
  The design check reported 0 new violations; legacy debt remains 657.
- The built app ran with a fresh isolated data directory while the user's existing CodeTwo process
  remained running. With the main window minimized, the independent `C2 Dev Pet` window at
  `views://main/desktop-pet.html` exposed only `Say hello to the pet` and `Hide desktop pet`; no
  microphone or voice control appeared in the accessibility tree or rendered screenshot.
- Clicking the mascot in that real window still rendered its waving frame.
- `bun script/verify/sdlc.ts` reported `[sdlc] contract valid`; task-scoped
  `git diff --check` passed.

Verdict: verified.

### Acceptance evidence

- AC-1: PASS — the recorded real-window inspection found no microphone or pet voice-input control. Evidence: `Verification record above`.
- AC-2: PASS — focused host-contract inspection confirmed the pet-only voice state and RPC path were removed. Evidence: `Verification record above`.
- AC-3: PASS — `bun test tests/pluginComponentPolicyContract.test.ts` retained composer voice policy wiring.
- AC-4: PASS — `bun test tests/petSettings.test.tsx tests/pluginComponentPolicyContract.test.ts` retained greeting, animation, drag, and hide behavior.
- AC-5: PASS — focused tests, `bunx tsc --noEmit`, `./script/dev/run.sh --verify`, `bun script/verify/sdlc.ts`, real-window inspection, and `git diff --check` passed.

Residual risk: validation used an isolated development build; no versioned product release or
public distribution was requested or observed.

## Visual evidence

See bundle evidence/ when present.

## Security and privacy evidence

Not separately recorded unless present in legacy Verification.

## Deviations and residual risk

Residual risk: validation used an isolated development build; no versioned product release or

## Verdict

Verdict: verified..

## Review and release

The user explicitly authorized creating and merging the repository pull request on 2026-08-30.
[PR #181](https://github.com/IchenDEV/codeTwo/pull/181) carries the implementation; repository
integration remains pending until its checks pass and the merge is observed.

## Feedback

The pet now presents only interactions it can fulfill. Composer voice input remains outside this
change.
