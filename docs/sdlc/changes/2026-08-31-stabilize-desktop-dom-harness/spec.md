---
id: "2026-08-31-stabilize-desktop-dom-harness"
stage: spec
schema: 3
status: accepted
owner: codex
created: 2026-08-31
based_on: intent.md
risk: low
approved_by: "[user]"
approved_at: "2026-08-31"
---

# Spec: Stabilize the desktop DOM test harness

## Requirements

The shared DOM harness must expose the browser `Element.getAnimations()` shape required by Base UI.
Because happy-dom does not simulate Web Animations, the fallback returns an empty animation list.
The fallback must stay scoped to the harness-owned window and must not replace a native
implementation if happy-dom adds one later. The harness must also delegate animation-frame work to
happy-dom's scheduler instead of converting every frame into a zero-delay timer, which can make a
floating-position update loop monopolize Linux test execution.

## User experience

Not separately recorded in legacy change.md.

## Technical design

See Requirements and legacy Git history.

## Security and privacy

See migrated Decision and gates.

## Alternatives and non-goals

Not separately recorded in legacy change.md.

## Areas of concern

The user's direct CI repair request accepts this low-risk test-infrastructure Intent. Pushing the
fix to the existing PR is authorized by that request. Merge, release, and deployment remain pending
separate Gates.

## Acceptance criteria

- [x] AC-1: A harness-owned element exposes `getAnimations()` and returns an empty animation list.
- [x] AC-2: The Bun 1.4.0 full desktop suite exits promptly on macOS and Linux without
      `viewport.getAnimations is not a function` or Popover timeout failures.
- [x] AC-3: The renderer build and repository lifecycle checks pass with clean diff hygiene.
- [x] AC-4: PR 198's Desktop design system checks rerun successfully on Linux, macOS, and Windows.

## Decision

The user's direct CI repair request accepts this low-risk test-infrastructure Intent. Pushing the
fix to the existing PR is authorized by that request. Merge, release, and deployment remain pending
separate Gates.
