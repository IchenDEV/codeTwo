---
id: "2026-08-31-device-connections-navigation"
stage: verification
schema: 3
status: passed
owner: codex
created: 2026-08-31
based_on: plan.md
commit: ""
verification_mode: owner
verified_by: "codex"
verified_at: "2026-08-31"
release_target: none
release_identity: "not applicable until released."
---

# Verification: Make device connections discoverable from the main sidebar

## Automated checks

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

### Acceptance evidence

- AC-1: PASS — `Verification record above` preserves the original passing evidence.
- AC-2: PASS — `Verification record above` preserves the original passing evidence.
- AC-3: PASS — `Verification record above` preserves the original passing evidence.
- AC-4: PASS — `Verification record above` preserves the original passing evidence.
- AC-5: PASS — `Verification record above` preserves the original passing evidence.
- AC-6: PASS — `Verification record above` preserves the original passing evidence.
- AC-7: PASS — `Verification record above` preserves the original passing evidence.
- AC-8: PASS — `Verification record above` preserves the original passing evidence.
- AC-9: PASS — `Verification record above` preserves the original passing evidence.
- AC-10: PASS — `Verification record above` preserves the original passing evidence.

Residual risk: icon-only controls rely on hover/focus labels for first-time discoverability, which
is the accepted density tradeoff in the supplied reference. Physical two-device pairing and the
existing network path are unchanged.

## Behavioral evidence

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

### Acceptance evidence

- AC-1: PASS — `Verification record above` preserves the original passing evidence.
- AC-2: PASS — `Verification record above` preserves the original passing evidence.
- AC-3: PASS — `Verification record above` preserves the original passing evidence.
- AC-4: PASS — `Verification record above` preserves the original passing evidence.
- AC-5: PASS — `Verification record above` preserves the original passing evidence.
- AC-6: PASS — `Verification record above` preserves the original passing evidence.
- AC-7: PASS — `Verification record above` preserves the original passing evidence.
- AC-8: PASS — `Verification record above` preserves the original passing evidence.
- AC-9: PASS — `Verification record above` preserves the original passing evidence.
- AC-10: PASS — `Verification record above` preserves the original passing evidence.

Residual risk: icon-only controls rely on hover/focus labels for first-time discoverability, which
is the accepted density tradeoff in the supplied reference. Physical two-device pairing and the
existing network path are unchanged.

## Visual evidence

See bundle evidence/ when present.

## Security and privacy evidence

Not separately recorded unless present in legacy Verification.

## Deviations and residual risk

Residual risk: icon-only controls rely on hover/focus labels for first-time discoverability, which

## Verdict

Verdict: verified.

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
