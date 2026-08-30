---
id: change-2026-08-31-sidebar-organization-git-status
kind: change
schema: 2
status: verified
risk: medium
owner: codex
approvers: user via the 2026-08-31 sidebar organization request and three supplied references
approved_at: 2026-08-31
created: 2026-08-31
updated: 2026-08-31
source: direct user request with Codex sidebar section, task, and Git-state screenshots
inputs: existing flat Task Sections, Feishu rail resources, session worktree provenance, and GitHub CLI integration
outputs: editable user Sections, persisted drag ordering, and quiet per-Task Git provenance and pull-request status
scope: apps/desktop
next_trigger: human review and feedback
verification_mode: owner
verified_by: codex
verified_at: 2026-08-31
---

# Make sidebar organization user-owned and show Git delivery state

## Intent

The user reported that the current sidebar implementation incorrectly treats `Highlight` as a
fixed system Section. In the supplied product reference it is only one user-created test grouping,
so CodeTwo must not infer special behavior from that name. The user also needs richer Section
editing, direct drag ordering for Tasks, Feishu conversations and documents, Projects where they
are represented, and Section groups, plus a quiet way to distinguish an isolated worktree from an
ordinary checkout and see whether the current branch's GitHub pull request is merged, open,
conflicting, or failing CI.

The affected surface is the desktop sidebar and its local organization state. The request does not
change Task execution, Project ownership, Feishu source data, Git history, GitHub pull requests,
or release state. GitHub lookup remains read-only and best effort; missing `gh`, authentication,
network, or pull-request data must not block the Task list. The direct request accepts Intent and
the visible interaction direction, but does not authorize a PR, merge, push, release, deployment,
or production mutation.

## Spec

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

### Acceptance criteria

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

## Decision and gates

The user directly accepted the Intent and the visible macOS source-list direction on 2026-08-31.
The implementation keeps organization renderer-local and GitHub inspection read-only. No security,
data-migration, release, or production Gate is opened by this Artifact. Human review is required
before any merge, and the current request does not authorize creating or updating a pull request.

## Plan

1. Version the sidebar organization state, migrate existing manual Sections, and add pure reorder
   operations for Sections, Projects, and Tasks.
2. Remove the automatic Highlight classifier and render every manual Section through one editable,
   draggable component with archive-all and accessible move alternatives; restore Projects as
   draggable child containers without changing their repository identity.
3. Add persisted Feishu Section/resource ordering without changing the connector protocol.
4. Add a bounded read-only Task Git status loader that reuses the existing GitHub bridge and maps
   raw PR/check state into one deterministic row status.
5. Protect migration, ordering, membership, failure handling, and rendering with focused tests;
   then build and inspect the real renderer in light, dark, standard, and narrow layouts.

Rollback reverts this change and lets the prior renderer read its version-1 Section key. The new
version uses a separate key so older builds do not reinterpret richer ordering data.

## Build

The sidebar organization model now has a version-2 local state with version-1 migration, explicit
Section and Task ordering, and no reserved Section names. A parallel Project organization model
persists Project-to-Section membership, peer order, and folds while leaving repository paths and
Task ownership unchanged. The rail renders Section, Project, and Task hierarchy with direct drag
handles plus menu move alternatives; Section menus expose Edit, Archive all Tasks, and Delete.

Feishu has an independent persisted ordering model for its semantic Sections and for conversation,
document, and base resources. The visible rows expose drag handles and Alt+Up/Down alternatives;
pin and activity metadata continue to come from Feishu rather than the local order model.

Each active Task now displays `Worktree` or `Checkout`. A bounded, deduplicated, read-only lookup
through the existing GitHub bridge maps current pull-request and check data to merged, conflicts,
CI failed, CI running, open, or closed. The result is refreshed on a timer and lookup failure
leaves only the local checkout indicator.

No material deviation from the accepted Plan was required.

## Verification

Verdict: verified.

- AC-1 and AC-2: model and rendered tests prove that no default Highlight is created, that an
  explicitly persisted `Highlight` receives the ordinary Section menu, and that version-1 state,
  membership, folds, and ordering migrate safely.
- AC-3 through AC-5: pure ordering tests and rendered `DragEvent` tests exercise the explicit Task
  and Project handles, cross-Section Task membership, Project grouping, folds, ordering, Section
  editing, archive-all, and delete behavior without duplicate rows.
- AC-6: Feishu ordering tests cover Section and resource persistence across server refresh order,
  while rendered inspection retained the supplied chat order and all conversation/document/base
  resources.
- AC-7: mapping and rendered tests cover worktree/checkout provenance plus merged, open,
  conflicting, CI failed, CI running, closed, and failed-lookup fixtures.
- AC-8: after rebasing onto `origin/main`, `bun test` passed 759 tests across 127 files with
  3,582 expectations and zero failures;
  `bunx tsc --noEmit`, `bun run lint:code`, `bun run lint:styles`, and
  `bun run build:renderer` all passed.
- Browser inspection covered light and dark themes at 320 px and 220 px sidebar widths. At 220 px,
  both the rail and Task rows had equal client and scroll widths, all checkout/PR text badges
  remained visible, and no relevant warning or error was present in the clean renderer console.
  Group and Project menus exposed the expected edit, order, archive, delete, and move targets.

### Acceptance evidence

- AC-1: PASS — `bun test tests/sidebarSections.test.ts tests/sessionRailRendered.test.tsx`
  covered the absence of an automatic Highlight and the ordinary menu for a user-created one.
- AC-2: PASS — `bun test tests/sidebarSections.test.ts` covered version-1 migration, malformed
  storage, membership, folds, and durable version-2 ordering.
- AC-3: PASS — `bun test tests/sidebarSections.test.ts tests/sessionRailRendered.test.tsx`
  exercised Task ordering, cross-Section membership, and rendered drag events on the handles.
- AC-4: PASS — `bun test tests/sidebarProjects.test.ts tests/sessionRailRendered.test.tsx` covered
  Project membership, order, folds, ownership-preserving hierarchy, and rendered drag events.
- AC-5: PASS — `bun test tests/sessionRailRendered.test.tsx` verified ordinary Section edit,
  archive-all, delete, and move actions in the rendered rail.
- AC-6: PASS — `bun test tests/feishuSidebarOrder.test.ts` verified durable semantic Section and
  resource order without mutating Feishu pin/activity data.
- AC-7: PASS — `bun test tests/sidebarGitStatus.test.ts tests/sessionRailRendered.test.tsx` covered
  checkout provenance, every specified PR/check state, precedence, concurrency, and lookup failure.
- AC-8: PASS — `bun test`, `bunx tsc --noEmit`, `bun run lint:code`,
  `bun run lint:styles`, `bun run build:renderer`, and rendered Browser inspection all passed.

Post-rebase lifecycle checks `bun script/verify/sdlc.ts` and
`bun script/verify/sdlc.ts --worktree` passed. `bun script/verify/docs.ts` is blocked by eight
unclassified website evidence PNGs already present at `origin/main`; GitHub main run 33331339486
shows the same failure before this branch is pushed.

Residual risk: organization order is intentionally renderer-local and does not sync across
machines. GitHub status is best effort and requires a working `gh` authentication/network path;
on failure the UI deliberately retains only the accurate local checkout badge. The in-app Browser
driver did not synthesize a native HTML5 `dragstart` from a physical mouse gesture, even against a
plain draggable probe, so drag handlers are protected by rendered `DragEvent` tests and the handles
were visually inspected, but the final physical macOS pointer gesture still needs human acceptance.
The repository-wide documentation Gate is currently red on `origin/main` because the website
evidence files above are absent from its catalog. This branch does not mix that unrelated repair
into the sidebar change, so its Draft PR will inherit the baseline failure until main is corrected.

## Review and release

Approval: the user authorized Draft PR creation on 2026-08-31; human code review and merge
approval remain pending.
Review surface: [Draft PR #195](https://github.com/IchenDEV/codeTwo/pull/195); merge is additionally
blocked by the existing main documentation-catalog failure.
Release target: none.
Release identity: not applicable until released.
Smoke evidence: not applicable until released.
Rollback: revert this change; the prior version-1 local organization key remains intact.
No release: commit, branch push, and Draft PR creation are authorized for review. Merge,
deployment, and release are not authorized.

Preparing this section does not authorize merge, deployment, release, or production mutation.

## Feedback

This Artifact is the follow-up to the 2026-08-31 correction that Highlight is ordinary user data.
No post-change feedback exists yet.
