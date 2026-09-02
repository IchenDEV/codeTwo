---
id: "2026-08-30-desktop-pet-remove-voice-control"
stage: spec
schema: 3
status: accepted
owner: codex
created: 2026-08-30
based_on: intent.md
risk: low
approved_by: "#decision-and-gates"
approved_at: "2026-08-30"
---

# Spec: Remove the desktop pet voice control

## Requirements

Keep composer voice input unchanged. Remove the microphone from the independent desktop pet and
delete only the pet-specific voice props, state, event, and RPC path that become unreachable. Keep
the mascot greeting, activity animation, drag handle, and hide control intact.

## User experience

Not separately recorded in legacy change.md.

## Technical design

See Requirements and legacy Git history.

## Security and privacy

See migrated Decision and gates.

## Alternatives and non-goals

Not separately recorded in legacy change.md.

## Areas of concern

Intent and acceptance come directly from the user's 2026-08-30 follow-up. No permission to create
a PR, merge, publish, or release is implied.

## Acceptance criteria

- [x] AC-1: The independent desktop pet renders no microphone or voice-input control.
- [x] AC-2: Pet state and native RPC no longer carry a pet-only voice path.
- [x] AC-3: Composer voice input remains wired to its existing component-policy gate.
- [x] AC-4: Greeting, activity animation, drag handle, and hide control remain intact.
- [x] AC-5: Focused interaction, host-contract, type, SDLC, diff, and real-window checks pass.

## Decision

Intent and acceptance come directly from the user's 2026-08-30 follow-up. No permission to create
a PR, merge, publish, or release is implied.
