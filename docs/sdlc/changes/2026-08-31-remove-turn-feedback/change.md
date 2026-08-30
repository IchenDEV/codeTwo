---
id: change-2026-08-31-remove-turn-feedback
kind: change
schema: 2
status: verified
risk: low
owner: codex
approvers: [user via the 2026-08-31 direct removal request]
approved_at: 2026-08-31
created: 2026-08-31
updated: 2026-08-31
source: direct user request with a screenshot of the assistant-response action row
inputs: current assistant-response actions and local-only helpful/unhelpful state
outputs: assistant-response actions without helpful or unhelpful feedback controls
scope: apps/desktop/src/session/TurnCard.tsx, apps/desktop/src/session/TranscriptPane.tsx, apps/desktop/src/i18n/strings.ts, apps/desktop/src/components/ui/icons.tsx, apps/desktop/tests/turnActionsRendered.test.tsx, docs/sdlc/changes/2026-08-31-remove-turn-feedback/change.md
next_trigger: human review and feedback
verification_mode: owner
verified_by: codex
verified_at: 2026-08-31
---

# Remove turn feedback controls

## Intent

The user identified the thumbs-up and thumbs-down controls under assistant responses as useless and
asked for their removal. The affected surface is the desktop transcript. The desired outcome is to
remove both controls and the local feedback mechanism behind them while preserving copy, branch,
and timestamp actions. This request does not change Feishu message reactions, provider protocols,
transcript content, or remote services, and does not authorize a pull request, merge, release, or
deployment.

## Spec

Completed assistant responses no longer render helpful or unhelpful actions. Turn rendering no
longer accepts a feedback identity, reads or writes `codetwo.turnFeedback` local-storage entries,
or retains feedback-specific state and translations. Copying a response and branching from an
accepted response continue to work unchanged. Existing inert local-storage values may remain in a
user profile but no application code reads or mutates them.

### Acceptance criteria

- [x] AC-1: Rendered assistant responses contain no thumbs-up or thumbs-down action while copy,
      branch, and timestamp remain present.
- [x] AC-2: Desktop source contains no turn-feedback state, persistence key, helpful/unhelpful
      translation, or feedback prop wiring.
- [x] AC-3: Focused tests, renderer build, real rendered inspection, and repository lifecycle
      checks pass without relevant warnings or errors.

## Decision and gates

The user directly accepted this low-risk deletion on 2026-08-31. No security, data-migration,
release, or production Gate applies. Human review remains required before merge; no external
delivery action is authorized.

## Plan

1. Delete feedback icons, state, persistence helpers, props, and transcript wiring.
2. Delete feedback translations and replace the feedback interaction test with an assertion for
   the remaining response actions and branch behavior.
3. Run focused tests and renderer checks, then inspect the rendered response action row in the
   Browser at desktop and narrow widths.

Rollback reverts this change to restore the prior local-only controls.

## Build

The assistant-response action row now renders copy followed by the existing branch action and
timestamp. Turn feedback types, local-storage helpers, state, selection handling, component props,
transcript key wiring, translations, and the two now-unused icon exports were deleted. The focused
rendered test asserts the complete remaining response-button label list and exercises branching.
No material deviation from the Plan was required.

## Verification

Verdict: verified.

The first focused-test attempt from the repository root failed before loading a test because that
fresh worktree had no desktop `node_modules` and could not resolve `react/jsx-dev-runtime`.
`bun install --frozen-lockfile` in `apps/desktop` restored the locked dependency set; the unchanged
focused command then passed. Existing React test-environment `act(...)` notices and Vite's existing
large-chunk notice remained non-failing and are unrelated to this deletion.

### Acceptance evidence

- AC-1: PASS — `bun test tests/turnActionsRendered.test.tsx` and Browser inspection of
  `http://127.0.0.1:1420/?rich-transcript` showed only Copy response and Branch into a new task in
  the response action row; clicking Copy changed it to Response copied while the branch glyph and
  timestamp remained.
- AC-2: PASS — focused `rg` over `apps/desktop/src` and `apps/desktop/tests` found no
  `codetwo.turnFeedback`, `feedbackKey`, turn-feedback helpers, helpful/unhelpful translations, or
  thumbs icon exports; the only remaining `THUMBSUP` fixture belongs to the explicitly out-of-scope
  Feishu message-reaction feature.
- AC-3: PASS — after rebasing onto the latest `origin/main`, `bun test` passed 774 tests across 134
  files with 3,682 expectations and zero
  failures; `bunx tsc --noEmit` and `bun run build:renderer` passed; Browser checks passed in dark,
  light, and 560x760 narrow states with no framework overlay, relevant console warning/error, or
  response-row overflow; `bun script/verify/docs.ts`, `bun script/verify/sdlc.ts`,
  `bun script/verify/sdlc.ts --worktree`, and `bun test script/verify/checks.test.ts` passed.

Residual risk: existing `codetwo.turnFeedback:*` values may remain inert in a user's local storage,
but no application path reads or writes them. Browser validation exercised the shared production
TurnCard renderer rather than restarting the user's already-running native desktop Core.

## Review and release

Review handoff: [Draft PR #204](https://github.com/IchenDEV/codeTwo/pull/204).
Approval: pending human review of the verified local change.
Release target: none.
Release identity: not applicable until released.
Smoke evidence: not applicable until released.
Rollback: revert this change to restore the previous transcript action row.
No release: the current request authorizes only local implementation and verification.

Preparing this section does not authorize merge, deployment, release, or production mutation.

## Feedback

No post-change feedback exists yet.
