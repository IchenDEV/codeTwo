---
id: "2026-08-30-quiet-session-rail-items"
stage: plan
schema: 3
status: accepted
owner: codex
created: 2026-08-30
based_on: spec.md
risk: low
scope: apps/desktop
approved_by: "userthe 2026-08-30 sidebar requests and explicit PR merge authorization"
approved_at: "2026-08-30"
---

# Plan: Quiet the session rail items

## Files and ownership

apps/desktop

## Order of work

Refine the existing row in place, reuse the existing Button, context-menu, semantic status, and
selection-group primitives, and keep the rail's current width contract. Keep useful preview
copy as the conditional middle line, replace the visible provider/completed footer with workspace
identity, disclose actions on hover or focus, and retain urgent activity at the trailing edge.
Update only the focused rendered tests that protect this behavior, then validate source, renderer,
and lifecycle gates. Rollback is the inverse component and test change.

## Test-first proof

See legacy Verification section.

## Visual or integration proof

See legacy Verification section.

## Risks and mitigations

See legacy Decision and gates.

## Rollback

See legacy Review and release.

## Deviations

The session row now renders a conditional title/preview/workspace hierarchy. Useful latest
conversation text is a visible, truncated middle line and remains the row's accessible description
and native hover title. Empty, punctuation-only, or title-repeating previews are omitted, so those
rows collapse to title/workspace. Provider branding, age, and routine completed state remain out of
the resting row. Running, awaiting-input, and failed states use compact semantic indicators. Pin,
rename, and archive/restore controls appear on hover, keyboard focus, or popup-open state and remain
present in the existing native and rendered context menus.

## Decision

Intent and design acceptance come directly from the user's 2026-08-30 request and supplied
reference. The change is limited to the session item hierarchy and its focused regression tests.
No PR, merge, publication, or release permission is implied.
