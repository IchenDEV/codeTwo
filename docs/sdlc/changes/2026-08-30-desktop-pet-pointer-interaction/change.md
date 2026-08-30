---
id: change-2026-08-30-desktop-pet-pointer-interaction
kind: change
schema: 2
status: verified
risk: low
owner: codex
approvers: "#decision-and-gates"
approved_at: 2026-08-30
created: 2026-08-30
updated: 2026-08-31
source: "#intent"
inputs: "#spec"
outputs: "#build"
scope: apps/desktop
next_trigger: pull request checks and repository merge
verification_mode: owner
verified_by: codex
verified_at: 2026-08-30
---

# Restore desktop pet pointer interaction

## Intent

The user reported on 2026-08-30 that the floating pet cannot be used as a real independent desktop
companion because clicking it produces no response. The desktop pet must remain outside the
conversation surface while accepting the pointer interaction already exposed by its renderer.

## Spec

Keep the existing single floating companion and active-task state projection. Make its native
desktop window accept pointer input so the mascot greeting and controls can receive events. Do not
add a second lifecycle or change pet selection and task-state semantics.

### Acceptance criteria

- [x] AC-1: The pet remains in its dedicated desktop window rather than the conversation transcript.
- [x] AC-2: The native pet surface accepts pointer input instead of passing it through to windows below.
- [x] AC-3: Clicking the mascot visibly switches it to the waving animation.
- [x] AC-4: Existing voice, hide, selection, size, and active-task animation paths remain wired.
- [x] AC-5: Focused interaction, host-contract, type, SDLC, and real-window checks pass.

## Decision and gates

Intent and observable acceptance come directly from the user's 2026-08-30 report. No permission to
create a PR, merge, publish, or release is implied.

## Plan

First lock the rendered greeting and native input configuration into focused regression checks.
Then remove the conflicting native pass-through option, run the narrow checks, and verify the
packaged desktop surface in an isolated development profile if the current launcher supports the
required profile contract. Rollback is the inverse one-line native window option change.

## Build

The desktop pet `BrowserWindow` now disables Electrobun input pass-through while preserving the
existing transparent, non-activating, always-on-top companion window. The focused renderer test
locks the click-to-wave behavior, and the host contract prevents input pass-through from being
reintroduced.

## Verification

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

## Review and release

The user explicitly authorized creating and merging the repository pull request on 2026-08-30.
[PR #181](https://github.com/IchenDEV/codeTwo/pull/181) carries the implementation; repository
integration remains pending until its checks pass and the merge is observed.

## Feedback

The repaired surface responded on the first click; no second click or main-window activation was
required. No additional pet-selection or active-task animation regression was observed in the
focused checks.
