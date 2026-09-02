---
id: "2026-09-02-remove-transient-composer-focus-outline"
stage: plan
schema: 3
status: accepted
owner: codex
created: 2026-09-02
based_on: spec.md
risk: low
scope: apps/desktop/src/session/SideChatPanel.tsx, apps/desktop/tests/sideChatPanelRendered.test.tsx, docs/sdlc/changes/2026-09-02-remove-transient-composer-focus-outline
approved_by: "userthe direct 2026-09-02 Browser comment"
approved_at: "2026-09-02"
---

# Plan: Remove the transient composer blue focus outline

## Files and ownership

apps/desktop/src/session/SideChatPanel.tsx, apps/desktop/tests/sideChatPanelRendered.test.tsx, docs/sdlc/changes/2026-09-02-remove-transient-composer-focus-outline

## Order of work

1. Replace the transient card's blue `focus-within` outline with the existing neutral focus fill.
2. Update the existing Quick Chat and Side Chat rendered contract to prohibit the old ring.
3. Run the focused test, renderer checks, live dark/light and narrow Browser focus passes, and
   repository documentation/lifecycle Gates.

Rollback restores the prior shared class and test expectation. There is no data or protocol
rollback.

## Test-first proof

See legacy Verification section.

## Visual or integration proof

See legacy Verification section.

## Risks and mitigations

See legacy Decision and gates.

## Rollback

See legacy Review and release.

## Deviations

The shared transient composer now replaces its blue inset focus ring with the existing neutral
hover-fill token and color transition. The existing rendered contract covers both Quick Chat and
Side Chat and prohibits the removed ring. The main task Composer was not changed. There were no
material deviations from the accepted plan.

## Decision

The user's direct Browser comment accepts this low-risk visual correction. Ponytail selected one
shared class replacement and one existing regression update; no new component, option, or Web UI
branch is justified.

Human review remains required before merge. Merge, release, deployment, and publication are not
authorized.
