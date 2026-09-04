---
id: "2026-09-01-floating-pr-inspector"
stage: spec
schema: 3
status: accepted
owner: codex
created: 2026-09-01
based_on: intent.md
risk: low
approved_by: "userthe 2026-09-01 request to start implementing the approved floating Inspector"
approved_at: "2026-09-01"
---

# Spec: Promote the floating PR Inspector

## Requirements

At widths above 960px, the trailing Inspector remains in its existing reserved grid column and is
inset 12px from the top, right, and bottom. It uses the established surface, border, modal radius,
and raised-elevation tokens. The leading edge remains aligned with its reserved column so primary
content width and existing hierarchy match the approved prototype. At or below 960px the Inspector
continues to hide before the list/detail compact transition.

The UI Lab PR Workspace renders this production behavior directly. Prototype query-state parsing,
the A/B/C switcher, overlay styles, and prototype-specific tests/layout metadata are removed.

## User experience

Not separately recorded in legacy change.md.

## Technical design

See Requirements and legacy Git history.

## Security and privacy

See migrated Decision and gates.

## Alternatives and non-goals

Not separately recorded in legacy change.md.

## Areas of concern

The user's direct request after reviewing the prototype accepts Intent, Spec, and the visual design
Gate for production implementation. Codex owns implementation and owner verification. The user's
later `pr` request authorizes creating a branch, pushing this verified scope, and opening a Draft
PR. Merge, release, deployment, and production-environment mutation remain unauthorized.

## Acceptance criteria

- [x] AC-1: The production Pull requests page renders its trailing Inspector as the selected
      reserved floating card without changing its content, semantics, width bounds, or actions.
- [x] AC-2: At or below 960px the Inspector still hides before the existing 704px list/detail
      transition, with no horizontal overflow in desktop or compact UI Lab rendering.
- [x] AC-3: The permanent UI Lab renders the production PR Workspace without variant query state,
      prototype switcher UI, or prototype-only CSS and layout contracts.
- [x] AC-4: Focused tests, full desktop tests, renderer build, documentation and SDLC Gates, and
      rendered dark/light/narrow inspection pass with no relevant console errors.

## Decision

The user's direct request after reviewing the prototype accepts Intent, Spec, and the visual design
Gate for production implementation. Codex owns implementation and owner verification. The user's
later `pr` request authorizes creating a branch, pushing this verified scope, and opening a Draft
PR. Merge, release, deployment, and production-environment mutation remain unauthorized.
