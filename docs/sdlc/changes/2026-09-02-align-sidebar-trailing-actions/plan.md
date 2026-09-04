---
id: "2026-09-02-align-sidebar-trailing-actions"
stage: plan
schema: 3
status: accepted
owner: codex
created: 2026-09-02
based_on: spec.md
risk: low
scope: apps/desktop/src/sidebar/SessionRail.tsx, apps/desktop/tests/sessionRailRendered.test.tsx, docs/sdlc/changes/2026-09-02-align-sidebar-trailing-actions
approved_by: "userthe direct 2026-09-02 screenshot feedback"
approved_at: "2026-09-02"
---

# Plan: Align sidebar trailing actions

## Files and ownership

apps/desktop/src/sidebar/SessionRail.tsx, apps/desktop/tests/sessionRailRendered.test.tsx, docs/sdlc/changes/2026-09-02-align-sidebar-trailing-actions

## Order of work

1. Keep the corrected Quick Chat inset and move the title-bar collapse button onto the same axis.
2. Extend the focused SessionRail regression with the complete trailing-inset contract.
3. Rebuild the Web assets and compare the live right-edge geometry at desktop and narrow widths.

Rollback restores the prior margin token and regression expectation. There is no data or protocol
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

The shared SessionRail uses the existing `mr-2` spacing token on the Quick Chat button, moving
its right edge inward by 4px to match the Search shortcut's effective 16px trailing inset. The
focused rendered regression prohibits restoring the previous `mr-1` token. No wrapper, dimensions,
semantics, or interaction logic changed.

The follow-up adds the same existing `mr-2` trailing token to the title-bar collapse button. Combined
with the title row's existing padding, this moves its 28px button and 16px icon 8px inward onto the
same axis as the Search shortcut and Quick Chat action. Dimensions, native button semantics, labels,
focus treatment, and event handling remain unchanged.

## Decision

The user's direct screenshot feedback accepts this low-risk alignment correction. Ponytail selected
one existing spacing-token addition at the shared SessionRail seam plus one regression assertion; no
new wrapper, layout system, or Web-only variant is justified.

Human review remains required before merge. Merge, release, deployment, and publication are not
authorized.
