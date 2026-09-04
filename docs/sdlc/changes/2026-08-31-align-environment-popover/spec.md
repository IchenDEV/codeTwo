---
id: "2026-08-31-align-environment-popover"
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

# Spec: Align the environment popover

## Requirements

Keep the existing header trigger, vertical offset, popover size, content, and shared Popover
primitive. Change only the horizontal alignment from trailing-edge placement to leading-edge
placement. Retain the primitive's built-in collision handling so the popover shifts back into the
viewport when there is not enough room on the right.

## User experience

Not separately recorded in legacy change.md.

## Technical design

See Requirements and legacy Git history.

## Security and privacy

See migrated Decision and gates.

## Alternatives and non-goals

Not separately recorded in legacy change.md.

## Areas of concern

The direct user request approves this low-risk placement adjustment. The follow-up `pr` authorizes
PR creation only. Human review remains required before merge; release, deployment, and external
mutation remain unauthorized.

## Acceptance criteria

- [x] AC-1: The Environment popover's left edge aligns with the Environment trigger and the
      popover opens to its right in a normal desktop window.
- [x] AC-2: The popover remains within the viewport and all existing Environment interactions and
      content remain intact.
- [x] AC-3: Focused tests, renderer build, rendered Browser inspection, and repository lifecycle
      checks pass.

## Decision

The direct user request approves this low-risk placement adjustment. The follow-up `pr` authorizes
PR creation only. Human review remains required before merge; release, deployment, and external
mutation remain unauthorized.
