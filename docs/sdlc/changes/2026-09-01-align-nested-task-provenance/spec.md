---
id: "2026-09-01-align-nested-task-provenance"
stage: spec
schema: 3
status: accepted
owner: codex
created: 2026-09-01
based_on: intent.md
risk: low
approved_by: "userdirect screenshot feedback on 2026-09-01"
approved_at: "2026-09-01"
---

# Spec: Align nested Task provenance

## Requirements

- A Project-grouped Task places its checkout/worktree badge in the summary metadata rail.
- A grouped Task without pull-request status does not render an otherwise empty workspace line.
- A grouped Task with pull-request status retains a dedicated provenance line for that richer state.
- Ungrouped Tasks retain the existing workspace, checkout/worktree, and pull-request row.
- Existing selection, status, actions, drag-and-drop, truncation, and accessible labels remain intact.
- Project-grouped Task titles share the same horizontal start as top-level Task titles.
- A Task title keeps a stable small gap from its hover/focus action group at narrow widths.
- Summary text shares the Task title start; the Provider icon belongs to the trailing metadata rail.
- A Project disclosure trigger stays transparent on hover so the whole row uses one neutral feedback surface.
- Task rows keep their full-width surfaces while applying only the measured optical inset to their content.
- Top-level and Project-grouped Task titles align with the leading edge of Project folder icons.
- Empty-Project copy aligns beneath the Project label rather than the folder-icon column.

## User experience

Not separately recorded in legacy change.md.

## Technical design

See Requirements and legacy Git history.

## Security and privacy

See migrated Decision and gates.

## Alternatives and non-goals

Not separately recorded in legacy change.md.

## Areas of concern

The direct screenshot report approves this low-risk visual correction. Ponytail selects the existing
session-row seam: conditionally place already-rendered provenance rather than adding a new component,
state model, or sidebar variant. Merge, release, deployment, and unrelated sidebar redesign remain
outside the authorized scope.

## Acceptance criteria

- [x] AC-1: A grouped Task without a pull request renders age and checkout/worktree metadata on the summary line and has no empty workspace line.
- [x] AC-2: An ungrouped Task retains its workspace line and Git provenance.
- [x] AC-3: A grouped Task with pull-request status retains a dedicated provenance line with its checkout/worktree and pull-request badges.
- [x] AC-4: Focused rendered tests, renderer build, Browser QA, repository Gates, and the rebuilt native window pass.
- [x] AC-5: Project-grouped Task containers use zero whole-row offset so their interaction surfaces align with top-level Tasks.
- [x] AC-6: Task titles keep an 8px minimum gap from the action group without moving the actions away from the right edge.
- [x] AC-7: Summary text starts below the Task title while Provider, age, and checkout metadata remain grouped on the right.
- [x] AC-8: The active Session row always paints its contents after selection and scrolling instead of leaving only its background visible.
- [x] AC-9: Hovering a Project disclosure does not add a blue/accent fill inside the Project row.
- [x] AC-10: Grouped Task content retains a full-width hover or selected surface.
- [x] AC-11: A grouped Task title and its Project folder icon share the same leading edge while the row surface remains full width.
- [x] AC-12: Top-level and grouped Task content use the shared 6px optical inset visible in the populated native sidebar, without moving row surfaces.
- [x] AC-13: Empty-Project copy starts in the Project label column while existing Task rows remain unchanged.

## Decision

The direct screenshot report approves this low-risk visual correction. Ponytail selects the existing
session-row seam: conditionally place already-rendered provenance rather than adding a new component,
state model, or sidebar variant. Merge, release, deployment, and unrelated sidebar redesign remain
outside the authorized scope.
