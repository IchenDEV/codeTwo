---
id: "2026-08-31-desktop-motion-and-performance"
stage: plan
schema: 3
status: accepted
owner: codex
created: 2026-08-31
based_on: spec.md
risk: medium
scope: apps/desktop/src/App.tsx, apps/desktop/src/automation/AutomationsPage.tsx, apps/desktop/src/docker/DockerPage.tsx, apps/desktop/src/github/PullRequestsPage.tsx, apps/desktop/src/plugins/PluginManagerPage.tsx, apps/desktop/src/sidebar/SessionRail.tsx, apps/desktop/src/styles.css, apps/desktop/src/taskboard/TaskBoardPage.tsx, apps/desktop/tests/desktopPerformanceContract.test.ts, apps/desktop/tests/taskBoardRendered.test.tsx, docs/sdlc/changes/2026-08-31-desktop-motion-and-performance
approved_by: "[user]"
approved_at: "2026-08-31"
---

# Plan: Repair desktop motion and interaction performance

## Files and ownership

apps/desktop/src/App.tsx, apps/desktop/src/automation/AutomationsPage.tsx, apps/desktop/src/docker/DockerPage.tsx, apps/desktop/src/github/PullRequestsPage.tsx, apps/desktop/src/plugins/PluginManagerPage.tsx, apps/desktop/src/sidebar/SessionRail.tsx, apps/desktop/src/styles.css, apps/desktop/src/taskboard/TaskBoardPage.tsx, apps/desktop/tests/desktopPerformanceContract.test.ts, apps/desktop/tests/taskBoardRendered.test.tsx, docs/sdlc/changes/2026-08-31-desktop-motion-and-performance

## Order of work

1. Lock the page-motion, lazy-route, deferred-search, progressive-board, and off-screen-row
   contracts with focused tests.
2. Add a small shared page loading boundary and move optional full-page implementations behind
   lazy imports.
3. Replace translated data-page entrances with the shared opacity-only motion and defer the three
   measured search filters.
4. Apply safe paint containment to session rows, then run deterministic build-size and rendered
   interaction measurements.

## Test-first proof

See legacy Verification section.

## Visual or integration proof

See legacy Verification section.

## Risks and mitigations

See legacy Decision and gates.

## Rollback

See legacy Review and release.

## Deviations

Implemented five lazy full-page route boundaries with an accessible Suspense fallback, one shared
opacity-only data-page entrance, deferred filtering for task-board, pull-request, and plugin
search, and off-screen paint containment for session-rail rows. Pull-request avatars now use lazy
image loading and asynchronous decoding. The large-board three-card-per-lane behavior remains
unchanged.

## Decision

The user explicitly approved implementation and then required the performance investigation to be
completed as part of the same request. The repository's existing motion tokens, progressive task
board, React lazy loading, deferred values, and CSS containment are sufficient; no new animation
library or virtualization dependency is approved. Merge, release, deployment, and termination of
another live C2 process remain separate human Gates.
