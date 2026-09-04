---
id: "2026-08-31-panel-window-controls-safe-area"
stage: spec
schema: 3
status: accepted
owner: codex
created: 2026-08-31
based_on: intent.md
risk: medium
approved_by: "[user]"
approved_at: "2026-08-31"
---

# Spec: Keep panel headers clear of macOS window controls

## Requirements

When the session rail is collapsed, the currently visible leftmost panel header uses C2's existing
macOS window-controls safe inset. In the normal two-pane layout this is the list header only. At the
existing 44rem compact split breakpoint, selecting a Pull request or Automation hides the list, so
the detail header becomes leftmost, inherits the safe inset, and exposes both the sidebar recovery
action and its existing back-to-list action.

When the rail is open, existing horizontal alignment is unchanged. Windows and browser previews
keep the existing compact inset. Header height, filter/tab semantics, keyboard names, data state,
and the 44rem layout threshold remain unchanged. The implementation follows the existing C2
container-query and safe-area classes instead of adding device-specific JavaScript state.

## User experience

Not separately recorded in legacy change.md.

## Technical design

See Requirements and legacy Git history.

## Security and privacy

See migrated Decision and gates.

## Alternatives and non-goals

Not separately recorded in legacy change.md.

## Areas of concern

The user's direct screenshot-backed implementation request is Intent and visible-design approval.
The implementation reuses the established `window-controls-safe-main` contract and the two pages'
existing container queries. The user's direct `merge` instruction on 2026-08-31 accepts the Review
and Merge Gate for PR #186. It does not authorize release, deployment, or production mutation.

## Acceptance criteria

- [x] AC-1: With the rail collapsed in the normal two-pane layout, Pull requests and Automations list
      header controls, titles, and filters clear macOS window controls/system capture chrome.
- [x] AC-2: At the existing compact breakpoint, the visible detail header clears the same system area
      and exposes operable sidebar-expand and back-to-list actions without horizontal overflow.
- [x] AC-3: With the rail open, both list and detail header alignment remains unchanged; filter, tab,
      refresh/create, selection, and back behavior retain their accessible names and behavior.
- [x] AC-4: Focused rendered tests, design-system validation, renderer build, SDLC check, and real
      light/dark standard plus narrow rendered inspection pass without relevant console errors.

## Decision

The user's direct screenshot-backed implementation request is Intent and visible-design approval.
The implementation reuses the established `window-controls-safe-main` contract and the two pages'
existing container queries. The user's direct `merge` instruction on 2026-08-31 accepts the Review
and Merge Gate for PR #186. It does not authorize release, deployment, or production mutation.
