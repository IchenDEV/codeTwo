---
id: "2026-09-01-floating-pr-inspector-prototype"
stage: spec
schema: 3
status: accepted
owner: codex
created: 2026-09-01
based_on: intent.md
risk: low
approved_by: "userthe 2026-09-01 request to try the PR workspace's trailing Inspector as a floating panel"
approved_at: "2026-09-01"
---

# Spec: Prototype a floating PR Inspector

## Requirements

The existing `?ui-lab=pull-requests` route accepts `variant=attached|floating|overlay` and defaults
to `floating`. Attached retains the production rail. Floating reserves its existing bounded width
but detaches it with a 12px inset, rounded surface, border, and elevation. Overlay gives the
primary region its full width and positions the Inspector above it for comparison. The production
960px Inspector collapse remains authoritative for all variants.

A development-only bottom switcher shows the current variant, cycles with buttons or left/right
arrow keys, writes selection into the URL, restores browser history, and does not intercept arrow
keys while a text field is focused. Theme and locale links preserve the selected variant.

## User experience

Not separately recorded in legacy change.md.

## Technical design

See Requirements and legacy Git history.

## Security and privacy

See migrated Decision and gates.

## Alternatives and non-goals

Not separately recorded in legacy change.md.

## Areas of concern

The user's direct request accepts this low-risk, development-only visual prototype for execution.
Codex owns implementation and owner verification. Selecting and promoting a production variant is
a later human design Gate. The prototype request alone did not authorize GitHub mutation; the
user's later `pr` request authorizes including this historical decision record in the verified
Draft PR scope, but does not authorize merge, release, deployment, or production mutation.

## Acceptance criteria

- [x] AC-1: PR Workspace defaults to a visibly detached floating Inspector while attached and
      overlay variants remain reachable through stable URL state.
- [x] AC-2: The switcher exposes accessible named controls, click and keyboard cycling, browser
      history restoration, and preserves variant state across theme and locale links.
- [x] AC-3: Desktop dark/light and narrow rendered checks show no unintended clipping, overflow,
      framework overlay, or relevant console errors; the existing compact Inspector collapse is
      unchanged.
- [x] AC-4: Focused tests, renderer checks, documentation checks, SDLC checks, and whitespace
      checks pass without adding the prototype to production application behavior.

## Decision

The user's direct request accepts this low-risk, development-only visual prototype for execution.
Codex owns implementation and owner verification. Selecting and promoting a production variant is
a later human design Gate. The prototype request alone did not authorize GitHub mutation; the
user's later `pr` request authorizes including this historical decision record in the verified
Draft PR scope, but does not authorize merge, release, deployment, or production mutation.
