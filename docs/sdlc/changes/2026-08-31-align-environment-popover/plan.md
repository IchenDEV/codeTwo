---
id: "2026-08-31-align-environment-popover"
stage: plan
schema: 3
status: accepted
owner: codex
created: 2026-08-31
based_on: spec.md
risk: low
scope: apps/desktop/src/environment/EnvironmentPopover.tsx, apps/desktop/tests/environmentPopoverRendered.test.tsx, docs/sdlc/changes/2026-08-31-align-environment-popover
approved_by: "[user]"
approved_at: "2026-08-31"
---

# Plan: Align the environment popover

## Files and ownership

apps/desktop/src/environment/EnvironmentPopover.tsx, apps/desktop/tests/environmentPopoverRendered.test.tsx, docs/sdlc/changes/2026-08-31-align-environment-popover

## Order of work

1. Replace the manual trailing-edge offset with semantic leading-edge alignment.
2. Add a focused regression contract for the Environment popover alignment.
3. Exercise the trigger in an isolated rendered window and measure trigger, popup, and viewport
   bounds before completing the standard repository checks.

Rollback restores the previous Environment popover alignment props.

## Test-first proof

See legacy Verification section.

## Visual or integration proof

See legacy Verification section.

## Risks and mitigations

See legacy Decision and gates.

## Rollback

See legacy Review and release.

## Deviations

`EnvironmentPopover` now uses the shared Popover primitive's semantic `start` alignment without a
manual horizontal offset. At normal desktop width, the popup therefore starts at the Environment
trigger and grows rightward. The same primitive retains its viewport collision middleware for
constrained windows. The existing side offset, width, scrolling, content, and interactions are
unchanged.

## Decision

The direct user request approves this low-risk placement adjustment. The follow-up `pr` authorizes
PR creation only. Human review remains required before merge; release, deployment, and external
mutation remain unauthorized.
