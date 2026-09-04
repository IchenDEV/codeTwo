---
id: "2026-08-31-codex-appearance-controls"
stage: intent
schema: 3
status: accepted
owner: codex
created: 2026-08-31
source: direct user request in the current task on 2026-08-31 after a screenshot comparison — “补齐codex功能”
risk: medium
approved_by: "[user]"
approved_at: "2026-08-31"
---

# Intent: Complete the Codex-aligned Appearance controls

## Problem

The current C2 Appearance page already offers schemes, a reusable theme library, editable light
and dark colors, global typography, panel opacity, and contrast. Compared with the supplied Codex
Appearance screenshot, C2 cannot tune font family, font weight, panel treatment, and contrast
independently for light and dark schemes, and it has no user controls for pointer cursors, reduced
motion, or diff markers.

The desired outcome is to retain C2's stronger theme-library workflow while adding those useful
Codex controls as real persisted behavior. Existing users must keep their current visual choices
after migration. A Dock-icon picker is not part of this change because the repository contains one
approved icon family and Electrobun 1.18.1 exposes only build-time application icons; inventing a
second icon or displaying a nonfunctional picker would not satisfy the request.

## Proposed outcome

The current C2 Appearance page already offers schemes, a reusable theme library, editable light

## Affected users and systems

Migrated from legacy change.md.

## Constraints

The user directly approved Intent and implementation through the current request. Codex owns the
implementation and verification. Dock-icon artwork/design, merge, release, deployment, production,
and external messaging remain separate human Gates and are not authorized here.

Apple HIG Settings, Accessibility, Color, Typography, Sliders, Toggles, and Motion guidance informs
the native control semantics: settings stay comprehensible, controls have visible labels and focus,
system preferences remain available, and color is not the only diff cue in the +/- mode.

## Out of scope

Not recorded in the legacy single-file Artifact.

## Success signals

See Spec acceptance criteria.

## Open questions

None recorded in migration.

## Decision

The user directly approved Intent and implementation through the current request. Codex owns the
implementation and verification. Dock-icon artwork/design, merge, release, deployment, production,
and external messaging remain separate human Gates and are not authorized here.

Apple HIG Settings, Accessibility, Color, Typography, Sliders, Toggles, and Motion guidance informs
the native control semantics: settings stay comprehensible, controls have visible labels and focus,
system preferences remain available, and color is not the only diff cue in the +/- mode.
