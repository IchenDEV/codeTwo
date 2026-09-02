---
id: "2026-08-29-session-header-toolbar-unification"
stage: plan
schema: 3
status: accepted
owner: codex
created: 2026-08-29
based_on: spec.md
risk: low
scope: apps/desktop, docs/design/system.md
approved_by: "#decision-and-gates"
approved_at: "2026-08-29"
---

# Plan: Unify the session titlebar toolbar

## Files and ownership

apps/desktop, docs/design/system.md

## Order of work

Normalize the existing titlebar controls in place: use one neutral ghost treatment, preserve a
neutral selected state, align the pane buttons with the shared Button primitive, and wrap the
right-side controls in one 4px toolbar cluster. Add narrow contract assertions, document the
titlebar rule, then verify the real renderer at desktop and constrained widths in both appearances.
Rollback is the inverse source change.

## Test-first proof

See legacy Verification section.

## Visual or integration proof

See legacy Verification section.

## Risks and mitigations

See legacy Decision and gates.

## Rollback

See legacy Review and release.

## Deviations

The session action buttons, environment trigger, pane controls, panel toggle, and header plugin
actions now share the gray ghost treatment. Environment and panel selected states use the existing
neutral fill without changing icon color. Pane controls now consume the shared Button primitive at
28px, and the entire right-side titlebar is one 4px toolbar cluster. Both split groups explicitly
retain a zero-width inner gap and semantic 8px horizontal padding.

## Decision

Intent and design acceptance come directly from the user's 2026-08-29 titlebar feedback. No
permission to create a PR, merge, publish, or release is implied.
