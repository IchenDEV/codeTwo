---
id: "2026-09-01-default-project-group"
stage: plan
schema: 3
status: accepted
owner: codex
created: 2026-09-01
based_on: spec.md
risk: low
scope: apps/desktop/src/sidebar/SessionRail.tsx, apps/desktop/tests/sessionRailRendered.test.tsx, docs/sdlc/changes/2026-09-01-default-project-group
approved_by: "[user]"
approved_at: "2026-09-01"
---

# Plan: Add a default Project group

## Files and ownership

apps/desktop/src/sidebar/SessionRail.tsx, apps/desktop/tests/sessionRailRendered.test.tsx, docs/sdlc/changes/2026-09-01-default-project-group

## Order of work

1. Add a rendered regression for the built-in group and its disclosure.
2. Wrap the existing root Project drop zone in the group without changing its contents.
3. Rebuild the existing desktop instance and run the required checks.

Rollback removes the built-in wrapper and restores the root Project list directly.

## Test-first proof

See legacy Verification section.

## Visual or integration proof

See legacy Verification section.

## Risks and mitigations

See legacy Decision and gates.

## Rollback

See legacy Review and release.

## Deviations

SessionRail now wraps the unchanged root Project drop zone in one built-in collapsible group. It
reuses the existing `All projects` string, Button, Collapsible, Chevron, and persisted-boolean hook.
The group opens by default, remembers the local fold preference, and temporarily opens while a
Project is being dragged so the root drop target remains available. No Project or Task data moved.

## Decision

The direct screenshot request approves this low-risk presentation change. Ponytail selects the
existing root Project render seam and the existing persisted disclosure primitive. No new Project,
Section, assignment, or synchronization model is introduced.
