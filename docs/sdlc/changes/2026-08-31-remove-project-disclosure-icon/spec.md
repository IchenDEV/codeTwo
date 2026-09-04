---
id: "2026-08-31-remove-project-disclosure-icon"
stage: spec
schema: 3
status: accepted
owner: codex
created: 2026-08-31
based_on: intent.md
risk: low
approved_by: "[user]"
approved_at: "2026-08-31"
---

# Spec: Remove the Project disclosure icon

## Requirements

Project headers render the folder icon and Project name without a trailing disclosure arrow. The
existing Project header remains the accessible collapsible trigger, continues to expose its
expanded state, and still reveals or hides the Project's Tasks when activated. Section, archive,
menu, and unrelated chevron icons are outside this change.

## User experience

Not separately recorded in legacy change.md.

## Technical design

See Requirements and legacy Git history.

## Security and privacy

See migrated Decision and gates.

## Alternatives and non-goals

Not separately recorded in legacy change.md.

## Areas of concern

The direct user request accepts this low-risk Intent and visible UI direction. Human review remains
required before merge. No release or production action is authorized.

## Acceptance criteria

- [x] AC-1: Every Project header omits the trailing disclosure icon while retaining its folder icon.
- [x] AC-2: Activating the Project header still toggles its expanded state and Task content.
- [x] AC-3: Focused rendered tests, renderer checks, lifecycle checks, and a real rendered sidebar
      inspection pass.

## Decision

The direct user request accepts this low-risk Intent and visible UI direction. Human review remains
required before merge. No release or production action is authorized.
