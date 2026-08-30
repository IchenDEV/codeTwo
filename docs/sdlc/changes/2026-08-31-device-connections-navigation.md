---
id: change-2026-08-31-device-connections-navigation
kind: change
status: verified
owner: codex
approvers: user via the 2026-08-31 device-connections feedback and merge instruction
created: 2026-08-31
updated: 2026-08-31
source: user-supplied C2 Dev appshots plus 2026-08-31 placement, phone-icon, and compact-toolbar follow-ups
inputs: accepted requirement for discoverable connections in a space-efficient lower-left utility area
outputs: a verified one-row lower-left utility toolbar with accessible Settings, Usage, and Device connections buttons
next_trigger: merge PR #187 after refreshed required checks pass
---

# Make device connections discoverable from the main sidebar

## Intent

The desktop already implements remote pairing, paired-device management, and device sync, but the
main sidebar in the supplied appshot has no labeled device-connections destination. The only
general entry is a command-palette item named `Remote control`, while any plugin-contributed icon
does not communicate how to pair another C2 device. A user who has not memorized the command cannot
discover the connection flow.

The user directly requested a visible menu from the supplied running-app state. That request
accepts this Intent and its visible navigation outcome. The affected surface is the desktop main
sidebar and the existing remote modal opener. The pairing protocol, credentials, sync data model,
network listener, Plugin Manager policy, and Settings information architecture are unchanged.

## Spec

The main sidebar's fixed lower-left utility area is a single horizontal icon toolbar rather than
stacked labeled rows. Settings and Usage form a compact leading cluster; when the built-in remote
modal component is enabled, Device connections is anchored at the trailing edge with a
single-phone icon. Each button keeps a localized accessible name, hover tooltip, standard pointer
and keyboard behavior, and a visible focus treatment. Device connections uses a circular selected
state while its modal is open. Activating it opens the existing device-connections modal.

When the remote component is disabled in Plugins, the row is absent along with the component's
command and modal; Plugin Manager remains the recovery surface. This preserves the current plugin
lifecycle contract and does not present a dead connection affordance.

### Acceptance criteria

- [x] The fixed lower-left utility group uses one horizontal icon-toolbar row instead of stacked
      labeled rows, reducing its vertical footprint.
- [x] Settings and Usage remain available in the leading cluster; Device connections is anchored
      at the trailing edge when `remote.modal` is enabled.
- [x] Every utility icon has a localized accessible name, tooltip, keyboard focus treatment, and a
      minimum standard control hit area.
- [x] Device connections uses a circular selected state while its modal is open without inventing
      notification or connection-status dots.
- [x] With `remote.modal` enabled, the main sidebar includes Device connections in the fixed
      lower-left utility group, not the upper feature group.
- [x] Activating the row invokes the existing device-connections modal opener by pointer or
      keyboard-compatible button semantics.
- [x] With `remote.modal` disabled, the row is not rendered and no dead affordance remains.
- [x] The existing command-palette entry uses the same user-facing `Device connections` name.
- [x] The lower-left entry uses a single-phone icon rather than the computer-and-phone sync icon.
- [x] Focused rendered tests, renderer/design validation, SDLC validation, and isolated real UI
      inspection pass.

## Decision and gates

The user supplied the failed visible state and explicitly asked where the connection menu is,
accepting a discoverable main-menu repair. Reusing the existing modal avoids a second pairing
surface or protocol path. The user's 2026-08-31 `pr` instruction authorized Draft PR #187 as the
human-review handoff, and the later `merge` instruction accepts the verified residual risk and
authorizes that PR's merge. It does not authorize release, deployment, or production mutation.

## Plan

1. Add a red-capable SessionRail rendering assertion for the missing labeled connection row.
2. Route an enabled-state boolean and opener from App into SessionRail, render one standard
   NavigationRow, and localize its label in English and Simplified Chinese.
3. Align the command-palette label with the visible menu and keep the existing component policy
   filter.
4. Run the focused UI test, renderer/design checks, SDLC contract check, and an isolated renderer
   interaction inspection.
5. Apply the user's follow-up by moving the row into the fixed utility group and changing its icon
   to a single phone; rerun the placement and rendered checks.
6. Apply the compact-toolbar reference by converting the stacked utility rows to icon-only buttons,
   preserving discoverability through tooltips and accessible names, and rerun rendered checks.

Rollback removes the sidebar prop/row and localization keys and restores the command label. No
stored data, credentials, protocol state, or migrations are changed.

## Build

- Review handoff: [Draft PR #187](https://github.com/IchenDEV/codeTwo/pull/187).
- Added one standard NavigationRow to SessionRail's fixed lower-left utility group between Usage
  and Settings, using a single-phone icon and English/Simplified Chinese copy.
- Routed the live `remote.modal` component policy, open state, and existing RemoteModal opener from
  App into the rail. Narrow layouts close the overlay rail after selection.
- Renamed the command-palette action from developer-facing `Remote control` to the same localized
  `Device connections` label.
- Added rendered regression coverage for the enabled, clickable entry and the disabled-component
  absence path. No pairing, sync, credential, listener, or persistence code changed.
- Applied the user's first visual follow-up without changing the remote plugin policy, pairing
  protocol, or modal implementation.
- Replaced the three stacked utility rows with one 40px rendered toolbar. Settings and Usage use
  icon buttons in the leading cluster; Device connections remains a phone icon at the trailing edge.
- Added a shared module-level utility-button wrapper for tooltips, accessible labels, busy state,
  circular keyboard focus, and the blue selected treatment without adding new component state.
- Removed the rail-only provider logo, numeric quota meter, and visible labels from this compact
  surface; the full provider/window/remaining quota copy remains available through the Usage
  button's accessible label and tooltip.

## Verification

Verdict: verified

The compact-toolbar follow-up meets all observable acceptance criteria; the user approved merge,
and refreshed required checks are the next Gate.

- The first test invocation stopped before the product seam because this fresh worktree had no
  frontend dependencies. `bun install --frozen-lockfile` under `apps/desktop` installed the locked
  dependency graph without changing the lockfile.
- Before implementation, `bun test apps/desktop/tests/sessionRailRendered.test.tsx` reached the
  intended seam and failed only the new regression: expected `Device connections`, received
  `undefined` (17 passed, 1 failed). After the placement follow-up it passed 19 tests and 193
  expectations.
- `bun test apps/desktop/tests/sessionRailRendered.test.tsx
  apps/desktop/tests/t3RemoteContract.test.ts` passed 23 tests and 215 expectations. The rendered
  suite still emits its existing React `act(...)` warnings; they did not hide a test failure.
- `bun run build:renderer` passed the source design-system check with 0 new violations, TypeScript,
  a 6,397-module Vite production build, and the built-selector design check.
- Isolated browser QA used a temporary real-component preview on `http://127.0.0.1:1421/` without
  starting another Core. The preview rendered the production `SessionRail` and `RemoteModal`; it
  was removed immediately after inspection. The entry was absent from `data-rail-features`, present
  once in `data-rail-utilities`, and ordered exactly Usage, Device connections, Settings. Its SVG
  carried the phone-icon marker and remained visible 42px above the rail's lower edge.
- Clicking the entry opened the existing `Device connections` dialog with the C2 pairing-link
  field, Pair action, incoming-connections action, and Done action. The same row and modal remained
  visible and operable at 390 x 844. Console warning/error queries returned an empty list in the
  inspected desktop and narrow states.
- Final `git diff --check` and `bun script/check-sdlc.ts` passed; no temporary preview or tagged
  instrumentation remained.
- Before the compact follow-up implementation, the revised renderer contract failed at the three
  intended seams: icon-toolbar structure, Device connections icon button, and Usage loading button.
  After implementation, `bun test apps/desktop/tests/sessionRailRendered.test.tsx` passed 19 tests
  and 194 expectations; the combined rail and remote contract run passed 23 tests and 216
  expectations. Existing non-failing React `act(...)` warnings remain unchanged.
- The first compact-toolbar renderer build was correctly rejected by the design checker for a raw
  `h-12` control height. Replacing it with the repository's semantic control-height token produced
  a clean `bun run build:renderer`: 0 new design violations, TypeScript passed, 6,397 modules built,
  and the built-selector check passed.
- Browser QA rendered the production SessionRail and RemoteModal in a temporary isolated preview
  without starting another Core. The final toolbar measured 40px tall with three 28 x 28 controls,
  no visible labels, no invented status dot, and exact Settings, Usage, Device connections DOM
  order while the device item was visually anchored at the trailing edge.
- Pointer hover exposed the Device connections tooltip. Clicking the phone set
  `data-selected=true` and `aria-current=page`, applied a nontransparent blue circular selection,
  and opened the existing pairing dialog. At 390 x 844 the toolbar stayed on one line without
  clipping. Browser warning/error logs were empty in the final desktop and narrow states.
- A final Draft-PR handoff preview rendered the same production rail in explicit dark appearance.
  The meaningful DOM contained all three accessible buttons without an error overlay; the toolbar
  remained one 40px row, each control measured 28 x 28, the selected phone kept its blue circular
  treatment, and no control clipped. The isolated preview and its server were removed after capture.
- The Draft-PR handoff rerun first invoked `bun run build:renderer` from the repository root and
  failed with `Script not found "build:renderer"`. Running the same workspace script from
  `apps/desktop` passed the design check with 0 new violations, TypeScript, the 6,397-module Vite
  production build, and the built-selector check.

- After merge approval, `main` advanced repeatedly. Refreshed CI run `33326789622` tested the newer
  synthetic merge ref and failed Linux, macOS, and Windows at the Feishu resource-section test:
  that newly inherited assertion still required visible `Settings` text after this change had
  intentionally converted utility rows into icon-only buttons. Rebasing onto `b82b2060` reproduced
  the failure with CI's Bun 1.4.0 (20 passed, 1 failed). Replacing the stale visible-text assertion
  with the Settings toolbar button's localized accessible-label contract preserved both Settings
  availability and the resource-section layout check; the same Bun 1.4.0 test then passed 21/21.
- On that refreshed base, `bunx bun@1.4.0 test` passed all 757 desktop tests across 124 files with
  3,683 expectations. `bunx bun@1.4.0 run build:renderer` also passed the source design check with
  0 new violations, TypeScript, a 6,401-module Vite production build, and the built-selector check.
- Before merge, `main` advanced again through PR #188. Rebasing onto `37c89330` was conflict-free,
  and the Bun 1.4.0 full suite passed all 745 current desktop tests across 124 files with 3,501
  expectations. The first renderer build stopped before source validation because the existing
  dependency directory lacked #188's newly locked ESLint packages. A frozen Bun 1.4.0 install did
  not change tracked files; the same build then passed ESLint, Stylelint, TypeScript, and the
  6,401-module Vite production build.

Residual risk: icon-only controls rely on hover/focus labels for first-time discoverability, which
is the accepted density tradeoff in the supplied reference. Physical two-device pairing and the
existing network path are unchanged.

## Review and release

Approval: user approved PR #187 for merge via the 2026-08-31 `merge` instruction.
Release target: none.
Release identity: not applicable until released.
Smoke evidence: not applicable until released.
Rollback: remove the sidebar navigation wiring and localization changes; no data rollback is needed.
No release: explicit no-release disposition; the merge instruction does not authorize release or
deployment.

## Feedback

The initiating feedback is the 2026-08-31 appshot showing no labeled device-connections entry in
the main feature list. The first visual follow-up rejected the upper feature placement and requested
a lower-left position with a phone-shaped icon. The latest reference asks for a compact horizontal
icon layout that uses the sidebar's lower area more efficiently; that now governs the utility-group
geometry while the earlier phone-icon and lower-left requirements remain in force.
