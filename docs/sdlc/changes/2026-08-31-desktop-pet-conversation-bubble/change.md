---
id: change-2026-08-31-desktop-pet-conversation-bubble
kind: change
schema: 2
status: executing
risk: medium
owner: codex
approvers: [user]
approved_at: 2026-08-31
created: 2026-08-31
updated: 2026-08-31
source: user-supplied desktop-pet screenshot and direct implementation request on 2026-08-31
inputs: current pet renderer, active-session activity projection, and native context-menu bridge
outputs: PR #190 with simplified pet chrome, bounded conversation bubble, native close menu, and focused evidence
scope: apps/desktop/src/App.tsx, apps/desktop/src/container.ts, apps/desktop/src/electrobun, apps/desktop/src/i18n/strings.ts, apps/desktop/src/pet, apps/desktop/tests
next_trigger: pass pull-request checks, merge to main, then exercise the native pet menu after the existing Core owner exits
verification_mode: owner
verified_by: pending
verified_at: pending
---

# Simplify the desktop pet and surface active conversation

## Intent

The user supplied a rendered desktop-pet screenshot showing a persistent rounded selection fill and
an independent hide button below the mascot. Those controls make the companion look selected and
turn a quiet floating surface into a small toolbar. The pet should remain visually unframed, expose
current assistant conversation through a speech bubble only while a conversation is in progress,
and use the platform-native secondary-click menu for closing.

The affected users are people who keep the independent desktop pet visible while CodeTwo works.
Pet selection/settings, composer behavior, session persistence, voice input, provider execution,
and release behavior are non-goals. The direct request accepts this Intent and observable UI
direction. The user's later direct `pr & merge` instruction on 2026-08-31 authorizes repository
pull-request creation and merge after required checks pass; it does not authorize publication,
deployment, or a product release.

## Spec

The standalone mascot keeps its transparent resting and hover surface; keyboard focus remains
visible without introducing a selected fill. Remove the below-mascot hide button and its unreachable
component props/styles. While the focused conversation is loading, running, or awaiting input, show
a short plain-text projection of the current assistant response in a compact speech bubble. Collapse
whitespace, bound the payload and rendered lines, preserve user-authored language direction, and
remove the bubble when no meaningful response is actively in progress.

Secondary-clicking the standalone pet window opens CodeTwo's existing OS-hosted context-menu path.
The menu contains a localized Close command which hides the pet and synchronizes the existing
appearance preference. Left-click greeting and the existing native drag handle remain available.
The main transcript stays the canonical full response; the bubble is a glanceable projection only.

### Acceptance criteria

- [x] AC-1: The standalone pet has no persistent/hover selection fill and no below-mascot hide button,
      while keyboard focus and left-click greeting remain operable.
- [x] AC-2: A meaningful active assistant response appears as a bounded, readable speech bubble;
      idle, completed, and empty-response states render no bubble.
- [ ] AC-3: Secondary-clicking the standalone pet uses the native context menu, and choosing Close
      hides the pet and updates the existing visibility preference.
- [x] AC-4: The compact pet and bubble remain unclipped in all supported pet sizes and in light/dark
      appearance without adding persistent opaque window chrome.
- [x] AC-5: Focused behavior tests, native host contract, renderer build, lifecycle checks, diff check,
      and rendered interaction inspection pass.

## Decision and gates

The user's direct screenshot-backed request accepts Intent, the visible-design direction, and
implementation. Apple HIG context-menu guidance supports moving the item-specific Close command out
of persistent chrome and into a native secondary-click menu. CodeTwo's existing design tokens,
session activity projection, and context-menu bridge remain authoritative. The later direct
`pr & merge` instruction accepts the repository Review Gate and authorizes PR creation plus merge
after required checks pass. No separate security, data, release, deployment, or production Gate is
approved.

## Plan

1. Add a pure bounded projection from active assistant text to a pet-bubble string, and carry it
   through the existing desktop-pet state without introducing another session lifecycle.
2. Render the bubble above the mascot, delete the persistent hide control and hover fill, and reuse
   the existing native context-menu bridge for a localized Close command.
3. Protect the projection, rendered states, greeting, and native host wiring with focused tests,
   then inspect the real renderer in light/dark and active/idle states before lifecycle handoff.

Rollback removes the bubble field/projection, restores the prior pet component and window menu
wiring, and restores the prior CSS. It does not migrate or rewrite stored user data.

## Build

The renderer now projects active assistant text through a pure, Unicode-safe 160-character helper,
and carries the result through the existing desktop-pet RPC state. The pet surface renders that
projection as an optional three-line bubble, deletes the persistent hide button and hover fill, and
keeps the left-click greeting plus keyboard focus ring. Bubble transitions resize the native pet
window upward while preserving its bottom anchor and normalized persisted position.

Secondary click now uses the existing OS-hosted context-menu request model from the pet renderer.
The localized Close action calls the existing pet-hide request, which preserves the established
appearance-preference synchronization. Streaming state updates are coalesced to one RPC update per
160 milliseconds so token arrival does not resize or message the native window on every delta.
The repository review handoff is [PR #190](https://github.com/IchenDEV/codeTwo/pull/190).

## Verification

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
