---
id: "2026-08-30-quiet-session-rail-items"
stage: spec
schema: 3
status: accepted
owner: codex
created: 2026-08-30
based_on: intent.md
risk: low
approved_by: "userthe 2026-08-30 sidebar requests and explicit PR merge authorization"
approved_at: "2026-08-30"
---

# Spec: Quiet the session rail items

## Requirements

Each session row uses the existing source-list selection treatment and a conditional content stack:
title first, a useful latest-conversation preview second, and project/workspace identity last. The
middle line is omitted only when it has no meaningful text or merely repeats the title. Routine
completed state, provider branding, age, and action buttons do not compete in the resting visual
state. Running, awaiting-input, and failed states remain visible as compact semantic indicators.
Row actions remain available on pointer hover, keyboard focus, and the existing context menu.

## User experience

Not separately recorded in legacy change.md.

## Technical design

See Requirements and legacy Git history.

## Security and privacy

See migrated Decision and gates.

## Alternatives and non-goals

Not separately recorded in legacy change.md.

## Areas of concern

Intent and design acceptance come directly from the user's 2026-08-30 request and supplied
reference. The change is limited to the session item hierarchy and its focused regression tests.
No PR, merge, publication, or release permission is implied.

## Acceptance criteria

- [x] AC-1: Rows with a useful latest conversation show three ordered lines: title, preview, workspace.
- [x] AC-2: Rows without a useful preview collapse to two ordered lines: title and workspace.
- [x] AC-3: Completed text, provider branding, age, and persistent action chrome are absent from the
      resting visual hierarchy.
- [x] AC-4: Running, awaiting-input, and failed sessions retain a compact, accessible state indicator;
      completed sessions stay visually quiet.
- [x] AC-5: Rename, pin, archive/restore, selection, arrow-key navigation, and keyboard/native context
      menus preserve their behavior and accessible names.
- [x] AC-6: Hover, focus, popup-open, and selected surfaces use the existing neutral source-list tokens in
      light, dark, and constrained rail widths without clipping.
- [x] AC-7: Focused rendered tests, the design-system check, SDLC check, and real renderer inspection pass.

## Decision

Intent and design acceptance come directly from the user's 2026-08-30 request and supplied
reference. The change is limited to the session item hierarchy and its focused regression tests.
No PR, merge, publication, or release permission is implied.
