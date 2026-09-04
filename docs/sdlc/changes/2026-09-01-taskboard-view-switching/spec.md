---
id: "2026-09-01-taskboard-view-switching"
stage: spec
schema: 3
status: accepted
owner: codex
created: 2026-09-01
based_on: intent.md
risk: medium
approved_by: "userthe 2026-09-01 direct request to support different TaskBoard views"
approved_at: "2026-09-01"
---

# Spec: Add TaskBoard view switching

## Requirements

- The TaskBoard header offers an accessible List/Board view switcher.
- Both views consume the same filtered `ProjectedTask` collection; the existing list retains its
  progressive rendering optimization while the board renders the filtered lane contents.
- The board groups Tasks by the existing derived lanes: Queue, Running, Needs you, and Done.
- Selecting a board card updates the existing Inspector; switching views preserves the selected
  Task, selected Session, filters, list expansion state, and responsive Inspector behavior.
- The chosen view is a personal local preference. Missing, invalid, or unavailable storage falls
  back to List without affecting Task data.
- Existing Task actions, including edit, move, start, and delete, remain available in both views.

## User experience

Not separately recorded in legacy change.md.

## Technical design

See Requirements and legacy Git history.

## Security and privacy

See migrated Decision and gates.

## Alternatives and non-goals

Not separately recorded in legacy change.md.

## Areas of concern

The user approved implementation directly. Ponytail selected the smallest reuse path: the existing
business `ViewSwitcher`, Task projection, lane labels, Task action menu, selection hook, and
responsive Inspector stay authoritative. No new data model, dependency, route, or second page is
introduced.

This is medium risk because it changes the primary TaskBoard presentation while leaving data and
execution untouched. Merge, release, and deployment are not authorized.

The user's 2026-09-02 annotated request accepts reopening this change only to increase the existing
Board lane minimum from 14rem to 340px. The current four-lane grid and contained horizontal scroller
remain authoritative.

The user's subsequent annotation accepts one local empty-state correction: remove the fill from an
expanded Task's no-Sessions row without changing populated Session rows or the Inspector empty state.

## Acceptance criteria

- [x] AC-1: The header switches between one flat Task list and four derived-lane board columns over
      the same filtered Task projection.
- [x] AC-2: View choice survives remount, invalid storage falls back safely, and Task persistence is
      unchanged.
- [x] AC-3: Selection, Inspector state, Task actions, and PR #216 wide/narrow navigation continue to
      work across view changes.
- [x] AC-4: Focused tests, renderer checks, documentation/SDLC Gates, and real light, dark, and narrow
      window interaction pass.
- [x] AC-5: At the standard C2 development window, the board exposes materially more lane context
      without changing the persistent Inspector contract or requiring a new control.
- [x] AC-6: Board cards remove redundant zero-value and repeated-lane metadata while retaining Task
      title, meaningful priority, active Session/PR counts, update time, selection, and actions.
- [x] AC-7: The optimized board passes focused tests, renderer checks, repository Gates, and a fresh
      native-window interaction after restart.
- [x] AC-8: Board lanes retain a readable minimum width, cards cannot overlap adjacent lanes, and
      horizontal overflow remains contained by the board scroller at standard and narrow widths.
- [x] AC-9: Project and nested Session titles preserve the established shared start line without
      changing disclosure, drag-and-drop, selection, or context-menu behavior.
- [x] AC-10: Focused rendered tests, the renderer build, repository Gates, Browser QA, and a fresh
      native-window interaction pass for the overflow and alignment follow-up.
- [x] AC-11: Remove the extra Session title spacer so a Project label and its child Session titles
      return to the established shared start line, while retaining the board overflow correction and
      all existing sidebar interactions.
- [x] AC-12: Every Board lane keeps a 340px minimum width while horizontal overflow remains contained
      by the existing board scroller at the annotated viewport.
- [x] AC-13: An expanded Task with no Sessions renders its “No Sessions / Start task” row without a
      fill background, while populated Session stacks retain their existing treatment.

## Decision

The user approved implementation directly. Ponytail selected the smallest reuse path: the existing
business `ViewSwitcher`, Task projection, lane labels, Task action menu, selection hook, and
responsive Inspector stay authoritative. No new data model, dependency, route, or second page is
introduced.

This is medium risk because it changes the primary TaskBoard presentation while leaving data and
execution untouched. Merge, release, and deployment are not authorized.

The user's 2026-09-02 annotated request accepts reopening this change only to increase the existing
Board lane minimum from 14rem to 340px. The current four-lane grid and contained horizontal scroller
remain authoritative.

The user's subsequent annotation accepts one local empty-state correction: remove the fill from an
expanded Task's no-Sessions row without changing populated Session rows or the Inspector empty state.
