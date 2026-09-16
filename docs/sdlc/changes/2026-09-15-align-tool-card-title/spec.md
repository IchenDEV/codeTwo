---
id: 2026-09-15-align-tool-card-title
schema: 5
stage: spec
status: accepted
owner: chenli
created: 2026-09-15
based_on: intent.md
---

# Spec: Align the transcript tool card title

## Design

Two layout corrections, both feature-owned classes on existing elements:

1. **Title leading (centering fix).** Both transcript tool-card disclosure triggers in
   `apps/desktop/src/session/TurnCard.tsx` gain the `text-start` utility alongside their existing
   `justify-start` row layout:
   - `ToolCallBlock`'s `CollapsibleTrigger` (single tool with output, also used for compact history
     rows).
   - `ToolCallGroup`'s `CollapsibleTrigger` (a run of adjacent tool calls).

   `TextAlign` is a layout class the design system lets feature code pass
   (`docs/design/system.md`: "A feature may pass layout classes"). The `Button` base keeps
   `justify-center`, so ordinary buttons keep centered labels.

2. **Column leading compensation.** Every top-level assistant-column element removes the leading
   inset that its own control padding adds, so the icon/dot shares the markdown text edge:
   - the same two triggers add `has-[>svg]:ps-0`, dropping the compact `has-[>svg]:px-module-inset`
     start side while the end side stays;
   - the no-output tool row in `ToolCallBlock` changes `px-1` to `pe-1` (start at 0, end stays 4px);
   - the chart legend row in `apps/desktop/src/session/ChartBlock.tsx` gains `-ms-surface-inset`,
     compensating the 12px `px-surface-inset` of its `size="compact"` legend buttons (container
     margin, so the legend items do not accumulate an offset).

Boundaries: the tool title keeps `min-w-0 flex-1 truncate`, so long titles still truncate and the
trailing kind/status/chevron stay at the end of the row; the chart plot area, legend gaps, and the
compact history indentation (`ps-5`) are unchanged. No behavior, markup, or token changes, so
collapsed/expanded, compact, and non-compact paths all inherit the fix.

Failure path: if an ancestor reintroduces centered text or a leading inset, the regression tests below
fail because they assert the leading-alignment and inset contract on the rendered class lists, and the
browser geometry check in Verification measures the shared leading edge.

## Acceptance criteria

- [x] AC-1: Both transcript tool-card disclosure triggers carry `text-start`, so the tool title
  renders from the leading edge next to the icon instead of centered across the row.
- [x] AC-2: Both triggers also carry `has-[>svg]:ps-0`, and the no-output tool row keeps only `pe-1`,
  so every tool-row leading icon sits on the markdown text edge.
- [x] AC-3: The chart legend row carries `-ms-surface-inset`, so the series dots sit on the same
  content edge as the transcript text.
- [x] AC-4: The rendered transcript shows one assistant-column leading edge in dark, light, and a
  760px narrow viewport, with no horizontal overflow.
- [x] AC-5: No structure or behavior regression: the title keeps `min-w-0 flex-1 truncate`, the
  trailing kind/status/chevron stay trailing, group disclosure still opens the compact history, and
  desktop lint, type, and test checks pass.
