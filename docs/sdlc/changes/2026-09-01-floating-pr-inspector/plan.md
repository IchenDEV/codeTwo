---
id: "2026-09-01-floating-pr-inspector"
stage: plan
schema: 3
status: accepted
owner: codex
created: 2026-09-01
based_on: spec.md
risk: low
scope: apps/desktop/src/github/PullRequestsPage.tsx, apps/desktop/src/github/pull-requests.css, apps/desktop/src/design/ui-lab, apps/desktop/layout-spec.json, apps/desktop/tests/githubPullRequestsRendered.test.tsx, apps/desktop/tests/uiLabRendered.test.tsx, docs/sdlc/changes/2026-09-01-floating-pr-inspector, docs/sdlc/changes/2026-09-01-floating-pr-inspector-prototype
approved_by: "userthe 2026-09-01 request to start implementing the approved floating Inspector"
approved_at: "2026-09-01"
---

# Plan: Promote the floating PR Inspector

## Files and ownership

apps/desktop/src/github/PullRequestsPage.tsx, apps/desktop/src/github/pull-requests.css, apps/desktop/src/design/ui-lab, apps/desktop/layout-spec.json, apps/desktop/tests/githubPullRequestsRendered.test.tsx, apps/desktop/tests/uiLabRendered.test.tsx, docs/sdlc/changes/2026-09-01-floating-pr-inspector, docs/sdlc/changes/2026-09-01-floating-pr-inspector-prototype

## Order of work

1. Move the selected inset, surface, border, radius, and elevation to the production Inspector CSS.
2. Record those stable constraints under the production Pull requests layout contract and protect
   them with the existing rendered test.
3. Delete the A/C variants, URL state, switcher, and prototype-only styling/test metadata from UI
   Lab while retaining the verified prototype Artifact as the decision record.
4. Run focused checks, inspect production-component rendering in dark/light and compact widths,
   then run the repository handoff Gates.

Rollback restores the attached Inspector classes/CSS and the earlier layout contract. No data,
backend, GitHub, migration, or remote cleanup is required.

## Test-first proof

See legacy Verification section.

## Visual or integration proof

See legacy Verification section.

## Risks and mitigations

See legacy Decision and gates.

## Rollback

See legacy Review and release.

## Deviations

The production `PullRequestsPage` Inspector keeps its existing grid column and semantics, while
`pull-requests.css` now supplies the selected 12px inset, surface border, modal radius, and raised
elevation. UI Lab continues to render `PullRequestsPage` itself, but its temporary variant query
state, switcher, A/C presentation styles, and prototype-only layout/test contracts are deleted.

The production layout contract records the stable floating-card geometry and preserves the 960px
Inspector collapse ahead of the existing 704px list/detail compact transition. No GitHub data,
operation, persistence, Dock, or conversation-side behavior changed.

## Decision

The user's direct request after reviewing the prototype accepts Intent, Spec, and the visual design
Gate for production implementation. Codex owns implementation and owner verification. The user's
later `pr` request authorizes creating a branch, pushing this verified scope, and opening a Draft
PR. Merge, release, deployment, and production-environment mutation remain unauthorized.
