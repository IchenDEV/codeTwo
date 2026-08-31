---
id: change-2026-08-31-codex-appearance-controls
kind: change
schema: 2
status: verified
risk: medium
owner: codex
approvers: [user]
approved_at: 2026-08-31
created: 2026-08-31
updated: 2026-08-31
source: direct user request in the current task on 2026-08-31 after a screenshot comparison — “补齐codex功能”
inputs: the supplied Codex Appearance screenshot, the current C2 Appearance page, and the existing appearance persistence contract
outputs: scheme-specific theme controls plus persisted cursor, motion, and diff-marker preferences with rendered verification
scope: apps/desktop/src/appearance.ts, apps/desktop/src/theme.tsx, apps/desktop/src/settings, apps/desktop/src/i18n/strings.ts, apps/desktop/src/styles.css, apps/desktop/src/design, apps/desktop/src/canvas/styles.css, apps/desktop/src/git, apps/desktop/src/files/FileViewer.tsx, apps/desktop/tests/appearanceSettings.test.tsx, apps/desktop/tests/gitState.test.ts, apps/desktop/tests/githubPullRequestPanelRendered.test.tsx, apps/desktop/tests/settingsLayoutContract.test.ts, docs/sdlc/changes/2026-08-31-codex-appearance-controls
next_trigger: human review and feedback
verification_mode: owner
verified_by: codex
verified_at: 2026-08-31
---

# Complete the Codex-aligned Appearance controls

## Intent

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

## Spec

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

### Acceptance criteria

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

## Decision and gates

The user directly approved Intent and implementation through the current request. Codex owns the
implementation and verification. Dock-icon artwork/design, merge, release, deployment, production,
and external messaging remain separate human Gates and are not authorized here.

Apple HIG Settings, Accessibility, Color, Typography, Sliders, Toggles, and Motion guidance informs
the native control semantics: settings stay comprehensible, controls have visible labels and focus,
system preferences remain available, and color is not the only diff cue in the +/- mode.

## Plan

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

## Build

Appearance persistence now uses version 3. Each light/dark profile owns its interface and code font
family and weight, panel opacity, and contrast, while sizes remain shared. Version-1/2 values are
copied into both profiles during migration, so the active appearance does not change unexpectedly.
The resolved profile is applied to the document and Monaco editor.

The Appearance page now exposes the two typography and surface profiles, pointer-cursor, System /
On / Off reduced-motion, and Color / +/- diff-marker controls with English and Chinese labels.
Local Git and GitHub PR diff lines share an accessible marker/content presentation. Explicit motion
preferences override the system media query without changing drag, resize, text, or disabled
cursors. No dependency, provider, database, network, or theme-document format changed.

## Verification

Verdict: verified.

Browser inspection used the in-app Browser against the renderer at `http://localhost:1421/`.
Appearance rendered correctly in light and dark modes and at a narrow 820x900 viewport, with no
horizontal overflow, framework overlay, or console warning/error. Real interaction showed the
active dark font weight applying as 500 while light remained 400, pointer cursor switching between
`pointer` and `default`, and explicit motion switching transition duration from `0.12s` to
`0.00001s`. Restore defaults returned pointer, motion, diff mode, weight, and opacity to their
documented values.

### Acceptance evidence

- AC-1: PASS — `cd apps/desktop && bun test tests/appearanceSettings.test.tsx` proves independent
  persistence and runtime application; rendered interaction confirmed dark weight 500 while light
  stayed 400 when switching schemes.
- AC-2: PASS — `cd apps/desktop && bun test tests/appearanceSettings.test.tsx` covers every root
  preference value; rendered interaction confirmed pointer and motion changes, while scoped CSS
  preserves text, drag, resize, and disabled cursors.
- AC-3: PASS — `cd apps/desktop && bun test tests/gitState.test.ts` and
  `bun test tests/githubPullRequestPanelRendered.test.tsx` assert separate visible markers,
  content, and added/removed accessible labels; both modes are selected from the shared root state.
- AC-4: PASS — `cd apps/desktop && bun test tests/appearanceSettings.test.tsx` covers version-1/2
  migration, defaults, persisted profiles, and existing theme data; `cd apps/desktop && bun test`
  passed 794 tests in 137 files with 3,783 expectations.
- AC-5: PASS — `bunx tsc --noEmit`, `bun run lint`, and `bun run build:renderer` passed; Browser
  light/dark/narrow inspection passed; `bun script/verify/docs.ts`, `bun script/verify/sdlc.ts`, and
  `bun script/verify/sdlc.ts --worktree` passed.

Residual risk: the preference state applies within the renderer process; a future native Dock-icon
picker still requires approved alternate artwork and a supported runtime integration. The existing
Vite large-chunk warning and React test `act(...)` notices remain pre-existing, non-failing signals.

## Review and release

Approval: pending human review of the verified Appearance page.
Release target: none.
Release identity: not applicable until released.
Smoke evidence: not applicable until released.
Rollback: revert this change's appearance model, controls, presentation styles, tests, and Artifact.
No release: no merge, release, or deployment was requested.

Preparing this section does not authorize merge, deployment, release, or production mutation.

## Feedback

No post-implementation feedback exists yet.
