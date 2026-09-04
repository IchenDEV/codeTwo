---
id: "2026-08-31-macos-titlebar-window-behavior"
stage: plan
schema: 3
status: accepted
owner: codex
created: 2026-08-31
based_on: spec.md
risk: medium
scope: apps/desktop/native/window-effects/CodeTwoWindowEffects.m, apps/desktop/src/container.ts, apps/desktop/src/electrobun, apps/desktop/src/main.tsx, apps/desktop/tests, docs/catalog.json, docs/sdlc/changes/2026-08-31-macos-titlebar-window-behavior, script/verify/checks.test.ts, script/verify/docs.ts
approved_by: "[chenli]"
approved_at: "2026-08-31"
---

# Plan: Preserve native macOS titlebar window behavior

## Files and ownership

apps/desktop/native/window-effects/CodeTwoWindowEffects.m, apps/desktop/src/container.ts, apps/desktop/src/electrobun, apps/desktop/src/main.tsx, apps/desktop/tests, docs/catalog.json, docs/sdlc/changes/2026-08-31-macos-titlebar-window-behavior, script/verify/checks.test.ts, script/verify/docs.ts

## Order of work

1. Route titlebar double-clicks from draggable, noninteractive renderer content through one typed
   host request to an AppKit helper.
2. Implement the user's macOS action with native APIs and cover every supported preference branch
   in a focused AppKit harness.
3. Use one literal traffic-light position for the fixed 56 px titlebar and reapply only that
   literal after native resize layout.
4. Rebase onto current `origin/main`, run the repository's current verification Gates, and open the
   authorized PR without inferring merge or release approval.

## Test-first proof

See legacy Verification section.

## Visual or integration proof

See legacy Verification section.

## Risks and mitigations

See legacy Decision and gates.

## Rollback

See legacy Review and release.

## Deviations

- The main renderer installs a scoped double-click handler only for macOS Electrobun windows.
- A typed RPC calls the window-effects library, where AppKit reads the current system preference
  and performs Minimize, Zoom, Fill/restore, None, or a closed failure for unknown values.
- The native buttons use `setWindowButtonPosition(28, 21)` at webview readiness and after resize;
  the host contains no titlebar measurement, observer, or adaptive positioning calculation.
- Focused DOM, Objective-C/AppKit, and source-contract tests protect the interaction and fixed
  geometry contracts.
- The renderer now installs the desktop-only titlebar action through `container.ts`, preserving
  the repository's single desktop-shell import boundary without changing the interaction.
- The documentation catalog now classifies referenced files colocated under a change bundle's
  `evidence/` directory, matching the lifecycle contract and retaining orphan-image checks.

## Decision

The user's direct implementation instructions approve Intent, the native macOS behavior, the fixed
position design, and execution, with chenli as the named approver. The user reviewed the fresh
packaged screenshot and then explicitly requested a PR, authorizing the Review handoff only. Merge,
release, deployment, and production mutation remain unauthorized.
