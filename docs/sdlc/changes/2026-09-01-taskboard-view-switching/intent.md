---
id: "2026-09-01-taskboard-view-switching"
stage: intent
schema: 3
status: accepted
owner: codex
created: 2026-09-01
source: direct user requests after PR #216 merged into main, including live feedback that the added sidebar title spacer made the hierarchy more confusing and the 2026-09-02 annotated requests for 340px minimum board lanes and a background-free empty Session row
risk: medium
approved_by: "userthe 2026-09-01 direct request to support different TaskBoard views"
approved_at: "2026-09-01"
---

# Intent: Add TaskBoard view switching

## Problem

The TaskBoard currently exposes only the merged flat Task-to-Session list. The user requested
different view modes and noted that merged PR #216 may conflict with new TaskBoard behavior. The
desired outcome is a direct switch between the detailed list and a lane-oriented board without
forking Task data, filters, selection, or Inspector state.

PR #216 is the required baseline. Its wide persistent Inspector and narrow in-place list/detail
navigation must remain intact. This change does not migrate Task persistence, add drag-and-drop,
change Task status semantics, or alter the shared collaboration transport.

## Proposed outcome

The TaskBoard currently exposes only the merged flat Task-to-Session list. The user requested

## Affected users and systems

Migrated from legacy change.md.

## Constraints

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

## Out of scope

Not recorded in the legacy single-file Artifact.

## Success signals

See Spec acceptance criteria.

## Open questions

None recorded in migration.

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
