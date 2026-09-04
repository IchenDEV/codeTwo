---
id: "2026-08-30-memory-settings-redesign"
stage: spec
schema: 3
status: accepted
owner: codex
created: 2026-08-30
based_on: intent.md
risk: low
approved_by: "#decision-and-gates"
approved_at: "2026-08-30"
---

# Spec: Redesign the Memory settings workspace

## Requirements

The task-session ImageGen concept `exec-7d022327-2e17-4113-bd6f-e80b78207060.png` is the visual
reference. Keep the repository's 768px settings content column and semantic design tokens. Reuse
the shared page-header anatomy, retain one flat behavior disclosure, and group status, views,
filters, list, and details inside one workbench surface. Use semantic hairlines for structure,
reserve blue for interactive emphasis, and give the list and inspector the same neutral surface.
Keep all eight existing view buttons and use compact spacing so the final Conflicts view remains
reachable without changing the filter contract.

At viewport widths at or below 1024px, keep the existing list-only layout and detail dialog. At
800px and below, stack the page header actions and use the existing compact two-column filter grid.

## User experience

Not separately recorded in legacy change.md.

## Technical design

See Requirements and legacy Git history.

## Security and privacy

See migrated Decision and gates.

## Alternatives and non-goals

Not separately recorded in legacy change.md.

## Areas of concern

Intent and design direction are accepted by the user's 2026-08-30 implementation request and
attached screenshot. No permission to create a PR, merge, publish, or release is implied.

## Acceptance criteria

- [x] AC-1: The Memory page uses the shared page header and aligns project selection with New memory.
- [x] AC-2: Memory behavior remains expandable and visually subordinate to the main workbench.
- [x] AC-3: Status, views, search, filters, list, and inspector form one flat grouped surface.
- [x] AC-4: The empty inspector no longer uses a blue-tinted panel and both empty states are centered.
- [x] AC-5: All existing filter modes remain reachable, including conflicts through Needs attention.
- [x] AC-6: Standard, narrow, light, and dark rendered states have no clipping or horizontal overflow.
- [x] AC-7: Focused behavior, layout, design-system, renderer, SDLC, and diff checks pass.

## Decision

Intent and design direction are accepted by the user's 2026-08-30 implementation request and
attached screenshot. No permission to create a PR, merge, publish, or release is implied.
