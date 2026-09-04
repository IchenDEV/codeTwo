---
id: "2026-08-31-instant-session-tab-switching"
stage: plan
schema: 3
status: accepted
owner: codex
created: 2026-08-31
based_on: spec.md
risk: medium
scope: apps/desktop
approved_by: "chenli"
approved_at: "2026-08-31"
---

# Plan: Make session tab switching immediate

## Files and ownership

apps/desktop

## Order of work

Replace the session list's shared animated indicator with the existing row-local selected class,
add a focused rendered assertion for the instantaneous selection contract, then verify the desktop
renderer and the running CodeTwo window. Rollback restores the shared liquid selection wrapper.

## Test-first proof

See legacy Verification section.

## Visual or integration proof

See legacy Verification section.

## Risks and mitigations

See legacy Decision and gates.

## Rollback

See legacy Review and release.

## Deviations

`SessionRail` now renders its task list as a plain container and applies the selected neutral fill
directly to the active session row. The row no longer transitions its background color, so switching
cannot leave a residual fade after removing the shared liquid indicator. Existing hover, focus,
popup-open, archive, disclosure, and action-button feedback remains in place. A focused rendered
test records the immediate-selection contract.

## Decision

The user's direct implementation request approves Intent and execution, with chenli as the named
approver. It extends the active sidebar work on PR #185. The user explicitly authorized the PR's
merge on 2026-08-31; no release is authorized.
