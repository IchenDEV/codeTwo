---
id: change-2026-08-31-remove-liquid-gooey
kind: change
schema: 2
status: verified
risk: medium
owner: codex
approvers: [user]
approved_at: 2026-08-31
created: 2026-08-31
updated: 2026-08-31
source: current user request and the element-level measurements recorded during the desktop performance investigation
inputs: apps/desktop/package.json, apps/desktop/bun.lock, apps/desktop/src/components/ui/tabs.tsx, apps/desktop/src/sidebar/SessionRail.tsx, apps/desktop/src/session/Composer.tsx, apps/desktop/src/session/SideChatPanel.tsx, docs/sdlc/changes/2026-08-31-desktop-motion-and-performance/change.md
outputs: deleted liquid-gooey dependency and implementation, native CSS selected states, focused regression tests, and rendered verification evidence
scope: apps/desktop/bun.lock, apps/desktop/package.json, apps/desktop/src/components/ui/tabs.tsx, apps/desktop/src/session/Composer.tsx, apps/desktop/src/session/SideChatPanel.tsx, apps/desktop/src/sidebar/SessionRail.tsx, apps/desktop/src/styles.css, apps/desktop/tests/composerGeometryContract.test.ts, apps/desktop/tests/desktopPerformanceContract.test.ts, docs/sdlc/changes/2026-08-30-quiet-session-rail-items/change.md, docs/sdlc/changes/2026-08-31-remove-liquid-gooey
next_trigger: human review of the simplified selection and run controls; no release is requested
verification_mode: owner
verified_by: codex
verified_at: 2026-08-31
---

# Remove the liquid interaction renderer

## Intent

The user asked to completely remove the liquid plugin after element-level profiling identified it
as a major source of interaction latency. In a 200-row selection harness, one selection using the
current liquid path caused 78 layouts, 89 style recalculations, and 57.286 ms of task time; the
plain selected-state path caused no layouts or style recalculations and 3.026 ms of task time.

This change removes the dependency and every runtime wrapper, SVG filter, observer, measurement,
fallback flag, and plugin-specific attribute. Session selection, tabs, and composer run/stop
controls retain visible, accessible state using the existing C2 tokens and native CSS. It does not
redesign those controls or change unrelated application motion.

## Spec

The desktop package and lockfile must not contain `liquid-gooey`. Source code must not retain a
liquid compatibility component or plugin-specific attribute. Tabs must express their selected
state directly on the tab trigger; the session rail must express the active state directly on the
row; run and stop buttons must render directly inside their tooltips. These paths must not create
DOM mutation or resize observers, read layout to place an indicator, or construct SVG goo filters.

Rollback is a repository revert of this change's package, lockfile, component, test, and Artifact
edits.

### Acceptance criteria

- [x] AC-1: The desktop manifest and lockfile contain no `liquid-gooey` package entry.
- [x] AC-2: Desktop source contains no liquid import, wrapper, compatibility flag, plugin attribute, or
  SVG goo-filter implementation.
- [x] AC-3: Tabs preserve visible default, line, and toolbar selected states using tokenized CSS only.
- [x] AC-4: The active session row preserves its visible selected state independently of observer support.
- [x] AC-5: Composer run and stop buttons preserve their enabled, disabled, loading, tooltip, keyboard,
  and Reduced Motion behavior without a liquid wrapper.
- [x] AC-6: Focused tests, the complete desktop suite, type checking, renderer build, lint, SDLC
  checks, diff checks, and rendered dark, light, and narrow-window verification pass.

## Decision and gates

The user's implementation request approves Intent and deletion. Existing Base UI state attributes,
C2 color tokens, and CSS transitions are sufficient; no replacement animation dependency is
approved. Merge, release, deployment, and termination of a live C2 process remain separate human
Gates.

## Plan

1. Add a deletion contract and reproduce its failure against the current dependency and wrappers.
2. Delete the package and all liquid-specific code, then restore selected states with native CSS.
3. Run focused and full automated verification plus a production renderer build.
4. Verify the affected surfaces in dark, light, and narrow rendered states and record the verdict.

## Build

Removed `liquid-gooey` from the desktop manifest and lockfile. Deleted the shared liquid indicator,
its mutation and resize observers, layout measurements, SVG filter path, availability flag, and
selection wrapper from the Tabs primitive. Tabs now paint default and toolbar fills directly from
their active state and use a transform-only pseudo-element for the line variant.

The session list is now a plain container and the active row owns its tokenized background without
checking observer availability. Composer run and stop buttons render directly through the existing
Button and Tooltip primitives; the liquid action wrapper, plugin attributes, custom reduced-motion
listener, transparent-button overrides, and compatibility flag are gone.

Added a deletion contract covering the manifest, lockfile, three runtime surfaces, and the removed
observer/layout-measurement implementation. Updated the existing composer geometry contract to
assert the direct-button implementation.

## Verification

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

## Review and release

Approval: pending human review.
Release target: none.
Release identity: not applicable until released.
Smoke evidence: not applicable until released.
Rollback: revert this change's repository diff.
No release: no release or deployment was requested.

## Feedback

The user explicitly rejected leaving the high-cost liquid path in place and requested complete
removal. The implementation therefore deletes the dependency and compatibility layers instead of
adding another availability flag or tuning its animation parameters.
