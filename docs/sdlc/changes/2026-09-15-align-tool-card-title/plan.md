---
id: 2026-09-15-align-tool-card-title
schema: 5
stage: plan
status: accepted
owner: chenli
created: 2026-09-15
based_on: spec.md
scope: apps/desktop/src/session/TurnCard.tsx, apps/desktop/src/session/ChartBlock.tsx, apps/desktop/tests/turnCardRendered.test.tsx, docs/sdlc/changes/2026-09-15-align-tool-card-title
---

# Plan: Align the transcript tool card title

## Plan

1. `apps/desktop/src/session/TurnCard.tsx`
   - `text-start` on the two tool-card `CollapsibleTrigger` class names (`ToolCallBlock`, compact +
     non-compact; `ToolCallGroup`) so the title span stops centering inside the native `<button>`.
   - `has-[>svg]:ps-0` on the same two triggers, dropping the compact size's start inset.
   - `px-1` → `pe-1` on the no-output tool row so its leading icon also starts at the text edge.
2. `apps/desktop/src/session/ChartBlock.tsx` — `-ms-surface-inset` on the legend container so the
   12px `px-surface-inset` of the compact legend buttons no longer pushes the series dots off the
   column.
3. `apps/desktop/tests/turnCardRendered.test.tsx` — extend the tool-card test with the leading-inset
   contract, add a standalone-row contract case, and add a two-series chart case asserting the legend
   container compensation.

Checks by risk and affected behavior:

- Desktop renderer: `bun run lint`, `bunx tsc --noEmit`, `bun test` from `apps/desktop`.
- Rendered UI (AC-4): the DOM harness has no layout engine, so the shared leading edge is measured in
  the real renderer with the dev-only preview route (`RichTranscriptPreview`) in dark, light, and a
  760px viewport, reported as geometry plus screenshots.
- Repository: `bun script/verify/sdlc.ts --worktree` and `bun script/verify/docs.ts` before handoff.

Temporary resources: one ignored Vite dev-server process for the preview capture, driven on a
task-owned profile and port and stopped before handoff; no Core instance is started, so the user's
running desktop data directory stays untouched.

Rollback: revert the class additions and the test cases; the change adds no data, protocol, or
persistence surface.
