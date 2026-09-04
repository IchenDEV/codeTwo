---
id: "2026-08-29-empty-session-titlebar-divider"
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

# Spec: Hide the empty-session titlebar divider

## Requirements

Use the same state that mounts the transcript surface to control the session titlebar divider. An
empty pane with no turns, active run, or transcript load has no divider. A pane with persisted turns,
an active run, or a loading transcript restores the existing semantic hairline. The rule is
state-based and does not depend on viewport width or appearance.

## User experience

Not separately recorded in legacy change.md.

## Technical design

See Requirements and legacy Git history.

## Security and privacy

See migrated Decision and gates.

## Alternatives and non-goals

Not separately recorded in legacy change.md.

## Areas of concern

Intent and design acceptance come directly from the user's 2026-08-29 rendered-page feedback. No
permission to create a PR, merge, publish, or release is implied.

## Acceptance criteria

- [x] AC-1: An empty new-task pane has no visible or computed titlebar divider.
- [x] AC-2: Persisted, running, and loading conversation states use the existing semantic hairline.
- [x] AC-3: Rail and dock titlebar separators are unchanged.
- [x] AC-4: Dark, light, constrained-width, focused test, design, SDLC, diff, and console checks pass.

## Decision

Intent and design acceptance come directly from the user's 2026-08-29 rendered-page feedback. No
permission to create a PR, merge, publish, or release is implied.
