---
id: "2026-08-31-desktop-motion-and-performance"
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

# Verification: Repair desktop motion and interaction performance

## Automated checks

Verdict: verified.

This verdict covers the renderer implementation and deterministic repository contracts.

### Acceptance evidence

- AC-1: PASS — `bun run build:renderer` emitted separate chunks for all five optional routes, and browser resource inspection excluded them from the initial load.
- AC-2: PASS — `bun test tests/desktopPerformanceContract.test.ts` verified one opacity-only route-motion contract across all five pages.
- AC-3: PASS — `bun test tests/desktopPerformanceContract.test.ts` verified the opacity-only class, and browser Reduced Motion inspection confirmed the semantic duration collapses without translated page content.
- AC-4: PASS — `bun test tests/desktopPerformanceContract.test.ts` verified immediate controlled inputs with deferred filtering on all three measured searches.
- AC-5: PASS — `bun test tests/taskBoardRendered.test.tsx` verified the three-card-per-lane progressive initial render.
- AC-6: PASS — `bun test tests/desktopPerformanceContract.test.ts` verified paint containment without DOM virtualization.
- AC-7: PASS — `bun run build:renderer` reduced the latest rebased entry to 4,456,533 raw bytes and 1,338,964 gzip bytes and emitted the five route chunks.
- AC-8: PASS — full desktop tests, `bunx tsc --noEmit`, renderer build, lint, SDLC checks, `git diff --check`, and browser console inspection passed.
- AC-9: PASS — the `bun run build:renderer` production output was exercised in the browser frame harness, which recorded a 16.8 ms repeated-route maximum and no interval above 33 ms.

Focused performance, composer, and task-board tests pass with 24 tests and 139 assertions; the
focused SessionRail suite passes with 23 tests and 228 assertions. The complete desktop suite
passes with 780 tests, 3,724 assertions, and zero failures. Type checking, lint, the renderer
production build, the documentation and SDLC contracts, and diff whitespace checks pass. The test
harness continues to emit pre-existing React `act(...)` warnings without failures.

The latest rebased production entry is 4,456,533 raw bytes and 1,338,964 gzip bytes, below the measured
4,575,989 raw and 1,368,081 gzip baseline. Each optional page is emitted as a route chunk and none
of those five chunks is present in the initial browser resource list.

Rendered browser verification covered all five cold route opens, search input on the three
filtered pages, ten repeated task-board open/close cycles, normal motion, and Reduced Motion. Cold
route maximum frame intervals stayed at or below 9.4 ms. Repeated task-board transitions reached a
16.8 ms maximum across 417 frames, with no interval above 20 ms or 33 ms. Search interaction
reached a 17.3 ms maximum, again with no interval above 20 ms or 33 ms. The console remained free
of warnings and errors. Computed style confirmed `transform: none` for the page entrance and the
existing Reduced Motion override collapsed the 280 ms duration.

Residual risk: the current checkout cannot own the default native data profile while two user C2
instances are live. The pre-change native instance was healthy at idle, and its measured task-board
tail motivated removal of the full-page translation, but the post-change checkout has not been run
inside native WebKit. That platform-specific confirmation must reuse a safe instance or wait for a
separate profile rather than disrupting user work.

## Behavioral evidence

Verdict: verified.

This verdict covers the renderer implementation and deterministic repository contracts.

### Acceptance evidence

- AC-1: PASS — `bun run build:renderer` emitted separate chunks for all five optional routes, and browser resource inspection excluded them from the initial load.
- AC-2: PASS — `bun test tests/desktopPerformanceContract.test.ts` verified one opacity-only route-motion contract across all five pages.
- AC-3: PASS — `bun test tests/desktopPerformanceContract.test.ts` verified the opacity-only class, and browser Reduced Motion inspection confirmed the semantic duration collapses without translated page content.
- AC-4: PASS — `bun test tests/desktopPerformanceContract.test.ts` verified immediate controlled inputs with deferred filtering on all three measured searches.
- AC-5: PASS — `bun test tests/taskBoardRendered.test.tsx` verified the three-card-per-lane progressive initial render.
- AC-6: PASS — `bun test tests/desktopPerformanceContract.test.ts` verified paint containment without DOM virtualization.
- AC-7: PASS — `bun run build:renderer` reduced the latest rebased entry to 4,456,533 raw bytes and 1,338,964 gzip bytes and emitted the five route chunks.
- AC-8: PASS — full desktop tests, `bunx tsc --noEmit`, renderer build, lint, SDLC checks, `git diff --check`, and browser console inspection passed.
- AC-9: PASS — the `bun run build:renderer` production output was exercised in the browser frame harness, which recorded a 16.8 ms repeated-route maximum and no interval above 33 ms.

Focused performance, composer, and task-board tests pass with 24 tests and 139 assertions; the
focused SessionRail suite passes with 23 tests and 228 assertions. The complete desktop suite
passes with 780 tests, 3,724 assertions, and zero failures. Type checking, lint, the renderer
production build, the documentation and SDLC contracts, and diff whitespace checks pass. The test
harness continues to emit pre-existing React `act(...)` warnings without failures.

The latest rebased production entry is 4,456,533 raw bytes and 1,338,964 gzip bytes, below the measured
4,575,989 raw and 1,368,081 gzip baseline. Each optional page is emitted as a route chunk and none
of those five chunks is present in the initial browser resource list.

Rendered browser verification covered all five cold route opens, search input on the three
filtered pages, ten repeated task-board open/close cycles, normal motion, and Reduced Motion. Cold
route maximum frame intervals stayed at or below 9.4 ms. Repeated task-board transitions reached a
16.8 ms maximum across 417 frames, with no interval above 20 ms or 33 ms. Search interaction
reached a 17.3 ms maximum, again with no interval above 20 ms or 33 ms. The console remained free
of warnings and errors. Computed style confirmed `transform: none` for the page entrance and the
existing Reduced Motion override collapsed the 280 ms duration.

Residual risk: the current checkout cannot own the default native data profile while two user C2
instances are live. The pre-change native instance was healthy at idle, and its measured task-board
tail motivated removal of the full-page translation, but the post-change checkout has not been run
inside native WebKit. That platform-specific confirmation must reuse a safe instance or wait for a
separate profile rather than disrupting user work.

## Visual evidence

See bundle evidence/ when present.

## Security and privacy evidence

Not separately recorded unless present in legacy Verification.

## Deviations and residual risk

Residual risk: the current checkout cannot own the default native data profile while two user C2

## Verdict

Verdict: verified..

## Review and release

Approval: [user] approved on 2026-08-31. human responsiveness and motion review.
Release target: none.
Release identity: not applicable until released.
Smoke evidence: not applicable until released.
Rollback: revert this change's repository diff.
No release: no release or deployment was requested.

## Feedback

The scope was corrected after the user noted that checking animation coverage alone did not
investigate the remaining performance problem. The resulting work treats startup weight, urgent
search updates, off-screen paint, missing route motion, and translated full-page motion as distinct
measured paths.
