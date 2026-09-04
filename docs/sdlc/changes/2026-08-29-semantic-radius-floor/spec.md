---
id: "2026-08-29-semantic-radius-floor"
stage: spec
schema: 3
status: accepted
owner: codex
created: 2026-08-29
based_on: intent.md
risk: low
approved_by: "#decision-and-gates"
approved_at: "2026-08-29"
---

# Spec: Raise the semantic radius floor

## Requirements

Change the semantic geometry tokens rather than adding local overrides. Map both micro and control
radii to 12px, and both module and modal radii to 16px. Preserve fully round geometry for
intrinsically circular controls and preserve the 24px Composer radius.

## User experience

Not separately recorded in legacy change.md.

## Technical design

See Requirements and legacy Git history.

## Security and privacy

See migrated Decision and gates.

## Alternatives and non-goals

Not separately recorded in legacy change.md.

## Areas of concern

Intent and exact geometry are supplied directly by the user's 2026-08-29 browser annotations. No
permission to publish, merge, or release is implied.

## Acceptance criteria

- [x] AC-1: No visible semantic role resolves below 12px; verify with the token contract test.
- [x] AC-2: Add action, Run, and Scene controls resolve to 12px.
- [x] AC-3: The split Open control resolves to 12px on each exposed outer edge and keeps the joined edge
      square.
- [x] AC-4: Project health and Project checkout resolve to 16px.
- [x] AC-5: The Composer remains 24px and its editor stays inside the painted card.
- [x] AC-6: The annotated surface is checked at narrow and standard widths in light and dark appearance.
- [x] AC-7: The focused regression tests, renderer build, design-system check, and SDLC check pass.

## Decision

Intent and exact geometry are supplied directly by the user's 2026-08-29 browser annotations. No
permission to publish, merge, or release is implied.
