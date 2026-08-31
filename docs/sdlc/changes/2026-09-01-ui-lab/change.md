---
id: change-2026-09-01-ui-lab
kind: change
schema: 2
status: verified
risk: low
owner: codex
approvers: user via the 2026-09-01 request to make UI test and design-system demo pages permanent
approved_at: 2026-09-01
created: 2026-09-01
updated: 2026-09-01
source: direct user request after clarifying that the earlier PR screenshots came from a temporary fixture page
inputs: existing DesignSystemPreview, development preview query routes, production UI components, and deterministic PR test fixtures
outputs: a permanent development-only UI Lab catalog with stable design-system and product-scenario URLs
scope: apps/desktop/src/main.tsx, apps/desktop/src/theme.tsx, apps/desktop/src/i18n/index.tsx, apps/desktop/src/design, apps/desktop/layout-spec.json, apps/desktop/tests, docs/sdlc/changes/2026-09-01-ui-lab
next_trigger: human review of the authorized Draft PR, then future UI Lab scenario additions
verification_mode: owner
verified_by: codex
verified_at: 2026-09-01
---

# Add a permanent UI Lab and design-system demo catalog

## Intent

The repository has a substantial `?design-system` preview and several one-off development query
routes, but no single discoverable catalog for stable UI fixtures. During PR-workspace validation a
temporary page was useful for rendering real components with deterministic data, yet the resulting
screenshot could be mistaken for the actual desktop application. The user asked to make a fixed
set of UI test and design-system demo pages available for future design and regression work.

The desired outcome is a development-only UI Lab with canonical URLs, an explicit fixture identity,
and real production components driven by deterministic local data. It must reuse the existing
design system and previews, avoid a second visual language, avoid remote GitHub actions, and stay
out of normal production application behavior. It is a developer surface, not evidence that an
authenticated real-app workflow passed.

## Spec

`?ui-lab=home` is the catalog. It links to `?ui-lab=design-system`,
`?ui-lab=pull-requests`, and `?ui-lab=pr-dock`, and also exposes the existing rich-transcript and
pet previews. The existing `?design-system` URL remains a backwards-compatible alias. Product
scenario pages use a shared lab toolbar with a back link, route identity, a visible
`Deterministic fixture` marker, theme links, and locale links. URL query state is sufficient for
direct reload and browser back/forward behavior.

The PR workspace scenario renders the real `PullRequestsPage` with stable list, detail, file,
check, reviewer, label, and task data. The PR Dock scenario renders the real Dock and
`GitHubPullRequestPanel` beside a restrained conversation fixture, including Overview and Changes.
Neither scenario calls the desktop bridge or mutates GitHub. Light/dark and English/Chinese
overrides are controlled by URL and do not persist into the user's normal application settings.

The catalog and scenario shell use the established 196px design-preview navigation width, 48px
toolbar, 1160px content bound, design tokens, and 760px compact breakpoint. At compact widths the
catalog navigation becomes a top bar and scenario content retains its own product breakpoints.
All navigation is semantic, keyboard reachable, visibly focused, and exposes current-page state.

### Acceptance criteria

- [x] AC-1: The development renderer exposes a discoverable UI Lab catalog with stable links to
      Design System, PR Workspace, PR Dock, rich transcript, and pet preview; the legacy
      `?design-system` route remains functional.
- [x] AC-2: PR Workspace and PR Dock render production components with deterministic local data,
      make fixture/dev-only identity unmistakable, and perform no bridge or remote mutation.
- [x] AC-3: `theme=system|light|dark` and `lang=en|zh` are URL-addressable for UI Lab routes and do
      not overwrite persisted normal-app preferences.
- [x] AC-4: Semantic navigation, current-page state, keyboard names/focus, light/dark rendering,
      and desktop/narrow reflow are protected by focused tests and real browser evidence without
      horizontal overflow or relevant console errors.
- [x] AC-5: Full desktop tests, renderer lint/type/build, docs and SDLC Gates, and production-build
      checks pass; normal application startup remains the fallback when no development preview
      query is present.

## Decision and gates

The user's direct implementation request on 2026-09-01 accepts Intent and this narrowly scoped
developer-tool design. Codex owns implementation and owner verification. The user's later `pr`
request authorizes creating a branch, pushing this verified scope, and opening a Draft PR. Merge,
release, deployment, and production mutation remain unauthorized.

## Plan

1. Record the fixed UI Lab shell and breakpoint contract in the existing layout specification.
2. Add a development-only query router and shared catalog/scenario shell under `src/design`.
3. Move deterministic PR workspace and Dock fixtures into permanent, explicitly labelled
   scenarios that render the existing production components.
4. Add non-persistent theme and locale provider overrides for URL-driven preview states while
   preserving existing provider behavior everywhere else.
5. Add route and rendered coverage, run full Gates, and inspect standard and narrow views in the
   in-app browser before marking this Artifact verified.

Rollback removes the UI Lab route/files and optional provider overrides. There is no stored data,
backend command, dependency, or remote cleanup.

## Build

- Added a development-only `?ui-lab=` router and catalog with canonical Design System, PR
  Workspace, and conversation-side PR Dock routes plus links to the existing rich-transcript and
  pet previews. The normal application remains the fallback, and the legacy `?design-system`
  alias remains available.
- Added a shared scenario toolbar, explicit `Dev only` and `Deterministic fixture` labels, stable
  layout-spec geometry, semantic catalog navigation, and responsive catalog/scenario shells using
  the existing C2 design tokens.
- Added deterministic PR data and API adapters that render the production `PullRequestsPage`,
  `Dock`, and `GitHubPullRequestPanel` without invoking the desktop bridge, network, or GitHub
  mutations.
- Added non-persistent theme and locale provider overrides. UI Lab URLs can select system, light,
  dark, English, or Chinese without rewriting the user's saved normal-app settings.
- Made the Design System preview inherit the selected URL theme and keep a visible return to UI
  Lab at both desktop and compact widths.

## Verification

Verdict: verified.

The in-app browser inspected the development renderer at `http://127.0.0.1:1420/`. At 1440x900,
the dark catalog, light PR Workspace, and dark conversation-side PR Dock rendered without clipping
or horizontal overflow. Theme navigation changed the URL and removed the dark root state. Review
changes selected the production Changes tab and revealed the fixture file list; Dock Changes 30
rendered the expected added and removed diff lines. At 680x860, PR Workspace switched from list to
detail, PR Dock became a full-width panel, and Design System kept a visible UI Lab return link.
Every inspected state reported `body.scrollWidth == window.innerWidth` and no relevant browser
warnings or errors.

### Acceptance evidence

- AC-1: PASS — `tests/uiLabRendered.test.tsx` protects the catalog's five stable destinations,
  current-page semantics, layout contract, development gate, and legacy Design System alias;
  browser navigation loaded each canonical page with title `C2` and meaningful DOM content.
- AC-2: PASS — `cd apps/desktop && bun test tests/uiLabRendered.test.tsx` protects the production
  workspace/Dock composition and deterministic PR, task, current-branch, and diff fixtures.
  Browser interaction confirmed the resolved fixture data and production Changes views; the
  production Vite output contains none of the UI Lab or fixture strings.
- AC-3: PASS — `cd apps/desktop && bun test tests/uiLabRendered.test.tsx` confirmed dark/Chinese
  preview state while the saved light/English preferences remained byte-for-byte unchanged.
  Browser theme navigation confirmed URL-addressed light and dark states; Design System inherited
  the URL theme.
- AC-4: PASS — `cd apps/desktop && bun test tests/uiLabRendered.test.tsx
  tests/githubPullRequestsRendered.test.tsx tests/githubPullRequestPanelRendered.test.tsx`
  protects the semantic and interaction contracts. Browser DOM snapshots confirmed semantic
  landmarks and controls; screenshots covered dark/light at 1440x900 and compact PR, Dock, and
  Design System at 680x860 with no horizontal overflow or console errors.
- AC-5: PASS — full `bun test` passed 799 tests across 138 files with 3829 expectations and zero
  failures. `bun run build:renderer` completed ESLint, Stylelint, TypeScript, and Vite build. Final
  docs, SDLC, worktree, and whitespace Gates passed.

Residual risk: UI Lab is intentionally a renderer-only developer surface, so it does not validate
native WebView chrome or authenticated GitHub mutations. Those remote actions remain disabled by
the fixture API and covered by the existing production panel tests rather than executed against a
real repository.

## Review and release

Review handoff: [Draft PR #212](https://github.com/IchenDEV/codeTwo/pull/212).
Approval: implementation plus Draft PR delivery from the user's 2026-09-01 requests.
Release target: none.
Release identity: not applicable until released.
Smoke evidence: not applicable until released.
Rollback: revert this change; no migration or remote cleanup is required.
No release: this remains a development surface; Draft PR creation is authorized, while merge,
deployment, and release are not authorized.

Preparing this section does not authorize merge, deployment, release, or production mutation.

## Feedback

No post-implementation feedback exists yet.
