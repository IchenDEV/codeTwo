---
id: "2026-08-31-prevent-list-header-tab-overflow"
stage: spec
schema: 3
status: accepted
owner: codex
created: 2026-08-31
based_on: intent.md
risk: low
approved_by: "userthe 2026-08-31 screenshot feedback and PR-and-merge request"
approved_at: "2026-08-31"
---

# Spec: Prevent list-header tabs from clipping in narrow panes

## Requirements

Each affected list pane keeps the semantic window titlebar as a stable title/action row and renders
its filter or category control in a dedicated row with no horizontal scrolling. Plugin category
counts remain visible when their own list pane has room and hide when that pane reaches the
content-defined narrow breakpoint. Responsive behavior is based on the list pane's inline size,
not the full page or device viewport.

Existing button, tab, group, focus, and accessible-name semantics remain unchanged. Existing
48px titlebar geometry, compact list/detail switching, search, selection, and platform safe-area
behavior remain compatible. No stored state or backend interface changes.

The title text, first filter/category label, and search affordance use one deliberate optical
content line derived from the existing 4px spacing grid. Outer control shapes may retain their own
padding; the visible content must not appear to begin on unrelated horizontal coordinates.

All split-list workbenches use the existing 32px `pageSection` content line. Component-specific
button padding may use a token-derived row offset to reach that line. Full-canvas Task board and
Docker layouts keep their existing page/chrome grids because they are not split-list rails.

## User experience

Not separately recorded in legacy change.md.

## Technical design

See Requirements and legacy Git history.

## Security and privacy

See migrated Decision and gates.

## Alternatives and non-goals

Not separately recorded in legacy change.md.

## Areas of concern

The user's direct implementation request accepts Intent and visible-design correction. The
existing semantic titlebar, control sizing, spacing tokens, and container-query architecture are
the design source of truth. Human review is required after verification. Pull request, merge,
release, deployment, and production Gates remain unauthorized.

The user's annotated alignment screenshot and direct `grid-layout` request accept reopening this
change for the scoped alignment correction.

The user's follow-up concern about other pages and direct request to improve them accepts extending
the same change to the peer Pull requests split-list surface and one shared 32px workbench rule.
The user's 2026-08-31 request, “pr & merge,” separately authorizes PR creation and merge after the
required repository checks pass; it does not authorize a product release or deployment.

The user's 2026-09-02 browser annotations accept reopening this change for one local spacing
correction: 4px inline padding on each Plugin Manager category tab and a larger 4px inter-tab gap.

The user's later 2026-09-02 browser annotation accepts reopening this change for an additional
local correction: reduce only the Plugin Manager category-and-search control stack's inline inset
from 16px to 8px, preserving its existing responsive behavior and adjacent surfaces.

## Acceptance criteria

- [x] AC-1: Automations displays All, Active, and Paused completely with no titlebar horizontal scrollbar
      at the standard narrow list-pane width.
- [x] AC-2: Features & plugins displays all five category labels completely; counts adapt to the list
      pane's own width and no category row has horizontal scrolling.
- [x] AC-3: Titles, create/recovery action, tab or filter semantics, keyboard focus, search, selection,
      and compact list/detail behavior remain intact.
- [x] AC-4: Focused rendered tests, renderer build, SDLC validation, and real light/dark narrow rendered
      inspection pass without clipping, horizontal overflow, framework overlay, or relevant
      console errors.
- [x] AC-5: In Automations, the title, All label, and search icon share the accepted optical content line
      when the persistent sidebar is present; a shell recovery action may precede the title when
      the sidebar is collapsed.
- [x] AC-6: Automations, Features & plugins, and Pull requests share the same 32px title, first-selection,
      and search-icon content line at standard width; the collapsed-sidebar recovery action remains
      an explicit shell exception.
- [x] AC-7: Pull requests separates its title/action row from its view/search controls without changing
      tab, filter, refresh, selection, or compact list/detail behavior.
- [x] AC-8: Every Plugin Manager category tab uses 4px inline padding and adjacent tabs use a 4px
      gap at the annotated list-pane width, without clipping or horizontal overflow.
- [x] AC-9: The Plugin Manager category-and-search control stack uses 8px left and right padding at
      the annotated viewport without changing list cards, detail layout, interaction, or overflow behavior.

## Decision

The user's direct implementation request accepts Intent and visible-design correction. The
existing semantic titlebar, control sizing, spacing tokens, and container-query architecture are
the design source of truth. Human review is required after verification. Pull request, merge,
release, deployment, and production Gates remain unauthorized.

The user's annotated alignment screenshot and direct `grid-layout` request accept reopening this
change for the scoped alignment correction.

The user's follow-up concern about other pages and direct request to improve them accepts extending
the same change to the peer Pull requests split-list surface and one shared 32px workbench rule.
The user's 2026-08-31 request, “pr & merge,” separately authorizes PR creation and merge after the
required repository checks pass; it does not authorize a product release or deployment.

The user's 2026-09-02 browser annotations accept reopening this change for one local spacing
correction: 4px inline padding on each Plugin Manager category tab and a larger 4px inter-tab gap.

The user's later 2026-09-02 browser annotation accepts reopening this change for an additional
local correction: reduce only the Plugin Manager category-and-search control stack's inline inset
from 16px to 8px, preserving its existing responsive behavior and adjacent surfaces.
