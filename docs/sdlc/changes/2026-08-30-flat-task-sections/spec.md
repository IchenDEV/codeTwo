---
id: "2026-08-30-flat-task-sections"
stage: spec
schema: 3
status: accepted
owner: codex
created: 2026-08-30
based_on: intent.md
risk: medium
approved_by: "userthe 2026-08-30 sidebar requests and explicit PR merge authorization"
approved_at: "2026-08-30"
---

# Spec: Flatten recent Tasks and add sidebar Sections

## Requirements

The Task surface is globally sorted across every Project. It has no separate Recent heading or
Project switcher. Project identity remains quiet row context, not a list partition. Unsectioned
Tasks remain a flat feed. A Task may have at most one explicit user Section. Explicit membership
wins over automatic grouping.

`Highlight` is the first system Section. It automatically contains unassigned Tasks that are
pinned, running, awaiting input, or failed. `Archived` remains a system-owned fold. Manual Sections
can be created, renamed, folded, deleted, and selected from a Task context-menu submenu. Deleting a
Section returns its Tasks to automatic/flat placement; no Task is deleted. Section names,
assignments, order, and folded state persist as local UI organization. Semantic model-driven
clustering, cross-device synchronization, and drag reordering are non-goals for this change.

## User experience

Not separately recorded in legacy change.md.

## Technical design

See Requirements and legacy Git history.

## Security and privacy

See migrated Decision and gates.

## Alternatives and non-goals

Not separately recorded in legacy change.md.

## Areas of concern

The user's request accepts the Intent and visible design. The implementation uses deterministic
automatic grouping so the system cannot silently reclassify work by model inference. Local UI
persistence matches existing rail width/fold preferences and avoids changing Core Task data. Human
review remains the next gate after verification.

## Acceptance criteria

- [x] AC-1: Active and archived Tasks from different Projects are available without changing the active
      Project, and no Project/folder headings partition the Task list.
- [x] AC-2: Unassigned idle Tasks remain one globally recency-sorted flat feed with their Project shown
      only as row metadata.
- [x] AC-3: The automatic `Highlight` Section contains only unassigned pinned, running, awaiting-input,
      or failed Tasks; explicit user Section membership takes precedence.
- [x] AC-4: Users can create, rename, delete, fold, and unfold manual Sections and move a Task into a
      Section or back to no Section from its context menu.
- [x] AC-5: Manual Section state survives a renderer remount, invalid stored data fails closed to an
      empty organization, and deleting a Section preserves every Task.
- [x] AC-6: Each disclosure chevron appears immediately after its Section title, communicates expanded
      state, and works with pointer and keyboard input in light, dark, and the 220-pixel rail. Each
      Section title shares the same 16-pixel left baseline as Task titles.
- [x] AC-7: The redundant Recent/Project header and its inline add control do not render; the list begins
      directly with a Section or Task without reserving empty space.
- [x] AC-8: Existing select, rename, pin, archive/restore, and context-menu behavior remains available
      without duplicating Tasks between Sections.
- [x] AC-9: Focused tests, renderer/design build, SDLC check, and real renderer inspection pass.

## Decision

The user's request accepts the Intent and visible design. The implementation uses deterministic
automatic grouping so the system cannot silently reclassify work by model inference. Local UI
persistence matches existing rail width/fold preferences and avoids changing Core Task data. Human
review remains the next gate after verification.
