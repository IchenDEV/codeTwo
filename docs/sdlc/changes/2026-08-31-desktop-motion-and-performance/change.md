---
id: change-2026-08-31-desktop-motion-and-performance
kind: change
schema: 2
status: verified
risk: medium
owner: codex
approvers: [user]
approved_at: 2026-08-31
created: 2026-08-31
updated: 2026-08-31
source: current user request and follow-up that performance must be investigated independently from animation coverage
inputs: docs/design/system.md, live C2-dev WebKit measurements, renderer frame sampling, and the current desktop source
outputs: measured desktop performance fixes, one shared page-motion contract, focused regression tests, and rendered verification evidence
scope: apps/desktop/src/App.tsx, apps/desktop/src/automation/AutomationsPage.tsx, apps/desktop/src/docker/DockerPage.tsx, apps/desktop/src/github/PullRequestsPage.tsx, apps/desktop/src/plugins/PluginManagerPage.tsx, apps/desktop/src/sidebar/SessionRail.tsx, apps/desktop/src/styles.css, apps/desktop/src/taskboard/TaskBoardPage.tsx, apps/desktop/tests/desktopPerformanceContract.test.ts, apps/desktop/tests/taskBoardRendered.test.tsx, docs/sdlc/changes/2026-08-31-desktop-motion-and-performance
next_trigger: human review of native responsiveness and motion when a safe profile is available; no release is requested
verification_mode: owner
verified_by: codex
verified_at: 2026-08-31
---

# Repair desktop motion and interaction performance

## Intent

The user reported that C2 feels slow and separated the symptom into two visible paths: some pages
have no entrance feedback, while other animation paths drop frames. The follow-up explicitly
requires a broader application-performance investigation rather than treating added animation as
the performance fix.

The measured baseline separates four concerns. The current native instance is quiet while idle,
with the renderer and Core each remaining around 0–0.5% CPU after instrumentation stops, so this
change does not pursue a speculative background polling rewrite. The old task board rendered all
141 tasks and produced a cold-open hitch trace with a 25 ms median render interval, 29.17 ms p95,
and a 54.17 ms maximum. The current progressive board renders three cards per lane by default and
improves that cold trace to 8.33 ms median, 16.67 ms p95, and 33.33 ms maximum, but its whole-page
translated entrance still produces a small cold-render tail. The current renderer entry is 4.58 MB
raw and 1.37 MB gzip while optional full-page modules are statically imported. Task-board, pull-
request, and plugin searches also filter their complete collections on the urgent input update.

This change fixes those measured paths without changing Core protocols, persisted data, page
information architecture, or release behavior. It preserves the existing three-card progressive
task-board contract and Reduced Motion behavior.

## Spec

Optional full-page product surfaces load on demand instead of joining the initial renderer entry.
The persistent session workspace remains available while a page chunk resolves, with a small
accessible loading state rather than an empty frame. Page modules share one entrance-motion role:
an opacity-only compositor transition for data-heavy pages, using the documented 280 ms page
duration and entrance curve. No full-page data surface translates its painted contents during
entry. Reduced Motion continues to collapse semantic durations.

Search inputs update immediately while collection filtering may use React's deferred value. The
task board, pull-request page, and plugin manager must present results for the latest settled query
without blocking keystroke feedback. Long session-rail rows may defer off-screen paint with an
intrinsic-size contract, but all rows remain in the semantic and keyboard navigation order.

Rollback is a repository revert of this change's lazy page boundary, shared motion class, deferred
search values, session-row containment, tests, and Artifact edits.

### Acceptance criteria

- [x] AC-1: Optional Task board, Pull requests, Automations, Plugins, and Docker page implementations are
  absent from the initial renderer module and load only when requested.
- [x] AC-2: All five full-page routes expose the same shared page entrance class; the class animates only
  opacity and never translates a full data surface.
- [x] AC-3: Reduced Motion disables the page entrance through the existing semantic-duration contract.
- [x] AC-4: Task-board, pull-request, and plugin search filtering consumes a deferred query while the
  controlled input retains the immediate query.
- [x] AC-5: The task board still renders at most three initial cards per lane for a large persisted board.
- [x] AC-6: Off-screen session rows defer rendering work without removing sessions from DOM, keyboard,
  or accessibility order.
- [x] AC-7: The renderer entry shows a measurable raw and gzip reduction from the 4,575,989 byte and
  1,368,081 byte baseline, and route chunks are visible in the build output.
- [x] AC-8: Focused tests, type checking, renderer build, lint, SDLC checks, diff checks, console
  checks, and rendered route/search interaction verification pass.
- [x] AC-9: Browser frame sampling keeps repeated route transitions below a 33 ms long-frame ceiling;
  native WebKit evidence is reported separately when the current checkout can be launched without
  violating the single-profile ownership rule.

## Decision and gates

The user explicitly approved implementation and then required the performance investigation to be
completed as part of the same request. The repository's existing motion tokens, progressive task
board, React lazy loading, deferred values, and CSS containment are sufficient; no new animation
library or virtualization dependency is approved. Merge, release, deployment, and termination of
another live C2 process remain separate human Gates.

## Plan

1. Lock the page-motion, lazy-route, deferred-search, progressive-board, and off-screen-row
   contracts with focused tests.
2. Add a small shared page loading boundary and move optional full-page implementations behind
   lazy imports.
3. Replace translated data-page entrances with the shared opacity-only motion and defer the three
   measured search filters.
4. Apply safe paint containment to session rows, then run deterministic build-size and rendered
   interaction measurements.

## Build

Implemented five lazy full-page route boundaries with an accessible Suspense fallback, one shared
opacity-only data-page entrance, deferred filtering for task-board, pull-request, and plugin
search, and off-screen paint containment for session-rail rows. Pull-request avatars now use lazy
image loading and asynchronous decoding. The large-board three-card-per-lane behavior remains
unchanged.

## Verification

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

## Review and release

Approval: pending human responsiveness and motion review.
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
