---
id: change-2026-08-31-instant-session-tab-switching
kind: change
status: verified
owner: codex
approvers: chenli
created: 2026-08-31
updated: 2026-08-31
source: user request in this task, "移除 tab 之间切换的多余的动画"
inputs: the current session rail selection treatment and the user-supplied sidebar screenshot
outputs: immediate session-tab selection without a sliding or morphing indicator
next_trigger: merge PR #185 after required checks pass
---

# Make session tab switching immediate

## Intent

The user identified the animated selection movement between session rows as unnecessary. Session
tabs should feel direct: choosing another task replaces the active content immediately and updates
the selected row without a sliding, morphing, or fading selection indicator.

## Spec

Keep the existing neutral selected surface on the active session row, but render that surface on the
row itself instead of moving one shared liquid indicator through the session list. Preserve hover,
focus, popup-open, archive, collapse, and button feedback because those interactions communicate a
local state change rather than delaying tab selection. Other tab groups are outside this change.

### Acceptance criteria

- [x] Selecting a session updates the selected row and content immediately, with no animated
      indicator travelling between session rows.
- [x] The active session keeps the existing neutral selected surface in light and dark appearance.
- [x] Pointer, keyboard, context-menu, archive, and section-collapse interactions remain unchanged.
- [x] The focused rendered test, renderer build, lifecycle check, and real CodeTwo window check pass.

## Decision and gates

The user's direct implementation request approves Intent and execution, with chenli as the named
approver. It extends the active sidebar work on PR #185. The user explicitly authorized the PR's
merge on 2026-08-31; no release is authorized.

## Plan

Replace the session list's shared animated indicator with the existing row-local selected class,
add a focused rendered assertion for the instantaneous selection contract, then verify the desktop
renderer and the running CodeTwo window. Rollback restores the shared liquid selection wrapper.

## Build

`SessionRail` now renders its task list as a plain container and applies the selected neutral fill
directly to the active session row. The row no longer transitions its background color, so switching
cannot leave a residual fade after removing the shared liquid indicator. Existing hover, focus,
popup-open, archive, disclosure, and action-button feedback remains in place. A focused rendered
test records the immediate-selection contract.

## Verification

Verdict: verified.

- `bun test apps/desktop/tests/sessionRailRendered.test.tsx`: 19 tests passed with 195 assertions,
  including immediate row-local selection and existing keyboard, context-menu, archive, and Section
  behavior. Existing Base UI `act(...)` warnings remain non-failing and are unrelated to this change.
- The first renderer-build attempt from the repository root failed with `Script not found
  "build:renderer"`. Running the package-owned command from `apps/desktop` passed design checks,
  TypeScript, Vite production build in 27.84 seconds, and generated-output checks with 35 semantic
  selectors.
- The in-app Browser reported no open browser tabs and cannot attach to the Electrobun
  `views://main/index.html` WebView. The built renderer was therefore copied into the already-running
  C2-dev bundle and reloaded without starting a second Core process.
- In the real CodeTwo window, consecutive task selections updated the active row and content
  directly in light and dark appearance. The selected surface remained neutral, row actions stayed
  available, and no liquid indicator travelled between rows. The same switch was repeated at the
  supported 230-pixel rail minimum without clipping; the original light appearance and 347-pixel
  rail width were restored afterward.
- The first lifecycle check rejected the new Artifact because its required `Feedback` section was
  missing. The section was added, after which `bun script/check-sdlc.ts` passed.
- `git diff --check` passed.

Residual risk: desktop observation is frame-level rather than a recorded high-frame-rate capture;
the absence of the shared animated component and background transition is also protected by source
and rendered assertions.

## Review and release

Human review and merge approval for PR #185 were explicitly granted by chenli on 2026-08-31.
No release was requested.

## Feedback

The user removed motion that made ordinary task navigation feel indirect. This change keeps motion
scoped to interactions where it explains a local transition, such as disclosure and archival,
instead of applying it to routine session selection.
