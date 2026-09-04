---
id: "2026-08-31-codex-appearance-controls"
stage: plan
schema: 3
status: accepted
owner: codex
created: 2026-08-31
based_on: spec.md
risk: medium
scope: apps/desktop/src/appearance.ts, apps/desktop/src/theme.tsx, apps/desktop/src/settings, apps/desktop/src/i18n/strings.ts, apps/desktop/src/styles.css, apps/desktop/src/design, apps/desktop/src/canvas/styles.css, apps/desktop/src/git, apps/desktop/src/files/FileViewer.tsx, apps/desktop/tests/appearanceSettings.test.tsx, apps/desktop/tests/gitState.test.ts, apps/desktop/tests/githubPullRequestPanelRendered.test.tsx, apps/desktop/tests/settingsLayoutContract.test.ts, docs/sdlc/changes/2026-08-31-codex-appearance-controls
approved_by: "[user]"
approved_at: "2026-08-31"
---

# Plan: Complete the Codex-aligned Appearance controls

## Files and ownership

apps/desktop/src/appearance.ts, apps/desktop/src/theme.tsx, apps/desktop/src/settings, apps/desktop/src/i18n/strings.ts, apps/desktop/src/styles.css, apps/desktop/src/design, apps/desktop/src/canvas/styles.css, apps/desktop/src/git, apps/desktop/src/files/FileViewer.tsx, apps/desktop/tests/appearanceSettings.test.tsx, apps/desktop/tests/gitState.test.ts, apps/desktop/tests/githubPullRequestPanelRendered.test.tsx, apps/desktop/tests/settingsLayoutContract.test.ts, docs/sdlc/changes/2026-08-31-codex-appearance-controls

## Order of work

1. Add a version-3 appearance profile model and deterministic migration from existing settings.
2. Apply the resolved light/dark profile, pointer, motion, font-weight, and diff-marker state at the
   document root.
3. Extend the Appearance page with scheme-specific groups and Codex preference controls using the
   current C2 component system and translations.
4. Update diff rendering and reduced-motion selectors to honor explicit user preferences.
5. Add migration/interaction/rendering coverage, run repository Gates, and capture rendered light,
   dark, and narrow evidence.

Rollback is a source revert; persisted version-3 data is additive and old builds ignore the new
fields while retaining the existing storage key. No network, provider, database, or release change
is involved.

## Test-first proof

See legacy Verification section.

## Visual or integration proof

See legacy Verification section.

## Risks and mitigations

See legacy Decision and gates.

## Rollback

See legacy Review and release.

## Deviations

Appearance persistence now uses version 3. Each light/dark profile owns its interface and code font
family and weight, panel opacity, and contrast, while sizes remain shared. Version-1/2 values are
copied into both profiles during migration, so the active appearance does not change unexpectedly.
The resolved profile is applied to the document and Monaco editor.

The Appearance page now exposes the two typography and surface profiles, pointer-cursor, System /
On / Off reduced-motion, and Color / +/- diff-marker controls with English and Chinese labels.
Local Git and GitHub PR diff lines share an accessible marker/content presentation. Explicit motion
preferences override the system media query without changing drag, resize, text, or disabled
cursors. No dependency, provider, database, network, or theme-document format changed.

## Decision

The user directly approved Intent and implementation through the current request. Codex owns the
implementation and verification. Dock-icon artwork/design, merge, release, deployment, production,
and external messaging remain separate human Gates and are not authorized here.

Apple HIG Settings, Accessibility, Color, Typography, Sliders, Toggles, and Motion guidance informs
the native control semantics: settings stay comprehensible, controls have visible labels and focus,
system preferences remain available, and color is not the only diff cue in the +/- mode.
