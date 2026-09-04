---
id: "2026-08-31-macos-titlebar-window-behavior"
stage: spec
schema: 3
status: accepted
owner: codex
created: 2026-08-31
based_on: intent.md
risk: medium
approved_by: "[chenli]"
approved_at: "2026-08-31"
---

# Spec: Preserve native macOS titlebar window behavior

## Requirements

A primary-button double-click in a main-window drag region, excluding nested no-drag controls,
asks AppKit to perform the current system action. Supported actions are Minimize, Zoom (stored as
Maximize), Fill, and None. Fill uses the active screen's visible frame and restores the preceding
frame on a second invocation. A missing modern preference preserves the historical Zoom fallback;
the legacy minimize preference remains respected. Unknown future values fail closed.

The renderer-to-host request carries no geometry or preference value. The native helper owns the
preference lookup and window mutation. The traffic lights use the literal native position
`(28, 21)` at webview readiness. Because AppKit can reset standard-button frames during a native
resize layout pass, the host reapplies that same literal after resize without reading or computing
titlebar geometry.

Rollback removes the renderer listener, typed RPC, native action helper, resize reapplication, and
focused tests, then restores the prior single fixed button-position call.

## User experience

Not separately recorded in legacy change.md.

## Technical design

See Requirements and legacy Git history.

## Security and privacy

See migrated Decision and gates.

## Alternatives and non-goals

Not separately recorded in legacy change.md.

## Areas of concern

The user's direct implementation instructions approve Intent, the native macOS behavior, the fixed
position design, and execution, with chenli as the named approver. The user reviewed the fresh
packaged screenshot and then explicitly requested a PR, authorizing the Review handoff only. Merge,
release, deployment, and production mutation remain unauthorized.

## Acceptance criteria

- [x] AC-1: Double-clicking noninteractive main-titlebar drag content performs the configured
      macOS action, and reversible sizing restores the prior frame.
- [x] AC-2: Interactive/no-drag descendants and the desktop-pet surface do not dispatch the
      main-window titlebar action.
- [x] AC-3: Minimize, Zoom, Fill, None, missing-preference, and unknown-preference paths are
      explicit; Fill uses the active screen's visible frame rather than full-screen mode.
- [x] AC-4: The traffic lights use only the fixed `(28, 21)` position, remain vertically centered,
      and have the user-approved leading spacing without runtime geometry measurement.
- [x] AC-5: Focused DOM/AppKit/window-chrome tests, the full desktop package build, documentation,
      lifecycle, and diff checks pass on the latest upstream base.
- [x] AC-6: PR validation and cross-platform jobs pass without violating the desktop container
      boundary or rejecting colocated change evidence.

## Decision

The user's direct implementation instructions approve Intent, the native macOS behavior, the fixed
position design, and execution, with chenli as the named approver. The user reviewed the fresh
packaged screenshot and then explicitly requested a PR, authorizing the Review handoff only. Merge,
release, deployment, and production mutation remain unauthorized.
