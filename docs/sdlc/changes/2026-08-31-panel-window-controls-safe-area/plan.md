---
id: "2026-08-31-panel-window-controls-safe-area"
stage: plan
schema: 3
status: accepted
owner: codex
created: 2026-08-31
based_on: spec.md
risk: medium
scope: apps/desktop
approved_by: "[user]"
approved_at: "2026-08-31"
---

# Plan: Keep panel headers clear of macOS window controls

## Files and ownership

apps/desktop

## Order of work

1. Make each list header opt into the existing safe inset only when the collapsed-rail recovery
   action is present.
2. Add one shared compact-safe header class and a compact-only leading-action slot for detail panes,
   then apply them to Pull requests and Automations at their existing split breakpoint.
3. Protect wide/open-rail and compact/collapsed-rail behavior with focused rendered assertions;
   verify the isolated branch before opening the Draft PR.

Rollback removes the conditional header classes, compact-only action slots, compact list state,
and their focused tests, restoring the prior split-panel header layout without touching stored data.

## Test-first proof

See legacy Verification section.

## Visual or integration proof

See legacy Verification section.

## Risks and mitigations

See legacy Decision and gates.

## Rollback

See legacy Review and release.

## Deviations

- Pull requests and Automations list headers conditionally use C2's existing main-window safe inset
  only when the rail is collapsed and its recovery action is present.
- A shared compact-detail safe inset and compact-only recovery-action slot protect a detail pane
  when it becomes the leftmost surface below 44rem, while wide detail alignment remains unchanged.
- Pull requests tracks compact list visibility separately from selection, matching Automations.
  Its back button therefore stays on the list instead of being immediately reversed by automatic
  first-item selection.
- Both page titlebars use the repository's 48px semantic titlebar height.
- The adjacent detail tabs use the repository's named control geometry and inset focus utilities,
  replacing direct token classes invalidated when the header source moved.
- Focused rendered coverage checks collapsed/open-rail header classes, compact recovery actions,
  Pull-request list/detail switching, and the back-to-list interaction.

## Decision

The user's direct screenshot-backed implementation request is Intent and visible-design approval.
The implementation reuses the established `window-controls-safe-main` contract and the two pages'
existing container queries. The user's direct `merge` instruction on 2026-08-31 accepts the Review
and Merge Gate for PR #186. It does not authorize release, deployment, or production mutation.
