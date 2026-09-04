---
id: "2026-08-31-prevent-list-header-tab-overflow"
stage: plan
schema: 3
status: accepted
owner: codex
created: 2026-08-31
based_on: spec.md
risk: low
scope: apps/desktop, docs/sdlc/changes/2026-08-31-prevent-list-header-tab-overflow
approved_by: "userthe 2026-08-31 screenshot feedback and PR-and-merge request"
approved_at: "2026-08-31"
---

# Plan: Prevent list-header tabs from clipping in narrow panes

## Files and ownership

apps/desktop, docs/sdlc/changes/2026-08-31-prevent-list-header-tab-overflow

## Order of work

1. Separate each affected title/action row from its filter or category row while retaining existing
   semantics and the macOS collapsed-sidebar safe area.
2. Base plugin count compaction on a named list-pane container and remove titlebar horizontal
   scrolling from both surfaces.
3. Add focused rendered and source-contract coverage, then verify build, lifecycle contract, and
   real narrow light/dark rendering.
4. Measure the visible title, first selection label, and search affordance against the existing
   4px grid; correct their shared optical line with existing spacing tokens and repeat rendered QA.
5. Record one 32px split-list content line in the layout specification, apply it to the three peer
   workbenches, and keep unrelated full-canvas page shells outside this rule.
6. Replace the Plugin Manager compact row's asymmetric 8px/2px tab padding and 2px gap with the
   existing 4px inline spacing token, preserving the 24rem count-hiding breakpoint.
7. Replace the Plugin Manager category-and-search stack's 16px inline padding with the existing
   8px spacing utility, then repeat focused and rendered checks at the annotated viewport.

Rollback restores the two prior single-row headers and page-level plugin breakpoint rules; no data,
configuration, or external state is changed.

## Test-first proof

See legacy Verification section.

## Visual or integration proof

See legacy Verification section.

## Risks and mitigations

See legacy Decision and gates.

## Rollback

See legacy Review and release.

## Deviations

[PR #191](https://github.com/IchenDEV/codeTwo/pull/191) carries the scoped implementation and its
schema-2 lifecycle record.

[PR #219](https://github.com/IchenDEV/codeTwo/pull/219) carries the 2026-09-02 Web UI follow-up and
the local Plugin Manager spacing correction.

- Automations keeps its 48px title/action row and renders the existing accessible filter group plus
  search field in a dedicated list-control stack below it. The macOS safe-area class remains on the
  actual titlebar and the create action retains its accessible name and behavior.
- Features & plugins uses the same title/control separation. Its category group no longer scrolls
  horizontally, and the five labels retain their existing tab roles, selected state, focus styling,
  counts, and click behavior.
- The plugin list pane is now a named inline-size container. Below its content-defined 24rem
  threshold, only numeric counts hide; category labels and spacing remain visible.
- Focused rendered tests protect the title/control separation, all five category tabs, absence of
  the prior overflow utility, and the list-pane container query.
- The layout specification now records one 32px split-list workbench content line. Automations,
  Features & plugins, and Pull requests use that line for their title, first selection label, and
  search icon while preserving the collapsed-sidebar recovery-action exception.
- Pull requests now keeps refresh in its title/action row and renders view tabs, search, and author
  filtering in the dedicated list-control stack below it. Existing roles, state, names, and compact
  list/detail behavior are retained.
- At the plugin list's 24rem compact threshold, optical inter-tab spacing and the final tab's end
  padding keep every label inside the control width without restoring a horizontal scroller.
- Focused assertions protect the alignment-token classes, tab-label measurement hooks, compact
  end padding, title/control separation, and existing leading-action exception.
- The 2026-09-02 follow-up replaces Plugin Manager's asymmetric 8px/2px category padding and 2px
  compact gap with the existing 4px inline token for every tab and every adjacent gap. The 24rem
  container breakpoint continues to hide only numeric counts.
- The later 2026-09-02 follow-up replaces only the Plugin Manager category-and-search control
  stack's 16px inline inset with the existing 8px spacing utility. List cards, the detail pane,
  category-tab spacing, and responsive breakpoints remain unchanged.

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
