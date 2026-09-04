---
id: "2026-08-29-empty-session-titlebar-divider"
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

# Plan: Hide the empty-session titlebar divider

## Files and ownership

apps/desktop, docs/design/system.md

## Order of work

Name the existing transcript-presence condition once per pane, expose it on the session header,
override only that header's box shadow, add a narrow contract assertion and design-law sentence,
then verify both divider states in the running renderer. Rollback is the inverse source change.

## Test-first proof

See legacy Verification section.

## Visual or integration proof

See legacy Verification section.

## Risks and mitigations

See legacy Decision and gates.

## Rollback

See legacy Review and release.

## Deviations

Each pane now names the existing transcript-presence condition once and exposes it through
`data-has-conversation` on the session header. The session header removes the global titlebar
shadow by default and restores the exact existing semantic hairline only for that content state.
The transcript and full-page transcript toggle consume the same condition. Other window titlebars
still use the global titlebar rule.

## Decision

Intent and design acceptance come directly from the user's 2026-08-29 rendered-page feedback. No
permission to create a PR, merge, publish, or release is implied.
