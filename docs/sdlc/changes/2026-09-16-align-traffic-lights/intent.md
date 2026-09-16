---
id: 2026-09-16-align-traffic-lights
schema: 5
stage: intent
status: accepted
owner: chenli
created: 2026-09-16
source: user
risk: low
approved_by: chenli
approved_at: 2026-09-16
approval_source: "Direct request: 请修复红绿灯按钮的对齐问题, with a screenshot marking the rail's leading content column."
next_trigger: chenli reviews the verified work.
---

# Intent: Align the macOS traffic lights with the rail's leading column

## Intent

The user's screenshot marks the sidebar's leading content column (the search launcher's magnifier and
the feature-row icons at a 16px inset) and reports that the native macOS window buttons ("traffic
lights") do not share it: the close button's leading edge measures ~22px from the window's left edge,
about 6px right of the rail's column.

The host already pins the native group with one literal position, `mainWindow.setWindowButtonPosition(22, 16)`
at webview readiness and again after resize (`apps/desktop/src/electrobun/index.ts:505,514`), with
`y = 16` centering the 14px controls in the shared 46px titlebar. The leading value is what needs the
correction: the rail's column is `mx-2` (8px) + `px-2` (8px) = 16px in `apps/desktop/src/sidebar/SessionRail.tsx`,
so the controls should use `x = 16` and keep the fixed, geometry-free contract.

Outcome: the native window buttons' leading edge, the search launcher's icon, and the feature-row
icons all start at the same 16px inset, in both appearances, with no runtime measurement and no
change to the titlebar height, the header clearances, or the window behaviors.

Constraints: keep the literal fixed-position design (no geometry reads, no ResizeObserver, no
`trafficLightOffset`), keep `y = 16`, and keep the existing macOS-only clearance paddings working.
Non-goals: re-laying out the rail's content insets, restyling the native buttons, or changing the
main pane's 6rem header clearance.

## Non-goals

No change to the rail's 16px content column, the `window-controls-safe-*` clearance paddings, the
titlebar height, or the double-click window-action behavior; those keep their existing contracts.
