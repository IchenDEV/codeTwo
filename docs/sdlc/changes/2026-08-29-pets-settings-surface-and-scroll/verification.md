---
id: "2026-08-29-pets-settings-surface-and-scroll"
stage: verification
schema: 3
status: passed
owner: codex
created: 2026-08-29
based_on: plan.md
commit: ""
verification_mode: owner
verified_by: "codex"
verified_at: "2026-08-29"
release_target: none
release_identity: ""
---

# Verification: Align Pets settings surfaces and scrolling

## Automated checks

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

## Behavioral evidence

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

## Visual evidence

See bundle evidence/ when present.

## Security and privacy evidence

Not separately recorded unless present in legacy Verification.

## Deviations and residual risk

Residual risk: the existing non-failing React `act(...)` warnings remain; no product release was

## Verdict

Verdict: verified..

## Review and release

No PR, merge, or release requested. Human product review remains the next lifecycle trigger.

## Feedback

No additional layout, overflow, interaction, or scroll-boundary defects were observed.
