---
id: change-2026-08-30-desktop-pet-remove-voice-control
kind: change
status: verified
owner: codex
approvers: "#decision-and-gates"
created: 2026-08-30
updated: 2026-08-30
source: "#intent"
inputs: "#spec"
outputs: "#build"
next_trigger: pull request checks and repository merge
---

# Remove the desktop pet voice control

## Intent

The user reported on 2026-08-30 that the microphone below the floating desktop pet is unnecessary
and misleading because it cannot provide the streaming voice experience implied by the control.
Remove that entry point instead of presenting an incomplete interaction.

## Spec

Keep composer voice input unchanged. Remove the microphone from the independent desktop pet and
delete only the pet-specific voice props, state, event, and RPC path that become unreachable. Keep
the mascot greeting, activity animation, drag handle, and hide control intact.

### Acceptance criteria

- [x] The independent desktop pet renders no microphone or voice-input control.
- [x] Pet state and native RPC no longer carry a pet-only voice path.
- [x] Composer voice input remains wired to its existing component-policy gate.
- [x] Greeting, activity animation, drag handle, and hide control remain intact.
- [x] Focused interaction, host-contract, type, SDLC, diff, and real-window checks pass.

## Decision and gates

Intent and acceptance come directly from the user's 2026-08-30 follow-up. No permission to create
a PR, merge, publish, or release is implied.

## Plan

Lock the absence of the pet voice bridge into the existing component-policy contract, remove the
now-unused pet-specific plumbing from renderer through native RPC, then verify the focused tests
and built desktop pet window. Rollback is the inverse source change.

## Build

`CodeTwoPet` now owns only its mascot greeting and hide control. The desktop pet bridge and native
RPC state no longer carry voice enablement or voice text, while the composer continues to use the
existing `voice.composer` policy gate and `VoiceButton`.

## Verification

- Before implementation, `bun test tests/pluginComponentPolicyContract.test.ts` produced 2 passes
  and 1 failure because the app still projected `voiceEnabled` into both the composer and desktop
  pet. After implementation,
  `bun test tests/petSettings.test.tsx tests/pluginComponentPolicyContract.test.ts` produced 9
  passes and 0 failures. The existing renderer harness still emits non-failing React `act(...)`
  warnings.
- `bunx tsc --noEmit` passed.
- `./script/build_and_run.sh --verify` completed design, type, renderer, native, and package checks.
  The design check reported 0 new violations; legacy debt remains 657.
- The built app ran with a fresh isolated data directory while the user's existing CodeTwo process
  remained running. With the main window minimized, the independent `C2 Dev Pet` window at
  `views://main/desktop-pet.html` exposed only `Say hello to the pet` and `Hide desktop pet`; no
  microphone or voice control appeared in the accessibility tree or rendered screenshot.
- Clicking the mascot in that real window still rendered its waving frame.
- `bun script/check-sdlc.ts` reported `[sdlc] contract valid`; task-scoped
  `git diff --check` passed.

Verdict: verified.

Residual risk: validation used an isolated development build; no versioned product release or
public distribution was requested or observed.

## Review and release

The user explicitly authorized creating and merging the repository pull request on 2026-08-30.
[PR #181](https://github.com/IchenDEV/codeTwo/pull/181) carries the implementation; repository
integration remains pending until its checks pass and the merge is observed.

## Feedback

The pet now presents only interactions it can fulfill. Composer voice input remains outside this
change.
