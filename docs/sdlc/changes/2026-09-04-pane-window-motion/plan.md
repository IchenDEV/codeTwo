---
id: "2026-09-04-pane-window-motion"
stage: plan
schema: 3
status: accepted
owner: kimi
created: "2026-09-04"
based_on: spec.md
risk: "low"
scope: apps/desktop/src/session/PaneTiles.tsx, apps/desktop/src/session/PaneDivider.tsx, apps/desktop/src/styles.css, apps/desktop/src/design/tokens.css, apps/desktop/src/appearance.ts, apps/desktop/src/settings/AppearanceSettings.tsx, apps/desktop/src/i18n/strings.ts, apps/desktop/tests/paneTiles.test.tsx, apps/desktop/tests/appearanceSettings.test.tsx, docs/design/system.md, docs/sdlc/changes/2026-09-04-pane-window-motion
approved_by: "chenli"
approved_at: 2026-09-04
---

# Plan: Pane Window Motion

## Files and ownership

- `apps/desktop/src/design/tokens.css` — `--ds-motion-pane` token, `data-window-motion` overrides,
  Reduced Motion collapse (owner: kimi)
- `apps/desktop/src/styles.css` — `.pane-geometry-motion` transition + drag suspension; comment
  sweep for the amended motion contract
- `apps/desktop/src/session/PaneTiles.tsx` / `PaneDivider.tsx` — apply the geometry class to pane
  frames and dividers
- `apps/desktop/src/appearance.ts` — `windowMotion` field, guard, normalization, root dataset
- `apps/desktop/src/settings/AppearanceSettings.tsx` — Window motion `ViewSwitcher` row
- `apps/desktop/src/i18n/strings.ts` — EN/ZH strings
- `apps/desktop/tests/paneTiles.test.tsx` / `appearanceSettings.test.tsx` — focused coverage
- `docs/design/system.md` — amended Motion contract
- `docs/sdlc/changes/2026-09-04-pane-window-motion/` — this change bundle and its evidence

## Order of work

1. Add the token and overrides in `tokens.css`; add `.pane-geometry-motion` and the drag suspension
   in `styles.css`.
2. Apply the class in `PaneTiles`/`PaneDivider`.
3. Add `windowMotion` to the appearance store, the settings UI, and the strings.
4. Amend the motion contract in `docs/design/system.md`.
5. Verify (focused tests, full suite, renderer build, rendered-browser inspection in light, dark,
   and narrow states, repository Gates) and record `verification.md`.

## Test-first proof

- `paneTiles.test.tsx`: every pane frame and divider carries `pane-geometry-motion`.
- `appearanceSettings.test.tsx`: `windowMotion` defaults to `"smooth"`, rejects invalid values,
  applies as `data-window-motion`, and persists; the settings row count grows by one.

## Visual or integration proof

Rendered-browser inspection against the Vite dev server: frame-sample pane geometry during a split
to prove interpolation, inspect computed transition timing, drive a divider pointer drag to prove
1:1 tracking, keyboard-resize to prove the glide, and switch the preference through all three
choices plus Reduced Motion. Capture light-wide, dark-wide, dark-narrow, and settings-row
screenshots into the bundle's `evidence/` directory.

## Risks and mitigations

- Layout-thrash regression on large pane counts — bounded by the small maximum pane count and
  covered by the unchanged `desktopPerformanceContract` suite.
- Drag lag — prevented by suspending the transition under the resize body classes, verified live.

## Rollback

Revert the branch; the preference is additive and its absence in stored settings normalizes to the
default.

## Deviations

The bundle was first authored as a schema-2 `change.md`; when `main` adopted the schema-3
four-stage contract (PR #220) the branch was rebased and the artifact was rewritten into these
stage files with the evidence preserved.

## Decision

The user's direct implementation request on 2026-09-04 accepts this Plan, with user `chenli` as
named approver.
