---
id: "2026-09-01-ui-lab"
stage: plan
schema: 3
status: accepted
owner: codex
created: 2026-09-01
based_on: spec.md
risk: low
scope: apps/desktop/src/main.tsx, apps/desktop/src/theme.tsx, apps/desktop/src/i18n/index.tsx, apps/desktop/src/design, apps/desktop/layout-spec.json, apps/desktop/tests, docs/sdlc/changes/2026-09-01-ui-lab
approved_by: "userthe 2026-09-01 request to make UI test and design-system demo pages permanent"
approved_at: "2026-09-01"
---

# Plan: Add a permanent UI Lab and design-system demo catalog

## Files and ownership

apps/desktop/src/main.tsx, apps/desktop/src/theme.tsx, apps/desktop/src/i18n/index.tsx, apps/desktop/src/design, apps/desktop/layout-spec.json, apps/desktop/tests, docs/sdlc/changes/2026-09-01-ui-lab

## Order of work

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

## Test-first proof

See legacy Verification section.

## Visual or integration proof

See legacy Verification section.

## Risks and mitigations

See legacy Decision and gates.

## Rollback

See legacy Review and release.

## Deviations

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

## Decision

The user's direct implementation request on 2026-09-01 accepts Intent and this narrowly scoped
developer-tool design. Codex owns implementation and owner verification. The user's later `pr`
request authorizes creating a branch, pushing this verified scope, and opening a Draft PR. Merge,
release, deployment, and production mutation remain unauthorized.
