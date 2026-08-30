---
id: change-2026-08-31-panel-window-controls-safe-area
kind: change
schema: 2
status: verified
risk: medium
owner: codex
approvers: [user]
approved_at: 2026-08-31
created: 2026-08-31
updated: 2026-08-31
source: user-supplied Pull requests and Automations overlap screenshots on 2026-08-31
inputs: direct implementation request, screenshots, existing macOS window-controls safe-area contract
outputs: scoped split-panel header adaptation, focused regression coverage, and rendered evidence
scope: apps/desktop
next_trigger: merge authorized Draft PR 186 after refreshed required checks pass
verification_mode: owner
verified_by: codex
verified_at: 2026-08-31
---

# Keep panel headers clear of macOS window controls

## Intent

The user supplied live macOS screenshots showing the collapsed-sidebar headers in Pull requests
and Automations underneath the traffic lights or system capture indicator. The title, leading
sidebar action, and filters must remain readable and operable without making the compact desktop
chrome taller or shifting unrelated detail panes.

The affected systems are the two split-panel renderer pages and their responsive header layout.
Data loading, GitHub behavior, automation scheduling, window ownership, other full-page panels,
and release behavior are non-goals. The direct request accepts this Intent and the visible design
correction; the later `pr` request authorizes an isolated Draft PR, but not merge or release.

## Spec

When the session rail is collapsed, the currently visible leftmost panel header uses C2's existing
macOS window-controls safe inset. In the normal two-pane layout this is the list header only. At the
existing 44rem compact split breakpoint, selecting a Pull request or Automation hides the list, so
the detail header becomes leftmost, inherits the safe inset, and exposes both the sidebar recovery
action and its existing back-to-list action.

When the rail is open, existing horizontal alignment is unchanged. Windows and browser previews
keep the existing compact inset. Header height, filter/tab semantics, keyboard names, data state,
and the 44rem layout threshold remain unchanged. The implementation follows the existing C2
container-query and safe-area classes instead of adding device-specific JavaScript state.

### Acceptance criteria

- [x] AC-1: With the rail collapsed in the normal two-pane layout, Pull requests and Automations list
      header controls, titles, and filters clear macOS window controls/system capture chrome.
- [x] AC-2: At the existing compact breakpoint, the visible detail header clears the same system area
      and exposes operable sidebar-expand and back-to-list actions without horizontal overflow.
- [x] AC-3: With the rail open, both list and detail header alignment remains unchanged; filter, tab,
      refresh/create, selection, and back behavior retain their accessible names and behavior.
- [x] AC-4: Focused rendered tests, design-system validation, renderer build, SDLC check, and real
      light/dark standard plus narrow rendered inspection pass without relevant console errors.

## Decision and gates

The user's direct screenshot-backed implementation request is Intent and visible-design approval.
The implementation reuses the established `window-controls-safe-main` contract and the two pages'
existing container queries. The user's direct `merge` instruction on 2026-08-31 accepts the Review
and Merge Gate for PR #186. It does not authorize release, deployment, or production mutation.

## Plan

1. Make each list header opt into the existing safe inset only when the collapsed-rail recovery
   action is present.
2. Add one shared compact-safe header class and a compact-only leading-action slot for detail panes,
   then apply them to Pull requests and Automations at their existing split breakpoint.
3. Protect wide/open-rail and compact/collapsed-rail behavior with focused rendered assertions;
   verify the isolated branch before opening the Draft PR.

Rollback removes the conditional header classes, compact-only action slots, compact list state,
and their focused tests, restoring the prior split-panel header layout without touching stored data.

## Build

- Pull requests and Automations list headers conditionally use C2's existing main-window safe inset
  only when the rail is collapsed and its recovery action is present.
- A shared compact-detail safe inset and compact-only recovery-action slot protect a detail pane
  when it becomes the leftmost surface below 44rem, while wide detail alignment remains unchanged.
- Pull requests tracks compact list visibility separately from selection, matching Automations.
  Its back button therefore stays on the list instead of being immediately reversed by automatic
  first-item selection.
- Both page titlebars use the repository's 48px semantic titlebar height.
- The adjacent detail tabs use the repository's named control geometry and inset focus utilities,
  replacing direct token classes invalidated when the header source moved.
- Focused rendered coverage checks collapsed/open-rail header classes, compact recovery actions,
  Pull-request list/detail switching, and the back-to-list interaction.

## Verification

Verdict: verified.

- The isolated PR branch focused run passed 10 tests and 77 expectations. Existing asynchronous
  ScrollArea/bridge React `act(...)` warnings remained non-failing.
- `bun run build:renderer` passed the design-system source gate with 0 new violations and 616
  tracked legacy occurrences, TypeScript, the production Vite build with 6,396 transformed
  modules, and the generated-dist design check with 35 semantic selectors. Vite retained its
  existing large-chunk advisory.
- The first isolated build stopped because moving the Pull requests detail header invalidated a
  baseline location for its adjacent direct-token tab classes. Both affected detail tab groups now
  use the existing semantic control utilities; the complete rerun passed.
- Browser-backed inspection of the same scoped layout rules passed dark and light schemes at
  1280x720 and compact 680x720 widths with no horizontal overflow, framework overlay, or console
  errors. With the rail collapsed on macOS, both pages measured a 48px header and 96px safe inset.
- A read-only inspection of the already-running native C2 Dev window confirmed the system capture
  indicator/window-control group occupies the leading region covered by the repository's 96px
  safe-area contract. That app belongs to another worktree and is not evidence that this branch is
  running natively.

### Acceptance evidence

- AC-1: PASS — `Verification record above` preserves the original passing evidence.
- AC-2: PASS — `Verification record above` preserves the original passing evidence.
- AC-3: PASS — `Verification record above` preserves the original passing evidence.
- AC-4: PASS — `Verification record above` preserves the original passing evidence.

Residual risk: the compact detail surface cannot be populated in a renderer-only Browser because
the non-desktop bridge intentionally returns no Pull requests or Automations. The focused rendered
interaction tests therefore remain the branch-level evidence for that state. A second native Core
must not be launched while another worktree owns the default data directory.

## Review and release

Approval: the user authorized merging PR #186 through a direct `merge` instruction on 2026-08-31.
Review surface: [Draft PR #186](https://github.com/IchenDEV/codeTwo/pull/186).
Release target: none requested.
Release identity: not applicable until released.
Smoke evidence: not applicable until released.
Rollback: revert the scoped PR commit.
No release: repository integration is authorized, but no package, deployment, or versioned release
was requested.

## Feedback

No post-change feedback exists yet.
