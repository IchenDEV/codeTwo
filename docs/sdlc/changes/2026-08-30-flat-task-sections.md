---
id: change-2026-08-30-flat-task-sections
kind: change
status: verified
owner: codex
created: 2026-08-30
updated: 2026-08-30
next_trigger: pull request checks and repository merge
---

# Flatten recent Tasks and add sidebar Sections

## Intent

The user supplied three macOS sidebar references on 2026-08-30 and asked that recent Tasks stop
being grouped or filtered by Project/folder. Tasks should appear in one cross-project feed, with
optional Sections as the only organizational layer. Users need to create and manage their own
Sections, while the system may maintain explainable automatic Sections. Disclosure controls should
sit immediately after each Section title as in the supplied references.

In a follow-up reference on the same date, the user explicitly removed the entire redundant
`Recent chats`/Project-switcher row. The Task area now begins directly with Highlight, manual
Sections, or flat Tasks; Section creation remains available from a Task's context menu.

The affected surface is the desktop SessionRail and its local organization state. This change does
not alter Task ownership, Project selection for new work, working directories, provider Sessions,
archive semantics, or any external system. The direct user request is accepted Intent and design
approval; it does not authorize a PR, merge, release, or production mutation.

## Spec

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

### Acceptance criteria

- [x] Active and archived Tasks from different Projects are available without changing the active
      Project, and no Project/folder headings partition the Task list.
- [x] Unassigned idle Tasks remain one globally recency-sorted flat feed with their Project shown
      only as row metadata.
- [x] The automatic `Highlight` Section contains only unassigned pinned, running, awaiting-input,
      or failed Tasks; explicit user Section membership takes precedence.
- [x] Users can create, rename, delete, fold, and unfold manual Sections and move a Task into a
      Section or back to no Section from its context menu.
- [x] Manual Section state survives a renderer remount, invalid stored data fails closed to an
      empty organization, and deleting a Section preserves every Task.
- [x] Each disclosure chevron appears immediately after its Section title, communicates expanded
      state, and works with pointer and keyboard input in light, dark, and the 220-pixel rail. Each
      Section title shares the same 16-pixel left baseline as Task titles.
- [x] The redundant Recent/Project header and its inline add control do not render; the list begins
      directly with a Section or Task without reserving empty space.
- [x] Existing select, rename, pin, archive/restore, and context-menu behavior remains available
      without duplicating Tasks between Sections.
- [x] Focused tests, renderer/design build, SDLC check, and real renderer inspection pass.

## Decision and gates

The user's request accepts the Intent and visible design. The implementation uses deterministic
automatic grouping so the system cannot silently reclassify work by model inference. Local UI
persistence matches existing rail width/fold preferences and avoids changing Core Task data. Human
review remains the next gate after verification.

## Plan

1. Add a small versioned Task Section state module with defensive parsing and pure create, rename,
   assign, fold, and delete operations.
2. Replace active-Project filtering and Pinned/Active partitions with cross-project sorting,
   automatic Highlight, manual Section folds, and a flat remainder in SessionRail.
3. Add native and rendered context-menu Section assignment plus quiet inline Section management;
   remove the redundant Recent/Project header after the user's follow-up direction.
4. Protect persistence, precedence, ordering, disclosure placement, and existing actions with
   focused tests; verify the real renderer in light, dark, standard, and minimum rail widths.

Rollback removes the local Section state module and restores the prior active-Project list
partition. Stored UI organization is versioned and ignored by older builds.

## Build

- Added a versioned, local `sidebarSections` state module with defensive parsing and pure
  create/rename/assign/fold/delete operations.
- Reworked SessionRail into an all-Project Task feed with deterministic Highlight, manual
  Sections, a flat remainder, and a global Archived fold.
- Added native and rendered Section submenus plus quiet inline Section creation and management.
- Removed the entire Recent/Project-switcher row and its inline Section-add button. Section
  creation remains contextual to the Task being organized.
- Kept the optional recent-conversation line between title and workspace; rows without a useful
  conversation line do not reserve space.

## Verification

- `bun test apps/desktop/tests/sidebarSections.test.ts apps/desktop/tests/sessionRailRendered.test.tsx`
  passed: 20 tests, 195 expectations, 0 failures.
- `bun run build:renderer` passed TypeScript, Vite production rendering, the source design-system
  gate with 0 new violations, and the built-selector design-system gate.
- `python3 script/check_sdlc.py` passed with `[sdlc] contract valid`.
- Renderer-only QA used isolated port 1421 and did not launch a second Core. Browser inspection
  confirmed the Recent label, Project switcher, and inline add control were absent, with Highlight
  becoming the first visible Task control and no blank placeholder above it.
- Real pointer/keyboard inspection confirmed Highlight folding, manual Section creation,
  persistence after reload, the Section context submenu, and moving an unsectioned Task into a
  manual Section. A fresh dark-mode tab reported no console warnings or errors.
- Screenshots and layout measurements covered light and dark at 320 pixels and the minimum
  220-pixel rail. At the minimum width every Task row measured 204 CSS pixels of client and scroll
  width, with no horizontal overflow. Highlight still folded by pointer input, hid only its own
  Task, and left the following manual Section visible.
- Follow-up alignment inspection measured the Highlight title, manual Work title, grouped Task
  title, and flat Task title at the same 16 CSS-pixel left edge at both 320- and 220-pixel rail
  widths. The narrow rail had no horizontal overflow, and folding Work removed only its rows.

## Review and release

The user explicitly authorized creating and merging the repository pull request on 2026-08-30.
Repository integration remains pending until the PR checks pass and the merge is observed. No
versioned product release was requested.

## Feedback

The follow-up renderer matches the supplied deletion request: the redundant heading/project bar is
gone, organization begins directly with title-adjacent Section disclosures, status remains quiet,
and the optional middle conversation line collapses away when there is no useful content. A later
visual review found Section headings were eight pixels too far right; system, manual, empty, and
creation states now share the Task-title baseline without moving trailing Section actions.
