---
id: "2026-08-31-stabilize-desktop-dom-harness"
stage: intent
schema: 3
status: accepted
owner: codex
created: 2026-08-31
source: user request to fix PR 198 CI on 2026-08-31
risk: low
approved_by: "[user]"
approved_at: "2026-08-31"
---

# Intent: Stabilize the desktop DOM test harness

## Problem

PR 198's Desktop design system workflow fails on Linux and macOS because Base UI ScrollArea asks
the shared happy-dom viewport for `getAnimations()`, an API the test DOM does not implement. The
same missing method causes otherwise unrelated rendered suites to fail depending on timer ordering.

This change is limited to test infrastructure. Production renderer behavior, dependencies, and
workflow runner versions remain unchanged.

## Proposed outcome

PR 198's Desktop design system workflow fails on Linux and macOS because Base UI ScrollArea asks

## Affected users and systems

Migrated from legacy change.md.

## Constraints

The user's direct CI repair request accepts this low-risk test-infrastructure Intent. Pushing the
fix to the existing PR is authorized by that request. Merge, release, and deployment remain pending
separate Gates.

## Out of scope

Not recorded in the legacy single-file Artifact.

## Success signals

See Spec acceptance criteria.

## Open questions

None recorded in migration.

## Decision

The user's direct CI repair request accepts this low-risk test-infrastructure Intent. Pushing the
fix to the existing PR is authorized by that request. Merge, release, and deployment remain pending
separate Gates.
