---
id: change-2026-08-29-empty-session-titlebar-divider
kind: change
status: verified
owner: codex
approvers: "#decision-and-gates"
created: 2026-08-29
updated: 2026-08-29
source: "#intent"
inputs: "#spec"
outputs: "#build"
next_trigger: human review accepts the rendered interaction and release risk
---

# Hide the empty-session titlebar divider

## Intent

The user reported that the separator below the session titlebar should not appear on the empty home
screen. It should return only when the pane has conversation content that reads or scrolls beneath
the titlebar. This change is limited to the session workspace titlebar; rail and dock titlebars keep
their existing boundaries.

## Spec

Use the same state that mounts the transcript surface to control the session titlebar divider. An
empty pane with no turns, active run, or transcript load has no divider. A pane with persisted turns,
an active run, or a loading transcript restores the existing semantic hairline. The rule is
state-based and does not depend on viewport width or appearance.

### Acceptance criteria

- [x] An empty new-task pane has no visible or computed titlebar divider.
- [x] Persisted, running, and loading conversation states use the existing semantic hairline.
- [x] Rail and dock titlebar separators are unchanged.
- [x] Dark, light, constrained-width, focused test, design, SDLC, diff, and console checks pass.

## Decision and gates

Intent and design acceptance come directly from the user's 2026-08-29 rendered-page feedback. No
permission to create a PR, merge, publish, or release is implied.

## Plan

Name the existing transcript-presence condition once per pane, expose it on the session header,
override only that header's box shadow, add a narrow contract assertion and design-law sentence,
then verify both divider states in the running renderer. Rollback is the inverse source change.

## Build

Each pane now names the existing transcript-presence condition once and exposes it through
`data-has-conversation` on the session header. The session header removes the global titlebar
shadow by default and restores the exact existing semantic hairline only for that content state.
The transcript and full-page transcript toggle consume the same condition. Other window titlebars
still use the global titlebar rule.

## Verification

- The two focused window-chrome contract tests passed with 12 unrelated cases filtered out. They
  cover the shared titlebar baseline, unchanged global separator, session state binding, empty
  override, and conversation-state hairline.
- `bun run check:design` from `apps/desktop`: passed with 0 new violations, 659 tracked legacy
  occurrences, and all contrast checks passing.
- In the live renderer at `http://localhost:1420/`, the empty pane had zero transcript turns, no
  `data-has-conversation` attribute, and computed `box-shadow: none`; the saved screenshot showed
  no line between the titlebar and workspace. The same result held in light appearance and at a
  620px constrained session-header width.
- The loaded stylesheet contained the conversation-state selector with the original semantic
  hairline. In the same renderer, rail and dock titlebars retained their computed half-pixel inset
  shadows while the session header had none.
- The side panel and appearance settings were restored, and browser warning/error output was empty.
- `bun script/check-sdlc.ts` and the task-scoped `git diff --check`: passed.

Verdict: verified.

Residual risk: live evidence covered the empty state; the non-empty conversation state is retained
by focused contract coverage and the unchanged semantic selector.

## Review and release

No PR, merge, or release requested. Human product review remains the next lifecycle trigger.

## Feedback

No additional defect observed during the dark, light, constrained, and restored empty states.
