---
id: change-2026-08-31-separate-quick-and-side-chat
kind: change
schema: 2
status: verified
risk: medium
owner: Codex
approvers: [chenli]
approved_at: 2026-08-31
created: 2026-08-31
updated: 2026-08-31
source: User request and four attached reference screenshots in the current Codex task
inputs: Current desktop sidebar, floating transient-chat panel, right Dock, and Codex Quick Chat and Side Chat reference screenshots
outputs: Distinct Quick Chat and Side Chat surfaces, one sidebar Quick Chat action, draggable Quick Chat panel, complete transient composer controls, restrained elevation, regression tests, and rendered desktop evidence
scope: apps/desktop
next_trigger: Authorized pull request checks and repository merge; no product release is authorized
verification_mode: owner
verified_by: Codex
verified_at: 2026-08-31
---

# Separate Quick Chat from Side Chat

## Intent

The desktop currently presents a centered floating panel as Side Chat even though the supplied
reference identifies that interaction as Quick Chat. The same state is also opened from the
right-side Dock's Side Chat card, so Quick Chat and Side Chat are not distinct product surfaces.
The New task row additionally exposes both a temporary-session plus button and a chat-plus button,
which reads as two adjacent ways to add a conversation. The centered panel cannot be moved.

The desired outcome is one clear Quick Chat entry beside New task, a genuine Side Chat surface in
the right Dock, and a Quick Chat panel that can be repositioned without being dragged out of view.
This affects the desktop renderer only. Provider protocol, durable Task behavior, and persisted
Task history are out of scope.

## Spec

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

### Acceptance criteria

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

## Decision and gates

User `chenli` directly approved Intent and implementation through the current request on
2026-08-30/31, including the supplied Quick Chat, Side Chat, and duplicate-button evidence.
Codex owns implementation and verification. No separate security, data, migration, deployment, or
release Gate is needed because this is a local renderer behavior change. The user subsequently
authorized PR creation and merge on 2026-08-31. Publication and release remain unapproved.

## Plan

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

## Build

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

## Verification

Verdict: verified.

All acceptance criteria are checked; merge, publication, and release remain a separate human
disposition.

- Final post-rebase repository verification passed ESLint, Stylelint, all 743 desktop tests with
  3,482 expectations, TypeScript, and the production Vite build with 6,405 transformed modules.
  `git diff --check` and the SDLC contract also passed.

- The focus-ring follow-up began with a deterministic rendered failure: the nested textarea owned
  both its shared default focus ring and a local inset ring while the outer composer also owned a
  `focus-within` ring. After making the nested ring explicitly optional, the focused test passed
  for both Quick Chat and Side Chat with six expectations.
- The related final regression set passed 58 tests and 348 expectations across transient chat,
  shared model and reasoning selection, SessionRail, and both Dock suites. Existing asynchronous
  React `act(...)` warnings remain non-failing.
- `bun run build:renderer` passed ESLint, Stylelint, TypeScript, and the production Vite build with
  6,401 transformed modules. Vite retained its existing large-chunk advisory.
- Live Browser inspection at 1280x720 focused both transient textareas. In each surface, the outer
  composer computed to one 2px inset blue outline while the textarea computed to `outline-style:
  none`, `outline-offset: 0px`, and no visible box shadow; the rendered Quick Chat and Side Chat
  states each showed one blue boundary.
- The composer follow-up began with three deterministic rendered failures: neither surface exposed
  add-content or voice controls, the permission posture was a non-interactive span, and Quick Chat
  still used modal elevation while its inner composer used raised elevation. The corrected focused
  loop passed all three tests with 15 expectations.
- The final regression set passed 52 tests and 345 expectations across transient chat, shared model
  and reasoning selection, SessionRail, and both Dock suites. Existing asynchronous React
  `act(...)` warnings remain non-failing.
- `bun run build:renderer` passed ESLint, Stylelint, TypeScript, and the production Vite build with
  6,401 transformed modules. Vite retained its existing large-chunk advisory.
- In the live 1280x720 Browser renderer, Quick Chat showed add-content, Ask first, Default model,
  voice, and send controls together. The add button opened a real multiple-file chooser, and the
  permission menu changed the pending posture from Ask first to Full access.
- The same renderer showed Side Chat in a 385px right Dock. Its 353px control row had equal client
  and scroll widths, no clipped buttons, and the same five control groups. The final computed
  composer shadow was exactly one theme-aware `0 1px 2px` layer; no 16px surface halo remained.
- A final live Browser focus pass selected each transient textarea in turn. Quick Chat and Side
  Chat each rendered one 2px blue outer outline; each nested textarea retained `outline: none` and
  a zero box shadow. The Browser log contained no warning or error entries.
- Final rendered evidence is saved at `/tmp/codetwo-quick-chat-composer-final.png` and
  `/tmp/codetwo-side-chat-composer-final.png`. The final Browser log contained no warnings or
  errors.

- The initial focused regression loop reproduced the reported behavior with four failures: the
  duplicate sidebar conversation action, Side Chat opening the floating surface, shared placement
  semantics, and no Quick Chat drag contract. The corrected final loop passed 37 tests and 285
  expectations across the SessionRail, Dock, and transient-chat suites. Existing asynchronous
  React `act(...)` warnings remain non-failing.
- `bun run build:renderer` passed the design-system source gate with 0 new violations, TypeScript,
  the production Vite build with 6,401 transformed modules, and the generated-dist design check
  with 35 semantic selectors. Vite retained its existing large-chunk advisory.
- `bun script/check-sdlc.ts` reported a valid contract and `git diff --check` passed.
- The Browser-backed live renderer at `http://127.0.0.1:1420/` identified itself as `C2`, showed
  one `Toggle Quick Chat` control in the New task group, and reported no console warnings or errors.
  At 1280x720, a real pointer drag moved Quick Chat from `(320, 40)` to `(460, 72)` and recorded
  offsets of `(140px, 32px)`; the 640px-tall panel stopped exactly at the 8px bottom inset.
- The same live renderer showed Side Chat selected as an ordinary right-Dock tab alongside the open
  sidebar. Its `Side chat` region contained one heading, description, composer, and send action,
  with no nested tab list or floating-dialog identity.
- Quick Chat was also inspected at 700x700 in the light scheme. It remained within the viewport,
  retained its composer and controls, showed no framework overlay, and emitted no relevant console
  messages. Appearance and the viewport override were restored afterward.
- The model-selection follow-up first reproduced the omission with a deterministic rendered test:
  when provider models were empty, neither Quick Chat nor Side Chat exposed a `Model` button. A
  second live-equivalent case proved the renderer may have neither provider metadata nor a current
  model before the first prompt. Both cases passed after the fix.
- The final focused loop passed 47 tests and 309 expectations across SessionRail, Dock, transient
  chat, and the shared ModelPicker suite. It includes choosing `GPT Next` before the first prompt in
  both Quick Chat and Side Chat and verifying that each visible label updates.
- In the live 1280x720 renderer, both surfaces displayed and expanded `Default model` with no
  clipping or console warnings. This Browser fixture reports Grok as `CLI not found`, so the menu
  correctly explained that no provider model list was available instead of disappearing. The
  provider-list selection path was exercised in the rendered component loop above.
- The follow-up `bun run build:renderer` again passed the design source gate, TypeScript, the Vite
  production build with 6,401 modules, and the generated-dist semantic selector check.

### Acceptance evidence

- AC-1: PASS — `Verification record above` preserves the original passing evidence.
- AC-2: PASS — `Verification record above` preserves the original passing evidence.
- AC-3: PASS — `Verification record above` preserves the original passing evidence.
- AC-4: PASS — `Verification record above` preserves the original passing evidence.
- AC-5: PASS — `Verification record above` preserves the original passing evidence.
- AC-6: PASS — `Verification record above` preserves the original passing evidence.
- AC-7: PASS — `Verification record above` preserves the original passing evidence.
- AC-8: PASS — `Verification record above` preserves the original passing evidence.
- AC-9: PASS — `Verification record above` preserves the original passing evidence.
- AC-10: PASS — `Verification record above` preserves the original passing evidence.

Residual risk: the Browser fixture has no available Grok CLI and cannot execute the native private
attachment import or return a real provider model catalog. Alternative-model selection and pending
tab propagation are covered by rendered component tests; the live file chooser and attachment UI
were verified without selecting a user file. A different worktree already owns the default live
Core/data directory, so starting another instance would violate the repository's single-owner
launch rules. This checkout's interaction, accessibility, responsive, and visual behavior was
verified in the live Vite renderer without disturbing that Core.

## Review and release

Approval: the user approved PR creation and merge on 2026-08-31 after rendered verification.
Review surface: [PR #188](https://github.com/IchenDEV/codeTwo/pull/188).
Release target: none.
Release identity: not applicable until released.
Smoke evidence: not applicable until released.
Rollback: Revert this renderer-only change; it performs no migration and changes no durable data.
No release: PR creation and merge are authorized; no tag, publication, deployment, or product
release was requested.

This section records merge authorization only; it does not authorize deployment, release, or
production mutation.

## Feedback

The user explicitly identified three follow-up gaps after the initial surface split: model choice,
the rest of the conversation controls beyond send, and excessive composer elevation. Each was
folded into this Artifact and verified through focused rendered tests plus live Browser inspection.
The user then identified a doubled blue focus outline around the transient composer; this follow-up
keeps the outer card as the single focus owner and removes the nested textarea ring.
