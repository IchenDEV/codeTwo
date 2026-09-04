---
id: "2026-08-30-flat-task-sections"
stage: plan
schema: 3
status: accepted
owner: codex
created: 2026-08-30
based_on: spec.md
risk: medium
scope: apps/desktop
approved_by: "userthe 2026-08-30 sidebar requests and explicit PR merge authorization"
approved_at: "2026-08-30"
---

# Plan: Flatten recent Tasks and add sidebar Sections

## Files and ownership

apps/desktop

## Order of work

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

## Test-first proof

See legacy Verification section.

## Visual or integration proof

See legacy Verification section.

## Risks and mitigations

See legacy Decision and gates.

## Rollback

See legacy Review and release.

## Deviations

- Added a versioned, local `sidebarSections` state module with defensive parsing and pure
  create/rename/assign/fold/delete operations.
- Reworked SessionRail into an all-Project Task feed with deterministic Highlight, manual
  Sections, a flat remainder, and a global Archived fold.
- Added native and rendered Section submenus plus quiet inline Section creation and management.
- Removed the entire Recent/Project-switcher row and its inline Section-add button. Section
  creation remains contextual to the Task being organized.
- Kept the optional recent-conversation line between title and workspace; rows without a useful
  conversation line do not reserve space.

## Decision

The user's request accepts the Intent and visible design. The implementation uses deterministic
automatic grouping so the system cannot silently reclassify work by model inference. Local UI
persistence matches existing rail width/fold preferences and avoids changing Core Task data. Human
review remains the next gate after verification.
