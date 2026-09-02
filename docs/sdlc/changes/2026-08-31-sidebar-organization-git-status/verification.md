---
id: "2026-08-31-sidebar-organization-git-status"
stage: verification
schema: 3
status: passed
owner: codex
created: 2026-08-31
based_on: plan.md
commit: ""
verification_mode: owner
verified_by: "codex"
verified_at: "2026-08-31"
release_target: none
release_identity: "not applicable until released."
---

# Verification: Make sidebar organization user-owned and show Git delivery state

## Automated checks

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
- AC-8: after rebasing onto current `origin/main`, `bun test` passed 762 tests across 129 files
  with 3,619 expectations and zero failures;
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
`bun script/verify/sdlc.ts --worktree` passed. The initial `bun script/verify/docs.ts` failure on
eight unclassified website evidence PNGs matched GitHub main run 33331339486. Current main now
contains the catalog repair in commit `f74ae5ee`; after rebasing, `bun script/verify/docs.ts` and
`bun test script/verify/checks.test.ts` both pass without a duplicate branch-local fix.

Residual risk: organization order is intentionally renderer-local and does not sync across
machines. GitHub status is best effort and requires a working `gh` authentication/network path;
on failure the UI deliberately retains only the accurate local checkout badge. The in-app Browser
driver did not synthesize a native HTML5 `dragstart` from a physical mouse gesture, even against a
plain draggable probe, so drag handlers are protected by rendered `DragEvent` tests and the handles
were visually inspected, but the final physical macOS pointer gesture still needs human acceptance.

## Behavioral evidence

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
- AC-8: after rebasing onto current `origin/main`, `bun test` passed 762 tests across 129 files
  with 3,619 expectations and zero failures;
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
`bun script/verify/sdlc.ts --worktree` passed. The initial `bun script/verify/docs.ts` failure on
eight unclassified website evidence PNGs matched GitHub main run 33331339486. Current main now
contains the catalog repair in commit `f74ae5ee`; after rebasing, `bun script/verify/docs.ts` and
`bun test script/verify/checks.test.ts` both pass without a duplicate branch-local fix.

Residual risk: organization order is intentionally renderer-local and does not sync across
machines. GitHub status is best effort and requires a working `gh` authentication/network path;
on failure the UI deliberately retains only the accurate local checkout badge. The in-app Browser
driver did not synthesize a native HTML5 `dragstart` from a physical mouse gesture, even against a
plain draggable probe, so drag handlers are protected by rendered `DragEvent` tests and the handles
were visually inspected, but the final physical macOS pointer gesture still needs human acceptance.

## Visual evidence

See bundle evidence/ when present.

## Security and privacy evidence

Not separately recorded unless present in legacy Verification.

## Deviations and residual risk

Residual risk: organization order is intentionally renderer-local and does not sync across

## Verdict

Verdict: verified..

## Review and release

Approval: the user authorized Draft PR creation on 2026-08-31; human code review and merge
approval remain pending.
Review surface: [Draft PR #195](https://github.com/IchenDEV/codeTwo/pull/195).
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
