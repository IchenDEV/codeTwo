---
id: "2026-08-30-desktop-pet-remove-voice-control"
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

# Plan: Remove the desktop pet voice control

## Files and ownership

apps/desktop

## Order of work

Lock the absence of the pet voice bridge into the existing component-policy contract, remove the
now-unused pet-specific plumbing from renderer through native RPC, then verify the focused tests
and built desktop pet window. Rollback is the inverse source change.

## Test-first proof

See legacy Verification section.

## Visual or integration proof

See legacy Verification section.

## Risks and mitigations

See legacy Decision and gates.

## Rollback

See legacy Review and release.

## Deviations

`CodeTwoPet` now owns only its mascot greeting and hide control. The desktop pet bridge and native
RPC state no longer carry voice enablement or voice text, while the composer continues to use the
existing `voice.composer` policy gate and `VoiceButton`.

## Decision

Intent and acceptance come directly from the user's 2026-08-30 follow-up. No permission to create
a PR, merge, publish, or release is implied.
