---
id: "2026-09-01-taskboard-view-switching"
stage: plan
schema: 3
status: accepted
owner: codex
created: 2026-09-01
based_on: spec.md
risk: medium
scope: apps/desktop/src/i18n/strings.ts, apps/desktop/src/taskboard, apps/desktop/src/sidebar/SessionRail.tsx, apps/desktop/tests/taskBoardRendered.test.tsx, apps/desktop/tests/sessionRailRendered.test.tsx, docs/sdlc/changes/2026-09-01-taskboard-view-switching
approved_by: "userthe 2026-09-01 direct request to support different TaskBoard views"
approved_at: "2026-09-01"
---

# Plan: Add TaskBoard view switching

## Files and ownership

apps/desktop/src/i18n/strings.ts, apps/desktop/src/taskboard, apps/desktop/src/sidebar/SessionRail.tsx, apps/desktop/tests/taskBoardRendered.test.tsx, apps/desktop/tests/sessionRailRendered.test.tsx, docs/sdlc/changes/2026-09-01-taskboard-view-switching

## Order of work

1. Add the persisted personal view state and the existing header switcher.
2. Add a lane board renderer that reuses projected Tasks and existing Task actions.
3. Preserve the PR #216 Inspector contract and cover switching, persistence, selection, filters,
   actions, and narrow behavior with focused tests.
4. Run renderer and repository Gates, then exercise list/board switching in real light, dark, and
   narrow windows.
5. Increase the existing lane and four-track minimums to 340px, add focused contract coverage, and
   repeat rendered overflow inspection at the annotated viewport.
6. Apply the existing Session-stack fill only when Sessions are present, then verify the empty row's
   background and Start task interaction in the rendered list.

Rollback removes the board renderer and switcher and leaves the existing list as the fallback.
The local preference key is inert if the UI is reverted.

## Test-first proof

See legacy Verification section.

## Visual or integration proof

See legacy Verification section.

## Risks and mitigations

See legacy Decision and gates.

## Rollback

See legacy Review and release.

## Deviations

Added a persisted personal `list`/`board` preference, reused the existing business
`ViewSwitcher`, and introduced a four-lane board over the authoritative `ProjectedTask` data. Board
cards retain the existing Task action menu and route selection through the same Task/Session and
Inspector action used by the list. The list remains the default and keeps its progressive rendering
behavior.

The implementation was applied after updating the worktree baseline to PR #216's merge commit
`b7010aa4`. Its wide persistent Inspector and narrow in-place Task/Inspector navigation remain the
single responsive contract; no competing drawer, overlay, or Task state model was added.

The first optimization follow-up narrowed lane and card geometry, moved status indication from every
card to each lane header, suppressed zero Session/PR metadata, strengthened selected-card feedback,
and used a smaller Inspector measure only in Board view. After the user found that minimum too
narrow, the final follow-up set every lane to a readable 14 rem minimum, contained cards and their
metadata, and made the board surface the sole horizontal scroller. A subsequent sidebar spacer
experiment compounded the existing Project nesting and made the hierarchy less clear, so that
spacer was removed: Project labels and child Session titles again use the established shared start
line, while provider and workspace icons remain on metadata rows. No new view, preference, data
path, drag-and-drop behavior, or dependency was introduced.

The 2026-09-02 follow-up changes the existing four-lane grid minimum from 14rem to 340px and updates
the explicit four-track width accordingly. The same board shell remains the sole horizontal scroller;
the Task projection, cards, Inspector, responsive breakpoints, and view preference are unchanged.

The subsequent empty-state follow-up applies the existing Session-stack fill only when the expanded
Task has Sessions. An empty stack remains transparent while retaining its indentation, spacing,
No Sessions label, Start task action, and collapse behavior; populated Session stacks are unchanged.

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
