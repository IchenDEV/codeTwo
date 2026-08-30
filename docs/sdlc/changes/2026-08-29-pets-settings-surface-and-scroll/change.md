---
id: change-2026-08-29-pets-settings-surface-and-scroll
kind: change
schema: 2
status: verified
risk: low
owner: codex
approvers: "#decision-and-gates"
approved_at: 2026-08-29
created: 2026-08-29
updated: 2026-08-31
source: "#intent"
inputs: "#spec"
outputs: "#build"
scope: apps/desktop, docs/design/system.md
next_trigger: human product review
verification_mode: owner
verified_by: codex
verified_at: 2026-08-29
---

# Align Pets settings surfaces and scrolling

## Intent

The user's rendered Pets settings review identified two inconsistent elevated behavior rows and a
missing bottom inset when the settings viewport reaches its scroll limit. Pet catalog rows should
also reuse the same setting-row anatomy as the rest of Settings instead of maintaining a parallel
custom row layout.

## Spec

Render every pet catalog entry through the shared `SettingRow` and shared `Button`. Keep the catalog
and Session behavior as flat grouped surfaces with internal semantic hairlines, without outer rings
or per-row surface elevation. Make the settings page itself own an 80px semantic page-end inset so
the last section clears the bottom of the scroll viewport on every tab.

### Acceptance criteria

- [x] AC-1: Pet catalog entries use the shared setting-row anatomy and preserve list semantics.
- [x] AC-2: Catalog and Session behavior surfaces have no decorative surface elevation.
- [x] AC-3: Existing pet preview, selection, mood, visibility, activity, and size behavior remains intact.
- [x] AC-4: At the scroll limit, the last Pets section has an 80px bottom inset.
- [x] AC-5: Desktop and compact layouts remain readable in light and dark appearances.
- [x] AC-6: Focused tests, design, type, SDLC, diff, screenshot, and console checks pass.

## Decision and gates

Intent and acceptance come directly from the user's 2026-08-29 browser annotation. No permission to
create a PR, merge, publish, or release is implied.

## Plan

Reuse the existing business primitives, remove only decorative elevation, move page-end spacing to
the settings page's CSS contract, add focused assertions, and verify the running renderer at the
bottom scroll boundary. Rollback is the inverse source change.

## Build

Pet catalog entries now compose the shared `SettingRow`, `Button`, and `Spinner` primitives inside a
semantic list. The catalog and Session behavior each use one flat grouped surface with internal
hairlines. The settings page owns its semantic page-end inset at both regular and compact widths,
so responsive overrides cannot reset the scroll clearance to zero.

## Verification

- `bun test tests/petSettings.test.tsx tests/settingsLayoutContract.test.ts` — 23 passed, 0 failed.
  The existing Base UI test harness still emits non-failing `act(...)` warnings.
- `bunx tsc --noEmit` — passed.
- `bun run check:design` — passed with 0 new violations; legacy debt remains 657.
- In-app Browser at `http://localhost:1420/` — verified meaningful Pets content with no framework
  overlay at 1280×720, 800×600, and 600×600 in dark and light appearances. Catalog and behavior
  shadows computed to `none`, horizontal overflow was zero, and the final section retained 80px
  clearance at the scroll limit.
- Selected Bill Gates and then restored Naiwa; the selected row updated correctly both times.
- Browser console reported no warnings or errors after the final reload.
- `bun script/verify/sdlc.ts` — passed; task-scoped `git diff --check` — passed.

Verdict: verified.

### Acceptance evidence

- AC-1: PASS — `bun test tests/petSettings.test.tsx tests/settingsLayoutContract.test.ts` covered the shared setting-row and list behavior.
- AC-2: PASS — recorded renderer inspection computed catalog and Session behavior shadows as `none`.
- AC-3: PASS — focused pet tests and the recorded selection restore preserved preview, selection, mood, visibility, activity, and size behavior. Evidence: `Verification record above`.
- AC-4: PASS — the `http://localhost:1420/` scroll-limit inspection measured an `80px` final-section inset.
- AC-5: PASS — the recorded 1280x720, 800x600, and 600x600 light/dark matrix had zero horizontal overflow. Evidence: `Verification record above`.
- AC-6: PASS — focused tests, `bunx tsc --noEmit`, `bun run check:design`, `bun script/verify/sdlc.ts`, screenshots, console inspection, and `git diff --check` passed.

Residual risk: the existing non-failing React `act(...)` warnings remain; no product release was
reviewed or authorized.

## Review and release

No PR, merge, or release requested. Human product review remains the next lifecycle trigger.

## Feedback

No additional layout, overflow, interaction, or scroll-boundary defects were observed.
