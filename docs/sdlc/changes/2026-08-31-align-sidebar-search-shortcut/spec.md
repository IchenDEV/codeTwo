---
id: "2026-08-31-align-sidebar-search-shortcut"
stage: spec
schema: 3
status: accepted
owner: codex
created: 2026-08-31
based_on: intent.md
risk: low
approved_by: "[user]"
approved_at: "2026-08-31"
---

# Spec: Align the sidebar search shortcut

## Requirements

Keep the existing search icon, label, shortcut, click behavior, height, and visual treatment. Make
the search launcher consume the available rail width after both horizontal margins so its left and
right edges use equal insets. The shortcut remains vertically centered by the existing flex row.

## User experience

Not separately recorded in legacy change.md.

## Technical design

See Requirements and legacy Git history.

## Security and privacy

See migrated Decision and gates.

## Alternatives and non-goals

Not separately recorded in legacy change.md.

## Areas of concern

The direct user request approves this low-risk layout correction. The follow-up `pr` authorizes PR
creation only. Human review remains required before merge; release, deployment, and external
mutation remain unauthorized.

## Acceptance criteria

- [x] AC-1: The search launcher has equal left and right insets inside the sidebar.
- [x] AC-2: The `⌘K` badge remains vertically centered and fully contained in the launcher.
- [x] AC-3: Search activation, titlebar controls, and feature rows remain unchanged.
- [x] AC-4: Focused tests, renderer build, rendered Browser geometry, and repository lifecycle
      checks pass.

## Decision

The direct user request approves this low-risk layout correction. The follow-up `pr` authorizes PR
creation only. Human review remains required before merge; release, deployment, and external
mutation remain unauthorized.
