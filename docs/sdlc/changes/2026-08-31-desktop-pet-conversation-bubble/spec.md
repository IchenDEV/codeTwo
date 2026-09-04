---
id: "2026-08-31-desktop-pet-conversation-bubble"
stage: spec
schema: 3
status: accepted
owner: codex
created: 2026-08-31
based_on: intent.md
risk: medium
approved_by: "[user]"
approved_at: "2026-08-31"
---

# Spec: Simplify the desktop pet and surface active conversation

## Requirements

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

## User experience

Not separately recorded in legacy change.md.

## Technical design

See Requirements and legacy Git history.

## Security and privacy

See migrated Decision and gates.

## Alternatives and non-goals

Not separately recorded in legacy change.md.

## Areas of concern

The user's direct screenshot-backed request accepts Intent, the visible-design direction, and
implementation. Apple HIG context-menu guidance supports moving the item-specific Close command out
of persistent chrome and into a native secondary-click menu. CodeTwo's existing design tokens,
session activity projection, and context-menu bridge remain authoritative. The later direct
`pr & merge` instruction accepts the repository Review Gate and authorizes PR creation plus merge
after required checks pass. No separate security, data, release, deployment, or production Gate is
approved.

## Acceptance criteria

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

## Decision

The user's direct screenshot-backed request accepts Intent, the visible-design direction, and
implementation. Apple HIG context-menu guidance supports moving the item-specific Close command out
of persistent chrome and into a native secondary-click menu. CodeTwo's existing design tokens,
session activity projection, and context-menu bridge remain authoritative. The later direct
`pr & merge` instruction accepts the repository Review Gate and authorizes PR creation plus merge
after required checks pass. No separate security, data, release, deployment, or production Gate is
approved.
