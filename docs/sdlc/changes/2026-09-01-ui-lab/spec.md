---
id: "2026-09-01-ui-lab"
stage: spec
schema: 3
status: accepted
owner: codex
created: 2026-09-01
based_on: intent.md
risk: low
approved_by: "userthe 2026-09-01 request to make UI test and design-system demo pages permanent"
approved_at: "2026-09-01"
---

# Spec: Add a permanent UI Lab and design-system demo catalog

## Requirements

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

## User experience

Not separately recorded in legacy change.md.

## Technical design

See Requirements and legacy Git history.

## Security and privacy

See migrated Decision and gates.

## Alternatives and non-goals

Not separately recorded in legacy change.md.

## Areas of concern

The user's direct implementation request on 2026-09-01 accepts Intent and this narrowly scoped
developer-tool design. Codex owns implementation and owner verification. The user's later `pr`
request authorizes creating a branch, pushing this verified scope, and opening a Draft PR. Merge,
release, deployment, and production mutation remain unauthorized.

## Acceptance criteria

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

## Decision

The user's direct implementation request on 2026-09-01 accepts Intent and this narrowly scoped
developer-tool design. Codex owns implementation and owner verification. The user's later `pr`
request authorizes creating a branch, pushing this verified scope, and opening a Draft PR. Merge,
release, deployment, and production mutation remain unauthorized.
