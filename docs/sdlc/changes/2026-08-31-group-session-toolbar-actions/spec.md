---
id: "2026-08-31-group-session-toolbar-actions"
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

# Spec: Clarify the session toolbar hierarchy

## Requirements

Present Add action, Open, Commit, and saved actions as independent controls with the existing C2
28px compact-control height, C2 control radius, semantic resting fill, one muted leading icon, and
one label. Use 8px between these controls and no shared outer package. Open and Commit remain one
complete pull-down button apiece, without a separate trailing chevron.

Present plugin, environment, and View as quiet icon-only toolbar controls beside the primary action
set. Keep their accessible names and tooltips. View retains one menu for split, conditional close,
and side-panel commands. Keep 8px inside the context group and 16px between context, task, and
layout groups. Below the compact breakpoint, hide primary labels and remove resting fills so each
action becomes a 28px bare icon.

Remove only the horizontal hairline between the session rail title row and its search/content area.
Keep the rail's vertical edge, the session header's content-dependent divider, and unrelated
boundaries.

## User experience

Not separately recorded in legacy change.md.

## Technical design

See Requirements and legacy Git history.

## Security and privacy

See migrated Decision and gates.

## Alternatives and non-goals

Not separately recorded in legacy change.md.

## Areas of concern

The final screenshot-backed direction supersedes experiments with transparent text-only items,
outlined capsules, split-button chevrons, and a shared package. After the verified screenshot was
shown, the user explicitly requested a PR on 2026-08-31. PR creation is authorized; merge, release,
deployment, and production mutation remain separate pending Gates.

## Acceptance criteria

- [x] AC-1: Expanded primary actions are independent semantic-fill controls with one muted icon and
      one label, without a shared package or trailing chevrons.
- [x] AC-2: Plugin, environment, and View are icon-only controls with intact accessible names and
      tooltips.
- [x] AC-3: View exposes split, conditional close, and checked side-panel commands through one menu
      separated from the primary actions by 16px.
- [x] AC-4: Open, move-task, source-control, checkpoint, push, split, close, and panel-toggle
      behaviors retain accessible names, disabled states, and effects.
- [x] AC-5: Standard, 600px narrow, light, and dark states retain a 40px titlebar and 28px controls
      without clipping or horizontal overflow.
- [x] AC-6: The rail title row has no bottom hairline while the vertical edge and unrelated dividers
      remain intact.
- [x] AC-7: Focused tests, renderer build, lifecycle checks, and diff hygiene pass without relevant
      runtime errors; the documentation check is run and any inherited base failure is recorded.

## Decision

The final screenshot-backed direction supersedes experiments with transparent text-only items,
outlined capsules, split-button chevrons, and a shared package. After the verified screenshot was
shown, the user explicitly requested a PR on 2026-08-31. PR creation is authorized; merge, release,
deployment, and production mutation remain separate pending Gates.
