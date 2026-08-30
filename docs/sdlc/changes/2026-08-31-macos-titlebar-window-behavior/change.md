---
id: change-2026-08-31-macos-titlebar-window-behavior
kind: change
schema: 2
status: verified
risk: medium
owner: codex
approvers: [chenli]
approved_at: 2026-08-31
created: 2026-08-31
updated: 2026-08-31
source: direct user reports and screenshot feedback in this task on 2026-08-31
inputs: live C2-dev reproduction, user screenshots, fixed 56px titlebar contract, macOS window preferences
outputs: native titlebar double-click behavior, fixed traffic-light placement, and regression coverage
scope: apps/desktop/native/window-effects/CodeTwoWindowEffects.m, apps/desktop/src/electrobun, apps/desktop/src/main.tsx, apps/desktop/tests, docs/sdlc/changes/2026-08-31-macos-titlebar-window-behavior
next_trigger: human review of the authorized pull request
verification_mode: owner
verified_by: codex
verified_at: 2026-08-31
---

# Preserve native macOS titlebar window behavior

## Intent

The user reported two defects in CodeTwo's custom macOS window chrome: double-clicking a draggable
titlebar region did not perform the action selected in Desktop & Dock settings, and the native
close, minimize, and zoom controls did not align with the fixed shared titlebar. The requested
outcome is ordinary Mac window behavior with a visually balanced traffic-light group.

The affected surface is the main Electrobun window on macOS. Windows/Linux behavior, full-screen
Spaces, browser zoom, desktop-pet chrome, renderer titlebar height, and stored application data are
non-goals. The traffic-light solution must not measure titlebar geometry or calculate an adaptive
position because the shared titlebar is fixed at 56 px.

## Spec

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

### Acceptance criteria

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

## Decision and gates

The user's direct implementation instructions approve Intent, the native macOS behavior, the fixed
position design, and execution, with chenli as the named approver. The user reviewed the fresh
packaged screenshot and then explicitly requested a PR, authorizing the Review handoff only. Merge,
release, deployment, and production mutation remain unauthorized.

## Plan

1. Route titlebar double-clicks from draggable, noninteractive renderer content through one typed
   host request to an AppKit helper.
2. Implement the user's macOS action with native APIs and cover every supported preference branch
   in a focused AppKit harness.
3. Use one literal traffic-light position for the fixed 56 px titlebar and reapply only that
   literal after native resize layout.
4. Rebase onto current `origin/main`, run the repository's current verification Gates, and open the
   authorized PR without inferring merge or release approval.

## Build

- The main renderer installs a scoped double-click handler only for macOS Electrobun windows.
- A typed RPC calls the window-effects library, where AppKit reads the current system preference
  and performs Minimize, Zoom, Fill/restore, None, or a closed failure for unknown values.
- The native buttons use `setWindowButtonPosition(28, 21)` at webview readiness and after resize;
  the host contains no titlebar measurement, observer, or adaptive positioning calculation.
- Focused DOM, Objective-C/AppKit, and source-contract tests protect the interaction and fixed
  geometry contracts.

## Verification

Verdict: verified.

The initial live C2 window ignored three double-clicks in an empty drag region while its native
Zoom action changed and restored the frame, isolating the missing custom-titlebar dispatch. Earlier
constructor-offset attempts were clamped by Electrobun and later reset by AppKit. The fixed native
position aligned the controls; the user then requested a 6 px leading adjustment, reviewed the
fresh `(28, 21)` packaged screenshot, and authorized the PR.

The first complete build after rebasing failed before compilation with `eslint: command not found`
because this worktree's installed packages predated the updated upstream lockfile. `bun install
--frozen-lockfile` installed the locked lint dependencies, and the unchanged build command then
passed lint, TypeScript, the 6,402-module Vite build, native helpers, and Electrobun packaging.

### Acceptance evidence

- AC-1: PASS — `bun test apps/desktop/tests/titlebarDoubleClick.test.ts apps/desktop/tests/nativeTitlebarDoubleClick.test.ts apps/desktop/tests/windowChromeContract.test.ts`; live packaged C2 changed from 1152×768 to 1188×768 and restored to 1152×768 through the titlebar action.
- AC-2: PASS — `bun test apps/desktop/tests/titlebarDoubleClick.test.ts apps/desktop/tests/windowChromeContract.test.ts` dispatches only from draggable, noninteractive content and verifies the desktop-pet exclusion.
- AC-3: PASS — `bun test apps/desktop/tests/nativeTitlebarDoubleClick.test.ts apps/desktop/tests/windowChromeContract.test.ts` compiles and runs the production AppKit harness for None, Fill/restore, Zoom, Minimize, and unknown values while preserving the missing-preference fallback.
- AC-4: PASS — `bun test apps/desktop/tests/windowChromeContract.test.ts`; the packaged host contains exactly two literal `(28, 21)` calls and no geometry measurement, and the fresh user-reviewed C2 screenshot shows the native group centered in the shared titlebar with the adjusted leading inset.
- AC-5: PASS — the focused suite, full `bun run build` desktop package, `bun script/verify/docs.ts`, `bun script/verify/sdlc.ts`, `bun script/verify/sdlc.ts --worktree`, and `git diff --check` pass on the rebased branch.

Residual risk: the live machine exercised the current Zoom fallback. Minimize, Fill, None, and
unknown preference values are verified in the production AppKit harness rather than by changing
the user's system preference. Native traffic-light artwork and diameter remain AppKit-owned.

## Review and release

Approval: the user authorized opening a pull request on 2026-08-31; merge remains pending.
Release target: none requested.
Release identity: not applicable until released.
Smoke evidence: not applicable until released.
Rollback: revert the scoped PR commit.
No release: no merge, package publication, deployment, or versioned release was requested.

## Feedback

The user requested the final 6 px rightward adjustment, reviewed the resulting packaged screenshot,
and asked for a PR. No post-merge feedback exists.
