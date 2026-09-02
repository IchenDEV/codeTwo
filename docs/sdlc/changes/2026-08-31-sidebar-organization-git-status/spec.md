---
id: "2026-08-31-sidebar-organization-git-status"
stage: spec
schema: 3
status: accepted
owner: codex
created: 2026-08-31
based_on: intent.md
risk: medium
approved_by: "userthe 2026-08-31 sidebar organization request and three supplied references"
approved_at: "2026-08-31"
---

# Spec: Make sidebar organization user-owned and show Git delivery state

## Requirements

`Highlight` has no reserved identity. Every Task Section uses the same user-owned model and the
same edit, collapse, ordering, archive-all, and delete behavior. Existing version-1 Section state
migrates without losing names, membership, or folds; the old automatic Highlight fold preference
is ignored because no automatic Highlight Section remains.

Users can reorder manual Task Sections and active Tasks with direct manipulation. Dropping a Task
inside another Section updates its membership; dropping among peers updates the durable local
order. A keyboard and context-menu alternative remains available. Newly discovered Tasks that
have never been explicitly ordered continue to appear by recent activity until the user moves
them. Archived Tasks stay in the archived fold and are not silently restored by reordering.

Projects are visible navigation containers again, matching the supplied hierarchy: a user Section
can contain ordered Projects, and a Project contains its ordered active Tasks. Projects with no
active Tasks remain visible with an empty label. A Project can be moved into or out of a Section,
reordered with peers, folded, and used to create a new Section. Existing legacy Task-to-Section
membership remains valid so renderer-local organization is not discarded during migration.

Feishu conversation, document, and base rows can be reordered inside their semantic Section, and
the three Feishu Sections can be reordered. Their order persists independently of server order,
pin state, refresh, and renderer remount. A drag operation changes only local navigation order; it
does not mutate Feishu. Project and Section ordering similarly changes only local navigation state;
it never moves a repository or changes a Task working directory.

Every active Task row shows a non-color-only checkout indicator: `Worktree` when the session owns
an isolated checkout and `Checkout` otherwise. A best-effort bounded GitHub lookup uses the
session's actual checkout path and the existing authenticated GitHub integration. When a pull
request exists, the row exposes one precedence-ordered status: merged, conflicts, CI failed, CI
running, or open. Missing or failed lookup stays quiet and never misreports a state. Statuses have
text/tooltips and accessible names in addition to semantic color.

## User experience

Not separately recorded in legacy change.md.

## Technical design

See Requirements and legacy Git history.

## Security and privacy

See migrated Decision and gates.

## Alternatives and non-goals

Not separately recorded in legacy change.md.

## Areas of concern

The user directly accepted the Intent and the visible macOS source-list direction on 2026-08-31.
The implementation keeps organization renderer-local and GitHub inspection read-only. No security,
data-migration, release, or production Gate is opened by this Artifact. Human review is required
before any merge, and the current request does not authorize creating or updating a pull request.

## Acceptance criteria

- [x] AC-1: No automatic or reserved Highlight Section renders; a persisted Section named `Highlight`
      is editable, reorderable, collapsible, archivable, and deletable like any other Section.
- [x] AC-2: Version-1 Section state migrates without losing valid Sections or Task membership, malformed
      data still fails closed, and the new order survives a renderer remount.
- [x] AC-3: Pointer drag can reorder manual Sections, reorder Tasks within a list, and move an active
      Task between manual/unsectioned Sections without duplication; context-menu or keyboard
      actions provide the same ordering path.
- [x] AC-4: Projects render as collapsible containers, can be reordered and moved between user Sections,
      retain their order/fold across remount, and preserve their repository and Task ownership.
- [x] AC-5: Section actions provide Edit, Archive all Tasks, and Delete; archive-all changes only Tasks
      currently assigned to that Section and waits for the existing archive path.
- [x] AC-6: Feishu conversation/document/base rows and their three semantic Sections retain user drag
      order across refresh and remount without changing pin/activity semantics or remote data.
- [x] AC-7: Active Task rows distinguish worktree from ordinary checkout and show an accurately derived
      GitHub PR state for merged, open, conflicts, failed CI, and running CI fixtures; lookup errors
      leave only the local checkout indicator.
- [x] AC-8: Focused model/rendered tests, renderer build, SDLC contract, and real rendered light, dark,
      and narrow sidebar inspection pass with no relevant console errors or horizontal clipping.

## Decision

The user directly accepted the Intent and the visible macOS source-list direction on 2026-08-31.
The implementation keeps organization renderer-local and GitHub inspection read-only. No security,
data-migration, release, or production Gate is opened by this Artifact. Human review is required
before any merge, and the current request does not authorize creating or updating a pull request.
