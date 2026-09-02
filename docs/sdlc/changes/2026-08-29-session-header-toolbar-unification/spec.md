---
id: "2026-08-29-session-header-toolbar-unification"
stage: spec
schema: 3
status: accepted
owner: codex
created: 2026-08-29
based_on: intent.md
risk: low
approved_by: "#decision-and-gates"
approved_at: "2026-08-29"
---

# Spec: Unify the session titlebar toolbar

## Requirements

The session titlebar uses the existing muted foreground for every toolbar icon and label across
rest, hover, open, and pressed states; disabled controls remain visibly disabled. All available
actions use transparent toolbar chrome at rest. Hover, open, or pressed controls may use a neutral
fill, but must not change the icon color or use the product accent color. Standalone titlebar controls
share a 28px square height and a 4px gap; the two halves of a split button keep a zero-width inner
gap and a subtle seam.

## User experience

Not separately recorded in legacy change.md.

## Technical design

See Requirements and legacy Git history.

## Security and privacy

See migrated Decision and gates.

## Alternatives and non-goals

Not separately recorded in legacy change.md.

## Areas of concern

Intent and design acceptance come directly from the user's 2026-08-29 titlebar feedback. No
permission to create a PR, merge, publish, or release is implied.

## Acceptance criteria

- [x] AC-1: In dark and light appearance, every enabled resting titlebar icon has the same computed
      neutral foreground and transparent background.
- [x] AC-2: Open or pressed state remains discoverable through a neutral surface without an accent-color
      icon; disabled state remains distinct.
- [x] AC-3: Environment, pane, project-action, split-menu, plugin, and panel controls share 28px height,
      4px spacing between independent controls, and aligned icon sizing.
- [x] AC-4: Add action, Open, Commit, split menus, pane controls, environment, plugin action, and panel
      actions retain their accessible names and behavior.
- [x] AC-5: Focused tests, design check, SDLC check, and rendered console check pass.

## Decision

Intent and design acceptance come directly from the user's 2026-08-29 titlebar feedback. No
permission to create a PR, merge, publish, or release is implied.
