---
id: "2026-08-31-remove-turn-feedback"
stage: plan
schema: 3
status: accepted
owner: codex
created: 2026-08-31
based_on: spec.md
risk: low
scope: apps/desktop/src/session/TurnCard.tsx, apps/desktop/src/session/TranscriptPane.tsx, apps/desktop/src/i18n/strings.ts, apps/desktop/src/components/ui/icons.tsx, apps/desktop/tests/turnActionsRendered.test.tsx, docs/sdlc/changes/2026-08-31-remove-turn-feedback/change.md
approved_by: "[user via the 2026-08-31 direct removal request]"
approved_at: "2026-08-31"
---

# Plan: Remove turn feedback controls

## Files and ownership

apps/desktop/src/session/TurnCard.tsx, apps/desktop/src/session/TranscriptPane.tsx, apps/desktop/src/i18n/strings.ts, apps/desktop/src/components/ui/icons.tsx, apps/desktop/tests/turnActionsRendered.test.tsx, docs/sdlc/changes/2026-08-31-remove-turn-feedback/change.md

## Order of work

1. Delete feedback icons, state, persistence helpers, props, and transcript wiring.
2. Delete feedback translations and replace the feedback interaction test with an assertion for
   the remaining response actions and branch behavior.
3. Run focused tests and renderer checks, then inspect the rendered response action row in the
   Browser at desktop and narrow widths.

Rollback reverts this change to restore the prior local-only controls.

## Test-first proof

See legacy Verification section.

## Visual or integration proof

See legacy Verification section.

## Risks and mitigations

See legacy Decision and gates.

## Rollback

See legacy Review and release.

## Deviations

The assistant-response action row now renders copy followed by the existing branch action and
timestamp. Turn feedback types, local-storage helpers, state, selection handling, component props,
transcript key wiring, translations, and the two now-unused icon exports were deleted. The focused
rendered test asserts the complete remaining response-button label list and exercises branching.
No material deviation from the Plan was required.

## Decision

The user directly accepted this low-risk deletion on 2026-08-31. No security, data-migration,
release, or production Gate applies. Human review remains required before merge; no external
delivery action is authorized.
