---
id: "2026-08-30-desktop-pet-pointer-interaction"
stage: plan
schema: 3
status: accepted
owner: codex
created: 2026-08-30
based_on: spec.md
risk: low
scope: apps/desktop
approved_by: "#decision-and-gates"
approved_at: "2026-08-30"
---

# Plan: Restore desktop pet pointer interaction

## Files and ownership

apps/desktop

## Order of work

First lock the rendered greeting and native input configuration into focused regression checks.
Then remove the conflicting native pass-through option, run the narrow checks, and verify the
packaged desktop surface in an isolated development profile if the current launcher supports the
required profile contract. Rollback is the inverse one-line native window option change.

## Test-first proof

See legacy Verification section.

## Visual or integration proof

See legacy Verification section.

## Risks and mitigations

See legacy Decision and gates.

## Rollback

See legacy Review and release.

## Deviations

The desktop pet `BrowserWindow` now disables Electrobun input pass-through while preserving the
existing transparent, non-activating, always-on-top companion window. The focused renderer test
locks the click-to-wave behavior, and the host contract prevents input pass-through from being
reintroduced.

## Decision

Intent and observable acceptance come directly from the user's 2026-08-30 report. No permission to
create a PR, merge, publish, or release is implied.
