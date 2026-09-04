---
id: "2026-08-31-codex-design-system"
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

# Spec: Align the desktop design system with Codex

## Requirements

The accepted product law is [the C2 design system](../../../design/system.md), informed by the
[Codex typography inventory](../../../archive/research/codex-app-typography-layout-2026-08-31.md).
Persistent planes remain quiet and solid. Menus, popovers, tooltips, and dialogs use the shared
raised-material tokens with restrained translucency, blur, hairline, and shadow. Typography,
spacing, radii, control heights, state colors, and accessibility preferences resolve through shared
tokens and components. Product-owned buttons, textareas, tabs, radio choices, selectable rows, and
notices must use the managed component layer.

Standard ESLint and Stylelint rules enforce source-level boundaries. Repository-specific scanners,
generated debt baselines, and broad allowlists are intentionally not part of the final architecture.

## User experience

Not separately recorded in legacy change.md.

## Technical design

See Requirements and legacy Git history.

## Security and privacy

See migrated Decision and gates.

## Alternatives and non-goals

Not separately recorded in legacy change.md.

## Areas of concern

The user approved Intent and iterative implementation in the current conversation. The accepted
design direction is the Codex desktop density with the user's color, shadow, and glass feedback.
Security, data, merge, release, deployment, and production Gates are not granted by this change.

## Acceptance criteria

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

## Decision

The user approved Intent and iterative implementation in the current conversation. The accepted
design direction is the Codex desktop density with the user's color, shadow, and glass feedback.
Security, data, merge, release, deployment, and production Gates are not granted by this change.
