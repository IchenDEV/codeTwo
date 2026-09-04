---
id: "2026-08-31-instant-session-tab-switching"
stage: spec
schema: 3
status: accepted
owner: codex
created: 2026-08-31
based_on: intent.md
risk: medium
approved_by: "chenli"
approved_at: "2026-08-31"
---

# Spec: Make session tab switching immediate

## Requirements

Keep the existing neutral selected surface on the active session row, but render that surface on the
row itself instead of moving one shared liquid indicator through the session list. Preserve hover,
focus, popup-open, archive, collapse, and button feedback because those interactions communicate a
local state change rather than delaying tab selection. Other tab groups are outside this change.

## User experience

Not separately recorded in legacy change.md.

## Technical design

See Requirements and legacy Git history.

## Security and privacy

See migrated Decision and gates.

## Alternatives and non-goals

Not separately recorded in legacy change.md.

## Areas of concern

The user's direct implementation request approves Intent and execution, with chenli as the named
approver. It extends the active sidebar work on PR #185. The user explicitly authorized the PR's
merge on 2026-08-31; no release is authorized.

## Acceptance criteria

- [x] AC-1: Selecting a session updates the selected row and content immediately, with no animated
      indicator travelling between session rows.
- [x] AC-2: The active session keeps the existing neutral selected surface in light and dark appearance.
- [x] AC-3: Pointer, keyboard, context-menu, archive, and section-collapse interactions remain unchanged.
- [x] AC-4: The focused rendered test, renderer build, lifecycle check, and real CodeTwo window check pass.

## Decision

The user's direct implementation request approves Intent and execution, with chenli as the named
approver. It extends the active sidebar work on PR #185. The user explicitly authorized the PR's
merge on 2026-08-31; no release is authorized.
