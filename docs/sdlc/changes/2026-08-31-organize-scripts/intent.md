---
id: "2026-08-31-organize-scripts"
stage: intent
schema: 3
status: accepted
owner: codex
created: 2026-08-31
source: current user request to organize scripts like docs and keep only the simplest efficient tests
risk: medium
approved_by: "userthe current 2026-08-31 script-organization and minimal-test request"
approved_at: "2026-08-31"
---

# Intent: Organize scripts and trim Gate tests

## Problem

The `script/` root mixes development launchers, build helpers, validators, and two test files in one
flat list. The validators' twenty individual fixtures repeat setup and make a small script surface
look larger than it is. The user wants the same physical clarity as the docs cleanup and explicitly
prefers a minimal, efficient test set.

## Proposed outcome

The `script/` root mixes development launchers, build helpers, validators, and two test files in one

## Affected users and systems

Migrated from legacy change.md.

## Constraints

The user's direct request approves this repository-local implementation. Risk is medium because CI
and local developer command paths move, even though runtime behavior does not. Commit, push, PR,
merge, release, deployment, and external mutation remain unauthorized.

## Out of scope

Not recorded in the legacy single-file Artifact.

## Success signals

See Spec acceptance criteria.

## Open questions

None recorded in migration.

## Decision

The user's direct request approves this repository-local implementation. Risk is medium because CI
and local developer command paths move, even though runtime behavior does not. Commit, push, PR,
merge, release, deployment, and external mutation remain unauthorized.
