---
id: "2026-09-01-floating-pr-inspector-prototype"
stage: plan
schema: 3
status: accepted
owner: codex
created: 2026-09-01
based_on: spec.md
risk: low
scope: apps/desktop/src/design/ui-lab, apps/desktop/layout-spec.json, apps/desktop/tests/uiLabRendered.test.tsx, docs/sdlc/changes/2026-09-01-floating-pr-inspector-prototype
approved_by: "userthe 2026-09-01 request to try the PR workspace's trailing Inspector as a floating panel"
approved_at: "2026-09-01"
---

# Plan: Prototype a floating PR Inspector

## Files and ownership

apps/desktop/src/design/ui-lab, apps/desktop/layout-spec.json, apps/desktop/tests/uiLabRendered.test.tsx, docs/sdlc/changes/2026-09-01-floating-pr-inspector-prototype

## Order of work

1. Record the three comparison geometries and keep the current production collapse breakpoint.
2. Add URL-backed variant state and a development-only keyboard-accessible switcher to the
   existing PR Workspace fixture.
3. Style attached, floating, and overlay variants with current CodeTwo tokens and no production
   component fork.
4. Run focused checks and inspect desktop dark/light plus narrow behavior in the in-app browser.

Rollback removes this change bundle and the UI Lab-only variant code. Production components,
stored data, and remote services require no cleanup.

## Test-first proof

See legacy Verification section.

## Visual or integration proof

See legacy Verification section.

## Risks and mitigations

See legacy Decision and gates.

## Rollback

See legacy Review and release.

## Deviations

Added three URL-addressed Inspector layouts to the permanent development-only PR Workspace fixture.
The requested floating card is the default and reserves the production Inspector column while
adding a 12px inset, 16px radius, border, tokenized surface, and raised elevation. Attached remains
the production baseline; overlay deliberately gives the primary region the full width for a more
aggressive comparison.

Added a bottom comparison switcher using the shared Button component. Clicks and left/right arrow
keys update the visible variant and URL, browser history restores prior selection, text inputs keep
their arrow-key behavior, and theme/locale navigation preserves the variant. The production
component, GitHub bridge, and normal app routes are unchanged.

## Decision

The user's direct request accepts this low-risk, development-only visual prototype for execution.
Codex owns implementation and owner verification. Selecting and promoting a production variant is
a later human design Gate. The prototype request alone did not authorize GitHub mutation; the
user's later `pr` request authorizes including this historical decision record in the verified
Draft PR scope, but does not authorize merge, release, deployment, or production mutation.
