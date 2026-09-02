---
id: "2026-08-31-group-session-toolbar-actions"
stage: plan
schema: 3
status: accepted
owner: codex
created: 2026-08-31
based_on: spec.md
risk: medium
scope: apps/desktop/src/App.tsx, apps/desktop/src/environment/EnvironmentPopover.tsx, apps/desktop/src/i18n/strings.ts, apps/desktop/src/session/PaneChrome.tsx, apps/desktop/src/session/SessionHeaderActions.tsx, apps/desktop/src/styles.css, apps/desktop/tests/environmentPopoverRendered.test.tsx, apps/desktop/tests/paneChrome.test.tsx, apps/desktop/tests/sessionHeaderActionsRendered.test.tsx, apps/desktop/tests/windowChromeContract.test.ts, docs/sdlc/changes/2026-08-31-group-session-toolbar-actions.md, docs/sdlc/changes/2026-08-31-group-session-toolbar-actions
approved_by: "[user]"
approved_at: "2026-08-31"
---

# Plan: Clarify the session toolbar hierarchy

## Files and ownership

apps/desktop/src/App.tsx, apps/desktop/src/environment/EnvironmentPopover.tsx, apps/desktop/src/i18n/strings.ts, apps/desktop/src/session/PaneChrome.tsx, apps/desktop/src/session/SessionHeaderActions.tsx, apps/desktop/src/styles.css, apps/desktop/tests/environmentPopoverRendered.test.tsx, apps/desktop/tests/paneChrome.test.tsx, apps/desktop/tests/sessionHeaderActionsRendered.test.tsx, apps/desktop/tests/windowChromeContract.test.ts, docs/sdlc/changes/2026-08-31-group-session-toolbar-actions.md, docs/sdlc/changes/2026-08-31-group-session-toolbar-actions

## Order of work

1. Keep Open and Commit as whole-item pull-down controls and give every expanded primary action one
   icon, one label, and its own semantic resting fill.
2. Keep plugin, environment, and View icon-only with existing accessible labels and menu behavior.
3. Protect hierarchy and interaction with focused tests, then validate standard, narrow, light, and
   dark renderer states plus repository Gates.

Rollback reverts the scoped titlebar, pane-chrome, responsive-style, and test changes. It does not
affect stored sessions, pane layout data, or repository data.

## Test-first proof

See legacy Verification section.

## Visual or integration proof

See legacy Verification section.

## Risks and mitigations

See legacy Decision and gates.

## Rollback

See legacy Review and release.

## Deviations

- `SessionHeaderActions` uses independent 28px controls with semantic resting fills for Add action,
  saved actions, Open, and Commit. Each has one muted icon and one label; the group has 8px spacing
  and no shared padding, shadow, border, or radius.
- Open and Commit keep complete-button dropdown interaction. No trailing arrow, split trigger,
  duplicate compact control, or extra state was added.
- Plugin, environment, and View retain their components and behavior but render at 28px as icon-only
  controls. The compact rule removes primary fills, hides labels, and fixes each action to 28px.
- View consolidates pane split, conditional close, and side-panel state in one menu.
- The implementation was rebased onto `origin/main` at `a224a752`. Conflict resolution preserved
  main's Feishu-page suppression, pet conversation work, and semantic radius while retaining the
  accepted toolbar hierarchy.

## Decision

The final screenshot-backed direction supersedes experiments with transparent text-only items,
outlined capsules, split-button chevrons, and a shared package. After the verified screenshot was
shown, the user explicitly requested a PR on 2026-08-31. PR creation is authorized; merge, release,
deployment, and production mutation remain separate pending Gates.
