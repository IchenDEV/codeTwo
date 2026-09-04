---
id: "2026-08-31-radius-compliance"
stage: spec
schema: 3
status: accepted
owner: codex
created: 2026-08-31
based_on: intent.md
risk: medium
approved_by: "[user]"
approved_at: "2026-08-31"
---

# Spec: Enforce the product radius scale everywhere

## Requirements

All production radius call sites must use semantic utilities or variables rather than legacy
`rounded`, size-named Tailwind radius utilities, direct `--ds-radius-*` arbitrary utilities, or
magic numeric values. Joined edges and straight indicators may use 0. True circular dots and
square icon controls may remain fully round; tracks, progress bars, switches, pills, badges, and
other non-square shapes use the 12px control radius and rely on CSS clamping at small heights.

Standalone renderer surfaces that cannot inherit the app token sheet define exact 12px control and
16px module fallbacks. Standard ESLint and Stylelint rules must detect legacy bare radius utilities
and non-semantic maintained CSS radius declarations so the cleaned debt cannot silently return.
Existing unrelated worktree changes remain intact.

## User experience

Not separately recorded in legacy change.md.

## Technical design

See Requirements and legacy Git history.

## Security and privacy

See migrated Decision and gates.

## Alternatives and non-goals

Not separately recorded in legacy change.md.

## Areas of concern

The user's direct implementation request accepts Intent and the visible radius hierarchy. The
repository's existing semantic token system and current UI documentation are the design source of
truth. Human review remained the next Gate after verification. The user accepted that Gate and
authorized PR creation and merge on 2026-08-31. Release, deployment, and production mutation remain
unauthorized.

## Acceptance criteria

- [x] AC-1: Repository source contains no legacy size-named or bare Tailwind radius utilities, direct
      product radius escape hatches, undersized numeric fallbacks, or non-circular `rounded-full`
      uses in the maintained desktop UI.
- [x] AC-2: App, Remote, Canvas, annotation, visualization, Side Chat/Quick Chat, and shared UI source
      contracts resolve to 0/12/16/24 according to their semantic role; the live app and shared
      primitive preview preserve that hierarchy in light and dark themes.
- [x] AC-3: ESLint, Stylelint, and focused tests reject reintroduced legacy and maintained-CSS hardcoded
      radius values, with current radius-specific design debt reduced to zero.
- [x] AC-4: Focused tests, renderer build, SDLC validation, diff hygiene, and real light/dark plus narrow
      rendered inspection pass without radius regressions or relevant console errors.

## Decision

The user's direct implementation request accepts Intent and the visible radius hierarchy. The
repository's existing semantic token system and current UI documentation are the design source of
truth. Human review remained the next Gate after verification. The user accepted that Gate and
authorized PR creation and merge on 2026-08-31. Release, deployment, and production mutation remain
unauthorized.
