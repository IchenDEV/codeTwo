---
id: 2026-09-16-align-traffic-lights
schema: 5
stage: spec
status: accepted
owner: chenli
created: 2026-09-16
based_on: intent.md
---

# Spec: Align the macOS traffic lights with the rail's leading column

## Design

One literal change in the Electrobun host: both fixed native-button calls in
`apps/desktop/src/electrobun/index.ts` move from `(22, 16)` to `(16, 16)` — at `dom-ready` on darwin
and in the resize re-application. The comment states the rule: the native controls share the rail's
leading content column (`mx-2` + `px-2` = 16px) and stay vertically centered in the 46px titlebar
(`(46 - 14) / 2 = 16`).

Boundaries and why the rest is untouched:

- `hiddenInset` keeps macOS owning the button artwork, diameter, hover behavior, and the window's
  standard handling; the host still sets no `trafficLightOffset` and reads no geometry, so AppKit's
  own resize pass is corrected by the same literal.
- The clearance rules stay valid but gain slack: the group now spans 16–68px instead of 22–74px, so
  `.window-controls-safe-rail`/`-scene` (5rem) and `.window-controls-safe-main` (6rem) still clear it.
- The rail's own column is unchanged, so the search launcher, the feature rows, and the session tree
  keep their existing insets; only the native group's leading edge moves onto that column.

Failure path: if a future edit changes the rail's content inset (or reverts the literal), the contract
test below fails because it pins both call sites and the extracted values, and the rendered check in
Verification measures the shared leading edge in the launched window.

## Acceptance criteria

- [x] AC-1: The macOS window buttons use one fixed `(16, 16)` position at webview readiness and after
  resize, with no traffic-light offset, geometry read, or ResizeObserver.
- [x] AC-2: In the launched macOS window the native group's leading edge, the search launcher's
  magnifier, and the feature-row icons share one vertical inset in light and dark appearance.
- [x] AC-3: No regression: the shared 46px titlebar, the macOS clearance paddings, the window-action
  behaviors, and the desktop lint, type, and test checks stay intact.
