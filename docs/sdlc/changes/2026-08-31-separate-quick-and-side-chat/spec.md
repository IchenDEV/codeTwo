---
id: "2026-08-31-separate-quick-and-side-chat"
stage: spec
schema: 3
status: accepted
owner: Codex
created: 2026-08-31
based_on: intent.md
risk: medium
approved_by: "[chenli]"
approved_at: "2026-08-31"
---

# Spec: Separate Quick Chat from Side Chat

## Requirements

- The sidebar New task row keeps its primary tracked-Task action and exactly one secondary action,
  labelled Quick Chat. The redundant temporary-session plus control is removed from that row.
- Quick Chat is an app-lifetime, nonmodal floating panel. Its copy, accessibility names, state,
  and DOM markers do not call it Side Chat.
- Dragging the Quick Chat header with the primary pointer moves the panel. Interactive header
  controls remain clickable, pointer cancellation releases the drag, and the panel stays inside
  the current viewport.
- Side Chat is a distinct right-Dock surface with its own transient conversation state. Opening it
  does not open or move the Quick Chat panel.
- Quick Chat and Side Chat both expose an operable model selector before the first prompt as well
  as after their transient provider session has been created.
- Both transient composers expose the useful conversation actions shown by the accepted references:
  add content, change permission mode, choose model/reasoning, start voice input, and send or stop.
  Controls must invoke real shared behavior rather than acting as decorative placeholders.
- The floating panel uses restrained raised-surface elevation and the inner composer uses only a
  short 1px/2px control shadow; neither should visually float far above the content behind it.
- A focused transient composer has exactly one blue focus outline, owned by the outer composer
  card. Its nested textarea must not draw a second focus outline.
- “Ask in side chat” routes the selected excerpt into the Dock Side Chat surface.
- Both transient surfaces retain the existing no-durable-history and no-memory-write behavior.
- Closing either surface is local to that surface. Existing no-profile desktop launch behavior is
  unchanged.
- Rollback is a renderer-only revert of this change; no data migration is involved.

## User experience

Not separately recorded in legacy change.md.

## Technical design

See Requirements and legacy Git history.

## Security and privacy

See migrated Decision and gates.

## Alternatives and non-goals

Not separately recorded in legacy change.md.

## Areas of concern

User `chenli` directly approved Intent and implementation through the current request on
2026-08-30/31, including the supplied Quick Chat, Side Chat, and duplicate-button evidence.
Codex owns implementation and verification. No separate security, data, migration, deployment, or
release Gate is needed because this is a local renderer behavior change. The user subsequently
authorized PR creation and merge on 2026-08-31. Publication and release remain unapproved.

## Acceptance criteria

- [x] AC-1: `apps/desktop/tests/sessionRailRendered.test.tsx` proves the New task row has one Quick Chat
  secondary control and no temporary-session plus or Side Chat control.
- [x] AC-2: Dock rendered tests prove Side Chat is an ordinary right-panel surface, independently
  selected through Dock navigation.
- [x] AC-3: Transient chat rendered tests prove Quick Chat and Side Chat expose distinct accessible
  identities and independent placement semantics.
- [x] AC-4: A pointer-drag regression test proves Quick Chat changes position, releases capture on cancel,
  ignores interactive controls, and clamps the panel to the viewport.
- [x] AC-5: Focused tests, desktop renderer build/design checks, and `bun script/check-sdlc.ts` pass.
- [x] AC-6: A real rendered desktop window proves the sidebar, floating Quick Chat, dragged position, and
  Dock Side Chat match the supplied behavioral references without clipping or relevant console
  errors.
- [x] AC-7: Rendered tests and live UI interaction prove both surfaces show the current model and can
  choose another available model before sending the first prompt.
- [x] AC-8: Rendered interaction tests and live UI inspection prove add-content, permission-mode, voice,
  model, and send/stop controls are present without clipping in both transient composers.
- [x] AC-9: Rendered and design-system checks prove the Quick Chat shell no longer uses modal elevation
  and the inner composer uses the short control shadow rather than surface or raised elevation.
- [x] AC-10: A focused rendered regression and live Browser inspection prove Quick Chat and Side Chat
  show one outer composer focus outline with no nested textarea outline.

## Decision

User `chenli` directly approved Intent and implementation through the current request on
2026-08-30/31, including the supplied Quick Chat, Side Chat, and duplicate-button evidence.
Codex owns implementation and verification. No separate security, data, migration, deployment, or
release Gate is needed because this is a local renderer behavior change. The user subsequently
authorized PR creation and merge on 2026-08-31. Publication and release remain unapproved.
