---
id: change-2026-08-31-codex-design-system
kind: change
schema: 2
status: verified
risk: medium
owner: codex
approvers: [user]
approved_at: 2026-08-31
created: 2026-08-31
updated: 2026-08-31
source: direct user requests and visual feedback in the 2026-08-31 design-system review
inputs: docs/design/system.md, docs/archive/research/codex-app-typography-layout-2026-08-31.md, and the live component preview
outputs: Codex-aligned typography and theme tokens, shared controls and business patterns, migrated desktop call sites, lint enforcement, and an expanded design-system preview
scope: apps/desktop/src, apps/desktop/tests, apps/desktop/eslint.config.mjs, docs/design/system.md, docs/archive/research/codex-app-typography-layout-2026-08-31.md
next_trigger: deterministic verification completes and the Draft PR is ready for human design review
verification_mode: owner
verified_by: codex
verified_at: 2026-08-31
---

# Align the desktop design system with Codex

## Intent

The desktop UI mixed compact legacy metrics, page-local colors and radii, raw controls, manual
widget roles, native title tooltips, and one-off card or menu surfaces. The user asked to match the
comfortable density of the Codex desktop app, centralize every component under one theme system,
lighten heavy surfaces and shadows, and add restrained translucent material to transient menus.

The desired result is one semantic typography and geometry engine, one theme contract for light
and dark appearance, and shared primitives or business patterns at product call sites. Provider
protocols, persistence, data migrations, releases, and deployment are out of scope.

## Spec

The accepted product law is [the C2 design system](../../../design/system.md), informed by the
[Codex typography inventory](../../../archive/research/codex-app-typography-layout-2026-08-31.md).
Persistent planes remain quiet and solid. Menus, popovers, tooltips, and dialogs use the shared
raised-material tokens with restrained translucency, blur, hairline, and shadow. Typography,
spacing, radii, control heights, state colors, and accessibility preferences resolve through shared
tokens and components. Product-owned buttons, textareas, tabs, radio choices, selectable rows, and
notices must use the managed component layer.

Standard ESLint and Stylelint rules enforce source-level boundaries. Repository-specific scanners,
generated debt baselines, and broad allowlists are intentionally not part of the final architecture.

### Acceptance criteria

- [x] AC-1: `bun run lint` rejects raw product buttons and textareas, inline radii, and restricted
  radius utilities while the maintained source passes.
- [x] AC-2: Type checking and the desktop test suite pass with the latest `main` functionality
  preserved.
- [x] AC-3: The renderer production build succeeds and emits the semantic theme and typography
  utilities.
- [x] AC-4: The repository lifecycle and diff checks pass with no stale scanner or debt-baseline
  dependency.
- [x] AC-5: The design preview remains available for human review in light and dark appearance;
  merge and release remain separate human Gates.

## Decision and gates

The user approved Intent and iterative implementation in the current conversation. The accepted
design direction is the Codex desktop density with the user's color, shadow, and glass feedback.
Security, data, merge, release, deployment, and production Gates are not granted by this change.

## Plan

1. Define semantic typography, theme, spacing, geometry, elevation, and accessibility tokens.
2. Deepen shared primitives and business patterns, then migrate confirmed unmanaged callers.
3. Rebase onto current `main`, preserve newer application behavior, and express enforceable rules
   through ESLint and Stylelint.
4. Run lint, types, tests, build, lifecycle, diff, and rendered-preview checks.
5. Publish a Draft PR for human design review without merging it.

## Build

Implementation is complete on `codex/codex-aligned-design-system`. Material changes include the
semantic typography and theme modules, comfortable control geometry, shared TooltipButton,
RadioGroup and ChoiceRow families, shared selectable/detail patterns, translucent raised layers,
and product call-site migrations. During rebase, the obsolete custom design checker and its
allowlist/baseline were removed in favor of the current repository lint architecture.

## Verification

Verdict: verified.

The implementation satisfies the accepted source, type, test, build, lifecycle, and review-surface
criteria. Merge, release, and deployment remain outside this verdict.

### Acceptance evidence

- AC-1: PASS — `bun run lint` passed. ESLint and Stylelint report zero warnings, and product JSX has no raw
  `<button>` call sites. Canvas test fixtures and the isolated generated-visualization HTML template
  remain explicit non-product-component boundaries.
- AC-2: PASS — `bunx tsc --noEmit` passed. `bun test` passed 774 tests across 134 files with zero failures.
- AC-3: PASS — `bun run build:renderer` passed after transforming 6,426 modules; Vite completed the
  production renderer build in 21.23 seconds.
- AC-4: PASS — `bun script/verify/sdlc.ts` and `git diff --check` passed. The retired custom design scanner,
  allowlist, and debt baseline are absent from the final architecture.
- AC-5: PASS — [DesignSystemPreview.tsx](../../../../apps/desktop/src/design/DesignSystemPreview.tsx)
  remains available at `http://127.0.0.1:1421/?design-system=1#components` for light/dark human
  review.

Residual risk: final visual judgment across all product screens and Windows font rendering remain
human review items. The renderer build also retains its pre-existing large-chunk warnings; this
change does not expand into bundle architecture. No merge, release, or deployment is authorized.

## Review and release

Approval: pending human review in the Draft PR and design preview.
Release target: none.
Release identity: not applicable until released.
Smoke evidence: not applicable until released.
Rollback: revert the design-system commit and its shared-token, component, caller, lint,
documentation, and test changes.
No release: this PR prepares implementation for review; no release or deployment was requested.

Preparing this section does not authorize merge, deployment, release, or production mutation.

## Feedback

This change consolidates the user's iterative feedback on typography density, elevation, color,
managed controls, translucent menus, and continued unmanaged-component audits. Further visual
feedback will be recorded against this change or a follow-up Artifact after review.
