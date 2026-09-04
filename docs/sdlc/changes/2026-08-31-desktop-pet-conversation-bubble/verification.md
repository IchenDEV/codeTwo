---
id: "2026-08-31-desktop-pet-conversation-bubble"
stage: verification
schema: 3
status: pending
owner: codex
created: 2026-08-31
based_on: plan.md
commit: ""
verification_mode: owner
verified_by: ""
verified_at: ""
release_target: none
release_identity: "not applicable until released."
---

# Verification: Simplify the desktop pet and surface active conversation

## Automated checks

Verdict: partial. The scoped implementation, renderer, contracts, and rendered states pass; the
native menu presentation and action remain unobserved in a real Electrobun window because another
live Core currently owns the default data directory.

### Acceptance evidence

- AC-1: PASS — focused renderer coverage confirms the controls are absent; browser inspection found
  a transparent hover background, one remaining mascot button, and a working waving transition.
- AC-2: PASS — projection coverage exercises active, awaiting-input, idle, completed, empty,
  whitespace-normalized, and Unicode-truncated responses; browser inspection confirmed bubble and
  no-bubble states.
- AC-3: PARTIAL — focused model and host-contract coverage confirms the native request, action
  dispatch, Close callback, and hide path. Real native menu presentation and selection were not
  exercised because process `31634` from another worktree owns
  `~/Library/Application Support/dev.codetwo.app.dev`; the launch contract forbids replacing it.
- AC-4: PASS — browser inspection covered small, medium, and large pets with a three-line response
  in light and dark appearance without overflow or opaque window chrome.
- AC-5: PASS — the four focused files pass 17 tests with 99 expectations; `tsc --noEmit`, code lint,
  style lint, production renderer build, docs verification, both SDLC verification modes, and
  `git diff --check` pass. The full native package command reaches and passes those renderer gates,
  then fails in the unchanged `libghostty-vt-sys` pre-build with Zig 0.15.2's known
  `use of undeclared identifier 'INFINITY'` error under both Command Line Tools and Xcode-beta SDKs.

Failed iterations: the first focused run found missing worktree dependencies and an undefined
test-fixture binding; installing the frozen lockfile dependencies and correcting the binding made
the suite pass. The first exact-height visual fixture let the bubble overlap the native drag handle;
the host now reserves 64 pixels above the mascot and the three supported sizes were rechecked.

Residual risk: the native Electrobun context menu, Close selection, and bottom-anchored live resize
still need one isolated real-window pass after the current Core owner exits. The repository's known
Ghostty/Zig build failure also prevents using a newly packaged app as that validation vehicle in
this checkout.

## Behavioral evidence

Verdict: partial. The scoped implementation, renderer, contracts, and rendered states pass; the
native menu presentation and action remain unobserved in a real Electrobun window because another
live Core currently owns the default data directory.

### Acceptance evidence

- AC-1: PASS — focused renderer coverage confirms the controls are absent; browser inspection found
  a transparent hover background, one remaining mascot button, and a working waving transition.
- AC-2: PASS — projection coverage exercises active, awaiting-input, idle, completed, empty,
  whitespace-normalized, and Unicode-truncated responses; browser inspection confirmed bubble and
  no-bubble states.
- AC-3: PARTIAL — focused model and host-contract coverage confirms the native request, action
  dispatch, Close callback, and hide path. Real native menu presentation and selection were not
  exercised because process `31634` from another worktree owns
  `~/Library/Application Support/dev.codetwo.app.dev`; the launch contract forbids replacing it.
- AC-4: PASS — browser inspection covered small, medium, and large pets with a three-line response
  in light and dark appearance without overflow or opaque window chrome.
- AC-5: PASS — the four focused files pass 17 tests with 99 expectations; `tsc --noEmit`, code lint,
  style lint, production renderer build, docs verification, both SDLC verification modes, and
  `git diff --check` pass. The full native package command reaches and passes those renderer gates,
  then fails in the unchanged `libghostty-vt-sys` pre-build with Zig 0.15.2's known
  `use of undeclared identifier 'INFINITY'` error under both Command Line Tools and Xcode-beta SDKs.

Failed iterations: the first focused run found missing worktree dependencies and an undefined
test-fixture binding; installing the frozen lockfile dependencies and correcting the binding made
the suite pass. The first exact-height visual fixture let the bubble overlap the native drag handle;
the host now reserves 64 pixels above the mascot and the three supported sizes were rechecked.

Residual risk: the native Electrobun context menu, Close selection, and bottom-anchored live resize
still need one isolated real-window pass after the current Core owner exits. The repository's known
Ghostty/Zig build failure also prevents using a newly packaged app as that validation vehicle in
this checkout.

## Visual evidence

See bundle evidence/ when present.

## Security and privacy evidence

Not separately recorded unless present in legacy Verification.

## Deviations and residual risk

Residual risk: the native Electrobun context menu, Close selection, and bottom-anchored live resize

## Verdict

Verdict: partial. The scoped implementation, renderer, contracts, and rendered states pass; the.

## Review and release

Approval: the user approved [PR #190](https://github.com/IchenDEV/codeTwo/pull/190) creation and merge through the direct `pr & merge`
instruction on 2026-08-31, with the recorded native-window evidence gap retained as residual risk.
Release target: none.
Release identity: not applicable until released.
Smoke evidence: not applicable until released.
Rollback: revert the scoped renderer, RPC state, native menu wiring, tests, and this Artifact.
No release: repository PR creation and merge are authorized; no package, tag, publication,
deployment, or versioned product release was requested.

## Feedback

No post-change feedback exists yet.
