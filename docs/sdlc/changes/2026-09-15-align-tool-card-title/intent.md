---
id: 2026-09-15-align-tool-card-title
schema: 5
stage: intent
status: accepted
owner: chenli
created: 2026-09-15
source: user
risk: low
approved_by: chenli
approved_at: 2026-09-15
approval_source: "Direct requests: 修复对齐排版问题 (screenshot of the centered tool cards) and the follow-up annotated screenshot with 这个对齐上需要加点补偿."
next_trigger: chenli reviews the verified work.
---

# Intent: Align the transcript tool card title

## Intent

Two related alignment defects in the transcript's assistant column:

1. The user's first screenshot shows the transcript tool cards (`Search tools: "…"` rows) with their
   titles floating in the middle of the row instead of starting at the leading edge next to the tool
   icon. The cause is that the disclosure rows use the shared `Button`, whose native `<button>`
   text alignment (`text-align: center`) is never reset, so the `min-w-0 flex-1 truncate` title span
   centers its text across the row. Plain-div tool rows (no outputs) are unaffected, which is why
   only the compact history rows and the group trigger looked wrong.
2. The user's second, annotated screenshot draws the assistant column's leading edge and asks for
   compensation: the tool row's leading icon still sits 8px inside that edge (4px for the no-output
   row, 12px for the chart legend dots), because each row or control contributes its own leading
   inset instead of sharing the markdown text edge.

Outcome: the transcript's assistant column is one leading edge. Tool-card titles read from the icon
start (no UA centering), every tool-row icon and the chart legend dots sit on the markdown text edge,
and the trailing metadata, chart plot, and behaviors are unchanged.

Constraints: keep the shared `Button` contract (ordinary action buttons keep centered labels); no new
component, wrapper, or design token; feature-owned layout classes only. Non-goals: reworking the tool
card hierarchy, the compact history indentation, the chart's internal plot margins, or unrelated row
buttons outside the transcript.

## Non-goals

No change to `Button`'s base or `size` variants: ordinary action buttons keep the current centered
label behavior, and this fix follows the existing row conventions (`text-start` on `size="row"`,
`-ms-1` on `Detail`, `-ms-surface-inset` for a leading control's own inset).
