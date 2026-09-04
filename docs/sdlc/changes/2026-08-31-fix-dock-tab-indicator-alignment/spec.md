---
id: "2026-08-31-fix-dock-tab-indicator-alignment"
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

# Spec: Align the selected Dock tab background

## Requirements

Compact toolbar Tabs use a stable, trigger-owned selected background instead of mounting the shared
liquid selection layer. Default and line Tabs keep their existing animation. The toolbar trigger's
selected background, rounded shape, text color, hover behavior, accessible tab semantics, and
keyboard behavior remain expressed through the shared component.

The fallback works without JavaScript geometry and is therefore unaffected by the liquid wrapper's
positioning, delayed measurement, Dock width animation, or reduced-motion setting. Rollback restores
the toolbar liquid layer and removes the focused regression.

## User experience

Not separately recorded in legacy change.md.

## Technical design

See Requirements and legacy Git history.

## Security and privacy

See migrated Decision and gates.

## Alternatives and non-goals

Not separately recorded in legacy change.md.

## Areas of concern

The user's screenshot-backed implementation request accepted Intent and visible design. After the
final toolbar screenshot was shown, the user explicitly requested a PR on 2026-08-31. PR creation
is authorized; merge, release, deployment, and production mutation remain separate pending Gates.

The diagnosis measured a 28px selected trigger at top 6px while the liquid indicator rendered at top
20px inside a 0x0 wrapper after the library overwrote absolute positioning. This evidence selected a
static toolbar background while preserving animation for variants designed to contain it.

## Acceptance criteria

- [x] AC-1: The Dock toolbar omits the liquid selection layer and its selected trigger owns the
      semantic secondary background.
- [x] AC-2: Selected background bounds match the selected trigger in light and dark appearance
      before and after switching tabs.
- [x] AC-3: Standard and constrained Dock widths retain correct tab semantics with no overlap or
      relevant console error.
- [x] AC-4: Focused rendered tests, renderer build, lifecycle checks, and diff hygiene pass; the
      documentation check is run and any inherited base failure is recorded.

## Decision

The user's screenshot-backed implementation request accepted Intent and visible design. After the
final toolbar screenshot was shown, the user explicitly requested a PR on 2026-08-31. PR creation
is authorized; merge, release, deployment, and production mutation remain separate pending Gates.

The diagnosis measured a 28px selected trigger at top 6px while the liquid indicator rendered at top
20px inside a 0x0 wrapper after the library overwrote absolute positioning. This evidence selected a
static toolbar background while preserving animation for variants designed to contain it.
