---
id: "2026-09-01-empty-heading-project-typography"
stage: spec
schema: 3
status: accepted
owner: codex
created: 2026-09-01
based_on: intent.md
risk: low
approved_by: "userdirect screenshot feedback on 2026-09-01"
approved_at: "2026-09-01"
---

# Spec: Match the empty-heading project typography

## Requirements

- The Project trigger inherits the heading's font size, line height, weight, and letter spacing.
- The greeting keeps balanced spacing before and after the interactive Project name.
- The existing Project dropdown, focus behavior, selection, and empty-project fallback remain intact.
- No shared Button variant or unrelated composer typography changes.

## User experience

Not separately recorded in legacy change.md.

## Technical design

See Requirements and legacy Git history.

## Security and privacy

See migrated Decision and gates.

## Alternatives and non-goals

Not separately recorded in legacy change.md.

## Areas of concern

The user directly approved this correction. Ponytail selected the smallest shared-seam fix: override
only the inline trigger's inherited typography and add the missing whitespace. The shared Button
component, heading size, dropdown implementation, and layout remain unchanged.

This is low risk because it changes presentation on one empty-state trigger without changing data or
execution. Merge, release, and deployment are not authorized.

## Acceptance criteria

- [x] AC-1: Computed Project-trigger typography matches the containing empty-state heading.
- [x] AC-2: The Project name is visually separated from both surrounding greeting fragments.
- [x] AC-3: The Project dropdown remains accessible and interactive.
- [x] AC-4: Focused tests, renderer build, Browser QA, repository Gates, and a rebuilt native window pass.

## Decision

The user directly approved this correction. Ponytail selected the smallest shared-seam fix: override
only the inline trigger's inherited typography and add the missing whitespace. The shared Button
component, heading size, dropdown implementation, and layout remain unchanged.

This is low risk because it changes presentation on one empty-state trigger without changing data or
execution. Merge, release, and deployment are not authorized.
