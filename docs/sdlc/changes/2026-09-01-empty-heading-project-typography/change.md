---
id: change-2026-09-01-empty-heading-project-typography
kind: change
schema: 2
status: verified
risk: low
owner: codex
approvers: user via direct screenshot feedback on 2026-09-01
approved_at: 2026-09-01
created: 2026-09-01
updated: 2026-09-01
source: direct user report that the project name does not match the surrounding empty-task heading
inputs: the empty-task greeting and its existing project dropdown trigger
outputs: one typographically continuous interactive heading with balanced spacing around the project name
scope: apps/desktop/src/App.tsx, apps/desktop/tests/composerGeometryContract.test.ts, docs/sdlc/changes/2026-09-01-empty-heading-project-typography
next_trigger: human review; merge, release, and deployment remain unauthorized
verification_mode: owner
verified_by: codex
verified_at: 2026-09-01
---

# Match the empty-heading project typography

## Intent

The empty Task screen embeds the current Project as a dropdown trigger inside its greeting. The
shared Button typography currently remains smaller and lighter than the surrounding heading, and
the following Chinese phrase has no explicit separating space. The user requested that this inline
Project name match the title instead of reading like an unrelated control.

## Spec

- The Project trigger inherits the heading's font size, line height, weight, and letter spacing.
- The greeting keeps balanced spacing before and after the interactive Project name.
- The existing Project dropdown, focus behavior, selection, and empty-project fallback remain intact.
- No shared Button variant or unrelated composer typography changes.

### Acceptance criteria

- [x] AC-1: Computed Project-trigger typography matches the containing empty-state heading.
- [x] AC-2: The Project name is visually separated from both surrounding greeting fragments.
- [x] AC-3: The Project dropdown remains accessible and interactive.
- [x] AC-4: Focused tests, renderer build, Browser QA, repository Gates, and a rebuilt native window pass.

## Decision and gates

The user directly approved this correction. Ponytail selected the smallest shared-seam fix: override
only the inline trigger's inherited typography and add the missing whitespace. The shared Button
component, heading size, dropdown implementation, and layout remain unchanged.

This is low risk because it changes presentation on one empty-state trigger without changing data or
execution. Merge, release, and deployment are not authorized.

## Plan

1. Add a focused contract for inherited trigger typography and balanced spacing.
2. Apply the minimum class and whitespace correction in the existing greeting.
3. Verify computed styles, dropdown interaction, build/Gates, and the rebuilt native window.

Rollback removes the inline typography overrides and trailing whitespace only.

## Build

The existing inline Project Button now explicitly inherits the containing heading's font size,
weight, letter spacing, and line height. The previous `text-inherit` remains responsible only for
color inheritance. One explicit whitespace node was added after the dropdown so the Chinese
greeting has balanced separation around the Project name. The shared Button component, dropdown,
heading measure, and Project-selection behavior were not changed.

The PR #218 Windows follow-up normalizes source text only at this contract test's read boundary.
Product source and runtime behavior remain unchanged; the regression covers CRLF and legacy CR
inputs so multiline assertions have the same meaning on every checkout platform.

## Verification

Verdict: verified

### Acceptance evidence

- AC-1: PASS — the `Browser computed-style probe` initially measured the heading at
  `26px / 39px / 600` and the trigger at `14px / 20px / 500`; after the correction both measured
  `26px / 39px / 600`, with identical letter spacing and top/bottom bounds.
- AC-2: PASS — `bun test tests/composerGeometryContract.test.ts` passed 6 tests and 37 assertions,
  including the explicit whitespace after the dropdown. The rebuilt Chinese native window rendered
  `在 codeTwo 里做点什么？` with balanced separation. The added source-normalization regression
  passes for LF, CRLF, and CR input.
- AC-3: PASS — `Browser click QA` clicked the heading trigger and observed the Project dropdown menu open.
  The page remained nonblank, no framework overlay appeared, and console warnings/errors were empty.
- AC-4: PASS — `bun test` passed 844 tests and 5,032 assertions; the Electrobun watcher completed
  ESLint, Stylelint, TypeScript, Vite, native packaging, and relaunch. `bun script/verify/docs.ts`,
  both SDLC checks, and `bun test script/verify/checks.test.ts` passed. The rebuilt native window
  showed the corrected Chinese heading with one Core listening on port 50000. After the Windows CI
  portability fix, the current full desktop suite passed 861 tests and 5,114 assertions.

Residual risk: very long Project names may still force the full heading to wrap; this change preserves
the existing wrapping behavior and only makes the interactive text typographically continuous.

## Review and release

Draft PR: [#218](https://github.com/IchenDEV/codeTwo/pull/218).
Approval: the user approved implementation on 2026-09-01.
Release target: none.
Release identity: not applicable until released.
Smoke evidence: not applicable until released.
Rollback: remove the scoped presentation change.
No release: no merge, release, or deployment was requested.

## Feedback

The user supplied a native-window crop showing that `codeTwo` rendered substantially smaller than
the surrounding Chinese heading and touched the following phrase. PR #218 later exposed a Windows
failure because this contract compared an LF-only multiline literal with CRLF source text; the
test read boundary now makes the contract platform-neutral.
