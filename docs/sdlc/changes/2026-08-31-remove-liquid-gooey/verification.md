---
id: "2026-08-31-remove-liquid-gooey"
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

# Verification: Remove the liquid interaction renderer

## Automated checks

Verdict: verified.

### Acceptance evidence

- AC-1: PASS — `bun install --lockfile-only` and `bun test tests/desktopPerformanceContract.test.ts` verified the package and lockfile contain no `liquid-gooey` entry.
- AC-2: PASS — repository source scan plus `bun test tests/desktopPerformanceContract.test.ts` found no liquid wrapper, observer, layout-measurement, SVG filter, or plugin attribute in the interaction surfaces.
- AC-3: PASS — the `bun run build:renderer` output passed rendered dark, light, and 760 px verification with visible default, line, and toolbar tab selection using direct CSS state.
- AC-4: PASS — `bun test tests/desktopPerformanceContract.test.ts` and rendered rail verification confirmed active selection without observer availability checks.
- AC-5: PASS — `bun test tests/composerGeometryContract.test.ts` and rendered composer interaction verified direct run and stop controls, loading, tooltip, keyboard, and Reduced Motion behavior.
- AC-6: PASS — 780 full-suite tests, `bunx tsc --noEmit`, renderer build, lint, SDLC checks, `git diff --check`, and dark, light, and narrow browser verification passed.

The failure baseline correctly caught the package, liquid wrappers, DOM observers, and active-row
fallback. After deletion, the focused performance, composer, and task-board checks pass with 24
tests and 139 assertions, and the focused SessionRail suite passes with 23 tests and 228
assertions. The complete desktop suite passes with 780 tests, 3,724 assertions, and zero failures.
Type checking, lint, the production renderer build, the documentation and SDLC contracts, and diff
whitespace checks pass. The suite continues to print its existing React `act(...)` warnings, and
Vite continues to report its existing large-chunk advisory; neither is a test or build failure.

Rendered browser verification covered the direct composer Run button, Docker line tabs, the
default Design System tabs, plugin-manager toolbar tabs, dark theme, light theme, and a 760 by 720
narrow viewport. The selected states remained visible, the narrow page had no document-level
horizontal overflow, and the console contained no warnings or errors. Runtime inspection found
zero `svg filter` elements and zero plugin-specific nodes. The temporary viewport override and
theme were returned to their defaults after verification.

The earlier 200-row A/B probe measured the removed selection path at 78 layouts, 89 style
recalculations, and 57.286 ms of task time for one selection, versus zero layouts, zero style
recalculations, and 3.026 ms for the equivalent direct CSS state now used by the rail.

Residual risk: native WebKit was not relaunched because the default C2 profile is owned by the
user's live instance. Verification used an isolated renderer-only server, so it did not contend for
SQLite, provider cursors, sockets, or automation state. The production output still includes a
small `liquid-*.js` Shiki grammar for the Liquid template language; it is unrelated to the removed
`liquid-gooey` interaction package, which is absent from source, dependencies, lockfile, and dist.

## Behavioral evidence

Verdict: verified.

### Acceptance evidence

- AC-1: PASS — `bun install --lockfile-only` and `bun test tests/desktopPerformanceContract.test.ts` verified the package and lockfile contain no `liquid-gooey` entry.
- AC-2: PASS — repository source scan plus `bun test tests/desktopPerformanceContract.test.ts` found no liquid wrapper, observer, layout-measurement, SVG filter, or plugin attribute in the interaction surfaces.
- AC-3: PASS — the `bun run build:renderer` output passed rendered dark, light, and 760 px verification with visible default, line, and toolbar tab selection using direct CSS state.
- AC-4: PASS — `bun test tests/desktopPerformanceContract.test.ts` and rendered rail verification confirmed active selection without observer availability checks.
- AC-5: PASS — `bun test tests/composerGeometryContract.test.ts` and rendered composer interaction verified direct run and stop controls, loading, tooltip, keyboard, and Reduced Motion behavior.
- AC-6: PASS — 780 full-suite tests, `bunx tsc --noEmit`, renderer build, lint, SDLC checks, `git diff --check`, and dark, light, and narrow browser verification passed.

The failure baseline correctly caught the package, liquid wrappers, DOM observers, and active-row
fallback. After deletion, the focused performance, composer, and task-board checks pass with 24
tests and 139 assertions, and the focused SessionRail suite passes with 23 tests and 228
assertions. The complete desktop suite passes with 780 tests, 3,724 assertions, and zero failures.
Type checking, lint, the production renderer build, the documentation and SDLC contracts, and diff
whitespace checks pass. The suite continues to print its existing React `act(...)` warnings, and
Vite continues to report its existing large-chunk advisory; neither is a test or build failure.

Rendered browser verification covered the direct composer Run button, Docker line tabs, the
default Design System tabs, plugin-manager toolbar tabs, dark theme, light theme, and a 760 by 720
narrow viewport. The selected states remained visible, the narrow page had no document-level
horizontal overflow, and the console contained no warnings or errors. Runtime inspection found
zero `svg filter` elements and zero plugin-specific nodes. The temporary viewport override and
theme were returned to their defaults after verification.

The earlier 200-row A/B probe measured the removed selection path at 78 layouts, 89 style
recalculations, and 57.286 ms of task time for one selection, versus zero layouts, zero style
recalculations, and 3.026 ms for the equivalent direct CSS state now used by the rail.

Residual risk: native WebKit was not relaunched because the default C2 profile is owned by the
user's live instance. Verification used an isolated renderer-only server, so it did not contend for
SQLite, provider cursors, sockets, or automation state. The production output still includes a
small `liquid-*.js` Shiki grammar for the Liquid template language; it is unrelated to the removed
`liquid-gooey` interaction package, which is absent from source, dependencies, lockfile, and dist.

## Visual evidence

See bundle evidence/ when present.

## Security and privacy evidence

Not separately recorded unless present in legacy Verification.

## Deviations and residual risk

Residual risk: native WebKit was not relaunched because the default C2 profile is owned by the

## Verdict

Verdict: verified..

## Review and release

Approval: [user] approved on 2026-08-31. human review.
Release target: none.
Release identity: not applicable until released.
Smoke evidence: not applicable until released.
Rollback: revert this change's repository diff.
No release: no release or deployment was requested.

## Feedback

The user explicitly rejected leaving the high-cost liquid path in place and requested complete
removal. The implementation therefore deletes the dependency and compatibility layers instead of
adding another availability flag or tuning its animation parameters.
