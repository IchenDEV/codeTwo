---
id: "2026-08-31-separate-quick-and-side-chat"
stage: plan
schema: 3
status: accepted
owner: Codex
created: 2026-08-31
based_on: spec.md
risk: medium
scope: apps/desktop
approved_by: "[chenli]"
approved_at: "2026-08-31"
---

# Plan: Separate Quick Chat from Side Chat

## Files and ownership

apps/desktop

## Order of work

1. Convert the three reported symptoms into focused rendered-component regression tests.
2. Give Quick Chat and Side Chat separate names, state, entry points, and placement wrappers while
   reusing the transient conversation engine.
3. Remove the duplicate sidebar temporary-session control and route Side Chat through Dock.
4. Add pointer-captured, viewport-clamped movement to the Quick Chat header.
5. Run focused tests, renderer build/design checks, lifecycle validation, and real-window QA.

Affected scope: `apps/desktop/src/App.tsx`, the transient chat component, `SessionRail`, `Dock`,
localization strings, renderer styles, and their focused tests. Main risk is losing transient tabs
when switching surfaces or allowing pointer gestures on header controls; tests and rendered QA cover
those paths. Rollback is a normal source revert of these renderer-only edits.

## Test-first proof

See legacy Verification section.

## Visual or integration proof

See legacy Verification section.

## Risks and mitigations

See legacy Decision and gates.

## Rollback

See legacy Review and release.

## Deviations

- The New task row now retains its normal tracked-task action plus exactly one Quick Chat toggle;
  the redundant temporary-session plus action was removed.
- Quick Chat and Side Chat use separate component instances and state while sharing the transient
  conversation engine. Quick Chat is the app-lifetime nonmodal floating surface; Side Chat is an
  ordinary right-Dock surface with no nested tab strip.
- “Ask in side chat” now selects the Dock Side Chat and seeds its single current conversation. A
  later excerpt replaces that conversation instead of creating inaccessible hidden tabs.
- The Quick Chat header captures the primary pointer, ignores interactive controls, updates its
  position without per-move React renders, releases cancellation, and clamps the panel to an 8px
  viewport inset.
- English and Chinese names, descriptions, placeholders, actions, and accessibility labels now
  distinguish the two surfaces.
- Both transient surfaces now keep their model selector visible before the first prompt. They show
  the known current model while provider metadata is loading, fall back to an explicit Default
  model affordance when neither is known, and replace that fallback with the provider's complete
  model list when it arrives. A pre-session choice remains attached to the transient tab and is
  passed to Core when that tab creates its provider session.
- Both transient composers now share the main Composer's operable permission picker and voice
  button. Their add button opens a multi-image chooser, imports selected images into private
  attachment storage, previews/removes them, and includes their attachment blocks in the prompt.
  Send failures restore the unsent images instead of silently dropping them.
- Permission posture changes update the pending tab before its first session is created and use the
  execution-policy bridge for an existing transient session. Model, permission, attachment, voice,
  send, loading, and stop states all disable or recover together rather than acting as decorative
  controls.
- Quick Chat now uses raised rather than modal elevation. Both transient composer cards use a
  theme-aware `0 1px 2px` control shadow instead of the dark theme's previous 16px surface halo.

## Decision

User `chenli` directly approved Intent and implementation through the current request on
2026-08-30/31, including the supplied Quick Chat, Side Chat, and duplicate-button evidence.
Codex owns implementation and verification. No separate security, data, migration, deployment, or
release Gate is needed because this is a local renderer behavior change. The user subsequently
authorized PR creation and merge on 2026-08-31. Publication and release remain unapproved.
