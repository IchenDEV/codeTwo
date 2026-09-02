---
id: "2026-08-31-animate-pane-splits"
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

# Spec: Animate new pane splits

## Requirements

A pane created to the right enters from the right; a pane created below enters from below. The same
mapping supports left/top split edges for existing non-menu entry points. Use the repository's
220 ms semantic motion duration and standard entrance curve, with a short 12 px translation and
opacity only. The initial single pane must not animate, stable panes must not replay animation on
rerender, and the global Reduced Motion contract must collapse the effect.

## User experience

Not separately recorded in legacy change.md.

## Technical design

See Requirements and legacy Git history.

## Security and privacy

See migrated Decision and gates.

## Alternatives and non-goals

Not separately recorded in legacy change.md.

## Areas of concern

The direct user request approves this low-risk visual feedback. The follow-up `pr` authorizes PR
creation only. Human review remains required before merge; release, deployment, and external
mutation remain unauthorized.

## Acceptance criteria

- [x] AC-1: Choosing Split right or Split down gives the newly created pane a matching directional
      entrance while existing panes stay stable.
- [x] AC-2: The initial pane does not animate, and a pane does not replay its entrance during normal
      rerenders or divider resizing.
- [x] AC-3: The animation uses semantic timing/easing, supports every split edge, and collapses
      under Reduced Motion.
- [x] AC-4: Focused/full tests, renderer build, rendered Browser inspection, and repository
      lifecycle checks pass.

## Decision

The direct user request approves this low-risk visual feedback. The follow-up `pr` authorizes PR
creation only. Human review remains required before merge; release, deployment, and external
mutation remain unauthorized.
