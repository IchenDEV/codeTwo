---
id: "2026-09-01-default-project-group"
stage: spec
schema: 3
status: accepted
owner: codex
created: 2026-09-01
based_on: intent.md
risk: low
approved_by: "[user]"
approved_at: "2026-09-01"
---

# Spec: Add a default Project group

## Requirements

- Root Projects render inside one built-in `All projects` group.
- The group is expanded by default and can be collapsed independently.
- Existing Project rows, empty Project copy, nested Tasks, ordering, and drag/drop targets remain
  unchanged.
- User-created Sections remain separate from this built-in group.

## User experience

Not separately recorded in legacy change.md.

## Technical design

See Requirements and legacy Git history.

## Security and privacy

See migrated Decision and gates.

## Alternatives and non-goals

Not separately recorded in legacy change.md.

## Areas of concern

The direct screenshot request approves this low-risk presentation change. Ponytail selects the
existing root Project render seam and the existing persisted disclosure primitive. No new Project,
Section, assignment, or synchronization model is introduced.

## Acceptance criteria

- [x] AC-1: Every root Project appears once inside the built-in Project group.
- [x] AC-2: The group is expanded by default and its disclosure hides and restores the Project list.
- [x] AC-3: Focused and full desktop tests, native rebuild, and repository lifecycle checks pass.

## Decision

The direct screenshot request approves this low-risk presentation change. Ponytail selects the
existing root Project render seam and the existing persisted disclosure primitive. No new Project,
Section, assignment, or synchronization model is introduced.
