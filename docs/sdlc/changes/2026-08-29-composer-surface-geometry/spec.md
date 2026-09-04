---
id: "2026-08-29-composer-surface-geometry"
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

# Spec: Keep the composer surface aligned with its editor

## Requirements

The compact composer must use the existing semantic composer radius and paint its background,
shadow, and focus ring on the same DOM card that contains the editor and controls. Expanding or
collapsing the document must not leave a decorative silhouette behind. The expanded document
continues to use the workspace surface without card chrome.

## User experience

Not separately recorded in legacy change.md.

## Technical design

See Requirements and legacy Git history.

## Security and privacy

See migrated Decision and gates.

## Alternatives and non-goals

Not separately recorded in legacy change.md.

## Areas of concern

Intent and UX acceptance are supplied directly by the user's 2026-08-29 screenshot and follow-up
message. No permission to publish, merge, or release is implied.

## Acceptance criteria

- [x] AC-1: In compact mode, typed text, controls, background, and focus treatment remain inside the same
      card at the default and a tall-content state; verify with rendered bounding boxes and screenshots.
- [x] AC-2: The compact card keeps the semantic 24px composer radius instead of scaling the radius with
      height; verify from computed style at desktop and narrow widths.
- [x] AC-3: Expanding and collapsing preserves the draft and does not leave a stale surface; verify by
      typing, toggling both ways, and reading the draft after each transition.
- [x] AC-4: The focused regression test, renderer build, SDLC check, and relevant console check pass.

## Decision

Intent and UX acceptance are supplied directly by the user's 2026-08-29 screenshot and follow-up
message. No permission to publish, merge, or release is implied.
