---
id: change-2026-09-01-floating-pr-inspector
kind: change
schema: 2
status: verified
risk: low
owner: codex
approvers: user via the 2026-09-01 request to start implementing the approved floating Inspector
approved_at: 2026-09-01
created: 2026-09-01
updated: 2026-09-01
source: direct implementation request after reviewing change-2026-09-01-floating-pr-inspector-prototype
inputs: selected reserved floating-card prototype, production PullRequestsPage, existing Inspector layout contract, and permanent UI Lab fixture
outputs: the production PR Inspector as a reserved floating card with obsolete prototype variants removed
scope: apps/desktop/src/github/PullRequestsPage.tsx, apps/desktop/src/github/pull-requests.css, apps/desktop/src/design/ui-lab, apps/desktop/layout-spec.json, apps/desktop/tests/githubPullRequestsRendered.test.tsx, apps/desktop/tests/uiLabRendered.test.tsx, docs/sdlc/changes/2026-09-01-floating-pr-inspector, docs/sdlc/changes/2026-09-01-floating-pr-inspector-prototype
next_trigger: human review of the authorized Draft PR
verification_mode: owner
verified_by: codex owner verification
verified_at: 2026-09-01
---

# Promote the floating PR Inspector

## Intent

The UI Lab comparison established that a reserved floating card gives the PR Inspector clearer
hierarchy without obscuring review content. The user selected that direction and asked to begin
implementation. The production PR Workspace should now use the chosen floating treatment, while
the permanent UI Lab should return to rendering a single truthful production state instead of
retaining obsolete prototype controls.

This change is visual only. It must preserve Inspector content, semantics, width bounds, scrolling,
the 960px collapse rule, list/detail compact behavior, GitHub operations, and persisted state. It
must not keep A/C variants, add a presentation setting, change the conversation-side PR Dock, or
introduce another component abstraction.

## Spec

At widths above 960px, the trailing Inspector remains in its existing reserved grid column and is
inset 12px from the top, right, and bottom. It uses the established surface, border, modal radius,
and raised-elevation tokens. The leading edge remains aligned with its reserved column so primary
content width and existing hierarchy match the approved prototype. At or below 960px the Inspector
continues to hide before the list/detail compact transition.

The UI Lab PR Workspace renders this production behavior directly. Prototype query-state parsing,
the A/B/C switcher, overlay styles, and prototype-specific tests/layout metadata are removed.

### Acceptance criteria

- [x] AC-1: The production Pull requests page renders its trailing Inspector as the selected
      reserved floating card without changing its content, semantics, width bounds, or actions.
- [x] AC-2: At or below 960px the Inspector still hides before the existing 704px list/detail
      transition, with no horizontal overflow in desktop or compact UI Lab rendering.
- [x] AC-3: The permanent UI Lab renders the production PR Workspace without variant query state,
      prototype switcher UI, or prototype-only CSS and layout contracts.
- [x] AC-4: Focused tests, full desktop tests, renderer build, documentation and SDLC Gates, and
      rendered dark/light/narrow inspection pass with no relevant console errors.

## Decision and gates

The user's direct request after reviewing the prototype accepts Intent, Spec, and the visual design
Gate for production implementation. Codex owns implementation and owner verification. The user's
later `pr` request authorizes creating a branch, pushing this verified scope, and opening a Draft
PR. Merge, release, deployment, and production-environment mutation remain unauthorized.

## Plan

1. Move the selected inset, surface, border, radius, and elevation to the production Inspector CSS.
2. Record those stable constraints under the production Pull requests layout contract and protect
   them with the existing rendered test.
3. Delete the A/C variants, URL state, switcher, and prototype-only styling/test metadata from UI
   Lab while retaining the verified prototype Artifact as the decision record.
4. Run focused checks, inspect production-component rendering in dark/light and compact widths,
   then run the repository handoff Gates.

Rollback restores the attached Inspector classes/CSS and the earlier layout contract. No data,
backend, GitHub, migration, or remote cleanup is required.

## Build

The production `PullRequestsPage` Inspector keeps its existing grid column and semantics, while
`pull-requests.css` now supplies the selected 12px inset, surface border, modal radius, and raised
elevation. UI Lab continues to render `PullRequestsPage` itself, but its temporary variant query
state, switcher, A/C presentation styles, and prototype-only layout/test contracts are deleted.

The production layout contract records the stable floating-card geometry and preserves the 960px
Inspector collapse ahead of the existing 704px list/detail compact transition. No GitHub data,
operation, persistence, Dock, or conversation-side behavior changed.

## Verification

Verdict: verified.

### Acceptance evidence

- AC-1: PASS — `cd apps/desktop && bun test tests/githubPullRequestsRendered.test.tsx tests/uiLabRendered.test.tsx` completed with 10 passing tests and 85 expectations; live dark and light UI Lab inspection measured the production Inspector at a 12px top/right/bottom inset, 16px radius, token-derived shadow, intact `complementary` semantics, and working Review changes navigation.
- AC-2: PASS — `cd apps/desktop && bun test tests/githubPullRequestsRendered.test.tsx tests/uiLabRendered.test.tsx` protected the 960px/704px layout contract; live checks at 1280px, 920px, and 680px found no horizontal overflow, hid only the Inspector at 920px, and preserved the existing list-only compact state at 680px.
- AC-3: PASS — `rg -n "ui-lab-prototype-switcher|data-inspector-variant|PullRequestInspectorVariant|variant=overlay|variant=attached" apps/desktop/src apps/desktop/tests apps/desktop/layout-spec.json` returned no matches, while dark/light rendering exposed no prototype controls or variant query state.
- AC-4: PASS — `cd apps/desktop && bun test` completed with 799 passing tests, 0 failures, and 3,847 expectations; `bun run lint` and `bun run build:renderer` passed; `bun script/verify/docs.ts`, `bun script/verify/sdlc.ts`, `bun script/verify/sdlc.ts --worktree`, and `git diff --check` passed. Dark, light, medium, and narrow rendered inspection produced no relevant console warning or error.

Lock-screen-compatible native acceptance additionally launched the current packaged `C2-dev.app`
against a fresh isolated data directory. The native host stayed live, bound its expected local port,
and registered a 1176x784 `C2 Dev` main window with the macOS window server. Because macOS blocks
window capture while the desktop is locked, a same-host native `WKWebView` harness loaded the
permanent production-component fixture and used WebKit's own snapshot path. The harness advanced
only the decorative entrance animation to its normal completed state because hidden documents do
not tick that animation. At 1280x720 it verified and captured dark and light rendering with the
12px right inset, 16px radius, token-derived shadow, no overflow, and no error state; clicking
Review changes selected Changes and rendered the 30-file view. At 920x800 it verified and captured
the expected hidden Inspector with both list and detail panes remaining visible and no overflow.

Residual risk: the locked-machine pass separates native-shell startup from native-WebKit visual
and interaction rendering; it does not provide a pixel capture of the actual Electrobun window.
A signed-in native-shell GitHub session was also not exercised, so provider/auth integration remains
covered by existing automated behavior rather than this visual pass.

## Review and release

Review handoff: [Draft PR #212](https://github.com/IchenDEV/codeTwo/pull/212).
Approval: implementation plus Draft PR delivery from the user's 2026-09-01 requests.
Release target: none.
Release identity: not applicable until released.
Smoke evidence: not applicable until released.
Rollback: revert this production floating-card change; no migration or remote cleanup is required.
No release: Draft PR delivery is authorized; merge and release are not authorized.

Preparing this section does not authorize merge, deployment, release, or production mutation.

## Feedback

No post-implementation feedback exists yet.
