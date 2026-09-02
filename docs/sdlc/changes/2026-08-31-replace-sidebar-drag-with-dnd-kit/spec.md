---
id: "2026-08-31-replace-sidebar-drag-with-dnd-kit"
stage: spec
schema: 3
status: accepted
owner: codex
created: 2026-08-31
based_on: intent.md
risk: medium
approved_by: "[user]"
approved_at: "2026-08-31"
---

# Spec: Replace sidebar drag handling with dnd-kit

## Requirements

Use `@dnd-kit/react` to provide pointer and keyboard drag input for Section, Project, and Task rows.
Projects can reorder within a root or Section list, move into a Section including an empty Section,
and move back to the root list. Existing Task and Section moves continue to call the current domain
operations. The implementation must not depend on native HTML5 `draggable`, `dragstart`, or
`dataTransfer` handlers.

## User experience

Not separately recorded in legacy change.md.

## Technical design

See Requirements and legacy Git history.

## Security and privacy

See migrated Decision and gates.

## Alternatives and non-goals

Not separately recorded in legacy change.md.

## Areas of concern

The direct user request accepts this medium-risk Intent and the dependency choice. Human review
remains required before merge. No release or production action is authorized.

## Acceptance criteria

- [x] AC-1: A physical pointer drag reorders Projects in the root list and persists the new order.
- [x] AC-2: A physical pointer drag moves a Project into a user Section and back to the root list,
      including a Section without existing Projects.
- [x] AC-3: Section and Task drag targets continue to map to the existing move operations, with
      keyboard drag support supplied by the library. Nested Task rows outrank their nonempty
      container, and dropping outside a compatible target cancels instead of reusing stale hover.
- [x] AC-4: Focused rendered tests, type checks, renderer build, lifecycle checks, and an isolated
      real rendered-window inspection pass.

## Decision

The direct user request accepts this medium-risk Intent and the dependency choice. Human review
remains required before merge. No release or production action is authorized.
