---
id: "2026-08-31-fix-dock-tab-indicator-alignment"
stage: plan
schema: 3
status: accepted
owner: codex
created: 2026-08-31
based_on: spec.md
risk: medium
scope: apps/desktop/src/components/ui/tabs.tsx, apps/desktop/tests/tabsToolbarRendered.test.tsx, apps/desktop/tests/windowChromeContract.test.ts, docs/sdlc/changes/2026-08-31-fix-dock-tab-indicator-alignment.md, docs/sdlc/changes/2026-08-31-fix-dock-tab-indicator-alignment
approved_by: "[user]"
approved_at: "2026-08-31"
---

# Plan: Align the selected Dock tab background

## Files and ownership

apps/desktop/src/components/ui/tabs.tsx, apps/desktop/tests/tabsToolbarRendered.test.tsx, apps/desktop/tests/windowChromeContract.test.ts, docs/sdlc/changes/2026-08-31-fix-dock-tab-indicator-alignment.md, docs/sdlc/changes/2026-08-31-fix-dock-tab-indicator-alignment

## Order of work

1. Add rendered coverage proving toolbar Tabs omit the liquid layer and expose a selected trigger
   background.
2. Scope liquid measurement and rendering away from the toolbar variant.
3. Re-run browser geometry checks across switching, appearance, and constrained width, followed by
   focused tests, the renderer build, documentation, lifecycle, and diff checks.

## Test-first proof

See legacy Verification section.

## Visual or integration proof

See legacy Verification section.

## Risks and mitigations

See legacy Decision and gates.

## Rollback

See legacy Review and release.

## Deviations

The shared Tabs component disables liquid measurement, observers, and rendering only for the
compact toolbar variant. Toolbar triggers own their semantic secondary selected background and
hover state, so the painted shape cannot leave the trigger's coordinate system. Default and line
Tabs retain liquid indicators. A focused rendered regression mounts Tabs with ResizeObserver
available and proves a selected toolbar does not mount the liquid host.

The implementation was rebased onto `origin/main` at `a224a752`. The Tabs conflict preserved the
latest semantic radius from main and retained the trigger-owned toolbar correction.

## Decision

The user's screenshot-backed implementation request accepted Intent and visible design. After the
final toolbar screenshot was shown, the user explicitly requested a PR on 2026-08-31. PR creation
is authorized; merge, release, deployment, and production mutation remain separate pending Gates.

The diagnosis measured a 28px selected trigger at top 6px while the liquid indicator rendered at top
20px inside a 0x0 wrapper after the library overwrote absolute positioning. This evidence selected a
static toolbar background while preserving animation for variants designed to contain it.
