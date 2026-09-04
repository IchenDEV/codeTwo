---
id: "2026-09-01-task-session-workspace-polish"
stage: spec
schema: 3
status: accepted
owner: codex
created: 2026-09-01
based_on: intent.md
risk: medium
approved_by: "userdirect review-fix, no-drawer, floating-panel, surface-tone, and PR requests"
approved_at: "2026-09-01"
---

# Spec: Polish the Task-to-Session workspace

## Requirements

- Continuing from the inspector appends to the destination pane's existing draft and cancels if
  asynchronous navigation no longer targets that pane and Session.
- Selected historical Sessions use selected-Session copy and always trigger their checkout's PR
  lookup, including histories beyond the initial 48-path batch. Loading and failed lookup states
  must not render false `No PR` results.
- Task and Session states use the shared labelled status indicator.
- At wide widths the inspector is a 360-pixel inset `surface` panel with no border or shadow. At
  narrow widths the page switches in place between list and detail with an explicit Back action;
  expansion alone never opens the detail and no drawer, overlay, or scrim mounts.
- The shared light `surface` tone mixes 2% foreground into the white canvas. Dark mode remains
  unchanged.

## User experience

Not separately recorded in legacy change.md.

## Technical design

See Requirements and legacy Git history.

## Security and privacy

See migrated Decision and gates.

## Alternatives and non-goals

Not separately recorded in legacy change.md.

## Areas of concern

The user approved the fixes and explicitly requested a PR. Ponytail selected a port onto current
`origin/main`: reuse the merged responsibility-owned TaskBoard modules and change only their
existing seams. The stale pre-merge working tree is not used as a branch because doing so would
delete the merged modular architecture.

This remains medium risk because composer state and the primary TaskBoard navigation are affected.
Opening the follow-up PR is authorized; merge and release remain human Gates.

## Acceptance criteria

- [x] AC-1: Existing drafts survive inspector continuation and stale navigation cannot target a
      different pane or Session.
- [x] AC-2: Historical, loading, failed, and beyond-cap PR states render accurately and status is
      exposed without relying on color.
- [x] AC-3: Wide and narrow layouts match the accepted floating/in-place behavior with no drawer,
      border, shadow, scrim, or horizontal overflow.
- [x] AC-4: Focused tests, lint, TypeScript, renderer build, documentation/SDLC Gates, diff hygiene,
      and live rendered inspection pass.

## Decision

The user approved the fixes and explicitly requested a PR. Ponytail selected a port onto current
`origin/main`: reuse the merged responsibility-owned TaskBoard modules and change only their
existing seams. The stale pre-merge working tree is not used as a branch because doing so would
delete the merged modular architecture.

This remains medium risk because composer state and the primary TaskBoard navigation are affected.
Opening the follow-up PR is authorized; merge and release remain human Gates.
