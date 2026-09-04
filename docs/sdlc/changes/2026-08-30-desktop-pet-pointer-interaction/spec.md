---
id: "2026-08-30-desktop-pet-pointer-interaction"
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

# Spec: Restore desktop pet pointer interaction

## Requirements

Keep the existing single floating companion and active-task state projection. Make its native
desktop window accept pointer input so the mascot greeting and controls can receive events. Do not
add a second lifecycle or change pet selection and task-state semantics.

## User experience

Not separately recorded in legacy change.md.

## Technical design

See Requirements and legacy Git history.

## Security and privacy

See migrated Decision and gates.

## Alternatives and non-goals

Not separately recorded in legacy change.md.

## Areas of concern

Intent and observable acceptance come directly from the user's 2026-08-30 report. No permission to
create a PR, merge, publish, or release is implied.

## Acceptance criteria

- [x] AC-1: The pet remains in its dedicated desktop window rather than the conversation transcript.
- [x] AC-2: The native pet surface accepts pointer input instead of passing it through to windows below.
- [x] AC-3: Clicking the mascot visibly switches it to the waving animation.
- [x] AC-4: Existing voice, hide, selection, size, and active-task animation paths remain wired.
- [x] AC-5: Focused interaction, host-contract, type, SDLC, and real-window checks pass.

## Decision

Intent and observable acceptance come directly from the user's 2026-08-30 report. No permission to
create a PR, merge, publish, or release is implied.
