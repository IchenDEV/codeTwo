---
id: change-2026-08-30-quiet-session-rail-items
kind: change
schema: 2
status: closed
risk: low
owner: codex
approvers: user via the 2026-08-30 sidebar requests and explicit PR merge authorization
approved_at: 2026-08-30
created: 2026-08-30
updated: 2026-08-31
source: user-supplied sidebar reference and PR #183
inputs: accepted conditional row-hierarchy and visual-noise constraints
outputs: merge commit e3744874 and focused renderer verification evidence
scope: apps/desktop
next_trigger: new session-rail feedback or a regression report
verification_mode: owner
verified_by: codex
verified_at: 2026-08-30
---

# Quiet the session rail items

## Intent

The user supplied a Codex-style sidebar reference on 2026-08-30 and asked to improve the CodeTwo
sidebar items so they stay clean and demand less attention. They clarified that the row remains a
three-level hierarchy when a latest-conversation preview exists: title, latest conversation, then
project/workspace. When no useful preview exists, only the title and workspace appear. Provider,
routine completion, age, and persistent controls should not turn each idle row into a status card.

## Spec

Each session row uses the existing source-list selection treatment and a conditional content stack:
title first, a useful latest-conversation preview second, and project/workspace identity last. The
middle line is omitted only when it has no meaningful text or merely repeats the title. Routine
completed state, provider branding, age, and action buttons do not compete in the resting visual
state. Running, awaiting-input, and failed states remain visible as compact semantic indicators.
Row actions remain available on pointer hover, keyboard focus, and the existing context menu.

### Acceptance criteria

- [x] AC-1: Rows with a useful latest conversation show three ordered lines: title, preview, workspace.
- [x] AC-2: Rows without a useful preview collapse to two ordered lines: title and workspace.
- [x] AC-3: Completed text, provider branding, age, and persistent action chrome are absent from the
      resting visual hierarchy.
- [x] AC-4: Running, awaiting-input, and failed sessions retain a compact, accessible state indicator;
      completed sessions stay visually quiet.
- [x] AC-5: Rename, pin, archive/restore, selection, arrow-key navigation, and keyboard/native context
      menus preserve their behavior and accessible names.
- [x] AC-6: Hover, focus, popup-open, and selected surfaces use the existing neutral source-list tokens in
      light, dark, and constrained rail widths without clipping.
- [x] AC-7: Focused rendered tests, the design-system check, SDLC check, and real renderer inspection pass.

## Decision and gates

Intent and design acceptance come directly from the user's 2026-08-30 request and supplied
reference. The change is limited to the session item hierarchy and its focused regression tests.
No PR, merge, publication, or release permission is implied.

## Plan

Refine the existing row in place, reuse the existing Button, context-menu, semantic status, and
selection-group primitives, and keep the rail's current width contract. Keep useful preview
copy as the conditional middle line, replace the visible provider/completed footer with workspace
identity, disclose actions on hover or focus, and retain urgent activity at the trailing edge.
Update only the focused rendered tests that protect this behavior, then validate source, renderer,
and lifecycle gates. Rollback is the inverse component and test change.

## Build

The session row now renders a conditional title/preview/workspace hierarchy. Useful latest
conversation text is a visible, truncated middle line and remains the row's accessible description
and native hover title. Empty, punctuation-only, or title-repeating previews are omitted, so those
rows collapse to title/workspace. Provider branding, age, and routine completed state remain out of
the resting row. Running, awaiting-input, and failed states use compact semantic indicators. Pin,
rename, and archive/restore controls appear on hover, keyboard focus, or popup-open state and remain
present in the existing native and rendered context menus.

## Verification

Verdict: verified.

### Acceptance evidence

- AC-1: PASS — `bun test tests/sessionRailRendered.test.tsx` and renderer inspection verified title, preview, workspace ordering.
- AC-2: PASS — the same focused coverage verified two-line collapse when the preview is empty or redundant. Evidence: `Verification record above`.
- AC-3: PASS — rendered inspection confirmed completed text, provider branding, age, and resting action chrome were absent. Evidence: `Verification record above`.
- AC-4: PASS — focused tests retained compact accessible running, awaiting-input, and failed indicators while completed rows stayed quiet. Evidence: `Verification record above`.
- AC-5: PASS — `sessionRailRendered.test.tsx` retained rename, pin, archive/restore, selection, arrow navigation, and context menus.
- AC-6: PASS — recorded light/dark and 220px inspection verified neutral source-list states without horizontal overflow. Evidence: `Verification record above`.
- AC-7: PASS — the focused test, `bun run build:renderer`, `bun script/verify/sdlc.ts`, real renderer inspection, and `git diff --check` passed after two recorded build corrections.

- Failed iteration: `bun run build:renderer` stopped in the source design check because the first
  row draft used raw `h-5`; the design checker required a semantic control-height utility. The row
  was corrected to the existing `h-control-mini` token before the build was rerun.
- Failed iteration: the next renderer build passed the source design check with 0 new violations,
  then TypeScript found the now-unused `providerLabel` import left by removing visible provider
  branding. The unused import was removed before the next build.
- `bun test tests/sessionRailRendered.test.tsx`: 16 tests passed with 174 assertions. The existing
  Base UI `act(...)` environment warnings remain non-failing and are outside this visual change.
- `bun run build:renderer`: passed TypeScript, Vite production build, source and generated-output
  design checks after the hierarchy correction. The source check reported 0 new violations, 656
  legacy findings, and 20 contrast ratios; the generated-output check found 35 semantic selectors.
  Vite built in 21.62 seconds.
- Real renderer inspection confirmed exact line order `title`, `preview`, `workspace` for useful
  previews and `title`, `workspace` otherwise. Three-line rows measured 72 pixels high; two-line
  rows measured 54 pixels. Both stayed free of horizontal overflow at the standard width and the
  supported 220-pixel rail minimum. The earlier light/dark selection and action-disclosure checks
  remain applicable because the correction only restores a semantic muted-text content line.
  Selecting another row updated `aria-current`; the browser console reported no warnings or errors.
- Only the Vite renderer was started for inspection after the process/port preflight; no second Core
  was launched alongside the live CodeTwo instance. The development-only preview fixture was
  removed after inspection and is not part of the final source tree.
- `bun script/verify/sdlc.ts` revalidated the migrated Artifact, and `git diff --check` passed.

Residual risk: the captured inspection covers the supported sidebar widths and themes, but not
future row content shapes introduced after PR #183.

## Review and release

Approval: the user explicitly authorized creating and merging the repository pull request on
2026-08-30.
Release target: none; this was a repository integration, not a versioned product release.
Rollback: revert merge commit `e3744874` and its PR #183 implementation commits.
No release: [PR #183](https://github.com/IchenDEV/codeTwo/pull/183) was observed on `origin/main` as
merge commit `e3744874`; no versioned package or deployment was requested.

## Feedback

The user's correction replaced the initial fixed two-line interpretation with a conditional
three-line hierarchy. No new defects were observed in the corrected rendered review. Existing
unrelated test and bundle-size warnings were not expanded into this narrowly scoped change.
