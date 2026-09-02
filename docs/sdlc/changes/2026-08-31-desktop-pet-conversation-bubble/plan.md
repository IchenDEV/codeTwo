---
id: "2026-08-31-desktop-pet-conversation-bubble"
stage: plan
schema: 3
status: accepted
owner: codex
created: 2026-08-31
based_on: spec.md
risk: medium
scope: apps/desktop/src/App.tsx, apps/desktop/src/container.ts, apps/desktop/src/electrobun, apps/desktop/src/i18n/strings.ts, apps/desktop/src/pet, apps/desktop/tests
approved_by: "[user]"
approved_at: "2026-08-31"
---

# Plan: Simplify the desktop pet and surface active conversation

## Files and ownership

apps/desktop/src/App.tsx, apps/desktop/src/container.ts, apps/desktop/src/electrobun, apps/desktop/src/i18n/strings.ts, apps/desktop/src/pet, apps/desktop/tests

## Order of work

1. Add a pure bounded projection from active assistant text to a pet-bubble string, and carry it
   through the existing desktop-pet state without introducing another session lifecycle.
2. Render the bubble above the mascot, delete the persistent hide control and hover fill, and reuse
   the existing native context-menu bridge for a localized Close command.
3. Protect the projection, rendered states, greeting, and native host wiring with focused tests,
   then inspect the real renderer in light/dark and active/idle states before lifecycle handoff.

Rollback removes the bubble field/projection, restores the prior pet component and window menu
wiring, and restores the prior CSS. It does not migrate or rewrite stored user data.

## Test-first proof

See legacy Verification section.

## Visual or integration proof

See legacy Verification section.

## Risks and mitigations

See legacy Decision and gates.

## Rollback

See legacy Review and release.

## Deviations

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

## Decision

The user's direct screenshot-backed request accepts Intent, the visible-design direction, and
implementation. Apple HIG context-menu guidance supports moving the item-specific Close command out
of persistent chrome and into a native secondary-click menu. CodeTwo's existing design tokens,
session activity projection, and context-menu bridge remain authoritative. The later direct
`pr & merge` instruction accepts the repository Review Gate and authorizes PR creation plus merge
after required checks pass. No separate security, data, release, deployment, or production Gate is
approved.
