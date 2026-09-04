---
id: "2026-08-31-codex-appearance-controls"
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

# Spec: Complete the Codex-aligned Appearance controls

## Requirements

- Appearance persistence advances to schema version 3. Version-2 global font, opacity, and contrast
  values migrate into both light and dark scheme profiles without changing the rendered result.
- Light and dark scheme profiles independently own interface font and weight, code font and weight,
  panel opacity, and contrast. The active resolved scheme selects the applied profile.
- Interface and code font sizes remain global preferences, matching the supplied Codex behavior.
- “Use pointer cursors” changes pointer styling for interactive controls without affecting resize,
  drag, text-edit, or disabled cursors.
- “Reduce motion” supports System, On, and Off. System follows macOS, On suppresses decorative
  transitions regardless of macOS, and Off preserves motion even when macOS requests reduction.
- “Diff markers” supports Color and +/-. Color uses semantic add/delete color treatment without
  redundant prefix glyphs; +/- uses explicit prefix glyphs without relying on color.
- Controls use the existing C2 setting rows, switches, select menus, range controls, focus styles,
  responsive grouping, and bilingual strings. No new runtime dependency is added.
- Existing theme JSON format, theme library, pet settings, color scheme selection, and Restore
  defaults remain backward compatible.

## User experience

Not separately recorded in legacy change.md.

## Technical design

See Requirements and legacy Git history.

## Security and privacy

See migrated Decision and gates.

## Alternatives and non-goals

Not separately recorded in legacy change.md.

## Areas of concern

The user directly approved Intent and implementation through the current request. Codex owns the
implementation and verification. Dock-icon artwork/design, merge, release, deployment, production,
and external messaging remain separate human Gates and are not authorized here.

Apple HIG Settings, Accessibility, Color, Typography, Sliders, Toggles, and Motion guidance informs
the native control semantics: settings stay comprehensible, controls have visible labels and focus,
system preferences remain available, and color is not the only diff cue in the +/- mode.

## Acceptance criteria

- [x] AC-1: Light and dark font family/weight, panel opacity, and contrast values can be changed
  independently, persist, and apply when the resolved scheme changes.
- [x] AC-2: Pointer-cursor and reduced-motion controls visibly change interactive cursor and motion
  behavior for all three supported preference states without breaking drag/resize affordances.
- [x] AC-3: Diff-marker controls switch both local Git and GitHub PR previews between color-only and
  explicit +/- presentations, with neither mode relying only on an inaccessible hidden state.
- [x] AC-4: Version-1/2 appearance data migrates to version 3 without losing current theme, pet,
  font-size, font-family, panel-opacity, or contrast choices; theme import/export remains valid.
- [x] AC-5: Targeted tests, renderer lint/type/build, repository lifecycle checks, and rendered
  light, dark, and narrow Appearance-page inspection pass.

## Decision

The user directly approved Intent and implementation through the current request. Codex owns the
implementation and verification. Dock-icon artwork/design, merge, release, deployment, production,
and external messaging remain separate human Gates and are not authorized here.

Apple HIG Settings, Accessibility, Color, Typography, Sliders, Toggles, and Motion guidance informs
the native control semantics: settings stay comprehensible, controls have visible labels and focus,
system preferences remain available, and color is not the only diff cue in the +/- mode.
