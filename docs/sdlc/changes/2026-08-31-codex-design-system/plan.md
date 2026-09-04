---
id: "2026-08-31-codex-design-system"
stage: plan
schema: 3
status: accepted
owner: codex
created: 2026-08-31
based_on: spec.md
risk: medium
scope: apps/desktop/src, apps/desktop/tests, apps/desktop/eslint.config.mjs, docs/design/system.md, docs/archive/research/codex-app-typography-layout-2026-08-31.md
approved_by: "[user]"
approved_at: "2026-08-31"
---

# Plan: Align the desktop design system with Codex

## Files and ownership

apps/desktop/src, apps/desktop/tests, apps/desktop/eslint.config.mjs, docs/design/system.md, docs/archive/research/codex-app-typography-layout-2026-08-31.md

## Order of work

1. Define semantic typography, theme, spacing, geometry, elevation, and accessibility tokens.
2. Deepen shared primitives and business patterns, then migrate confirmed unmanaged callers.
3. Rebase onto current `main`, preserve newer application behavior, and express enforceable rules
   through ESLint and Stylelint.
4. Run lint, types, tests, build, lifecycle, diff, and rendered-preview checks.
5. Publish a Draft PR for human design review without merging it.

## Test-first proof

See legacy Verification section.

## Visual or integration proof

See legacy Verification section.

## Risks and mitigations

See legacy Decision and gates.

## Rollback

See legacy Review and release.

## Deviations

Implementation is complete on `codex/codex-aligned-design-system`. Material changes include the
semantic typography and theme modules, comfortable control geometry, shared TooltipButton,
RadioGroup and ChoiceRow families, shared selectable/detail patterns, translucent raised layers,
and product call-site migrations. During rebase, the obsolete custom design checker and its
allowlist/baseline were removed in favor of the current repository lint architecture.

## Decision

The user approved Intent and iterative implementation in the current conversation. The accepted
design direction is the Codex desktop density with the user's color, shadow, and glass feedback.
Security, data, merge, release, deployment, and production Gates are not granted by this change.
