---
id: change-2026-08-31-restore-sidebar-session-summary
kind: change
schema: 2
status: verified
risk: low
owner: codex
approvers: [user]
approved_at: 2026-08-31
created: 2026-08-31
updated: 2026-08-31
source: direct user request with screenshot showing missing session summary metadata in the sidebar
inputs: persisted transcript previews, session provider and activity timestamps, SessionRail row layout
outputs: sidebar session summary line with latest AI reply, provider mark, and compact relative age
scope: crates/core/src/store.rs, apps/desktop/src/sidebar/SessionRail.tsx, apps/desktop/tests/sessionRailRendered.test.tsx, docs/sdlc/changes/2026-08-31-restore-sidebar-session-summary
next_trigger: PR review; merge and release remain pending
verification_mode: owner
verified_by: codex
verified_at: 2026-08-31
---

# Restore the sidebar session summary

## Intent

The user reported that Task rows no longer show their second line. That line must make a session
scannable by combining the newest AI reply, the Provider mark, and how long ago the Task was last
active. The current renderer instead treats any newest text, including the user's prompt, as a
preview and separately reserves the lower line for workspace provenance.

## Spec

The first line remains the Task title and its existing activity/actions. Immediately below it,
render one compact summary line with the monochrome Provider mark, a truncated newest Agent text,
and a compact relative age derived from `last_active_at` with `created_at` fallback. Sessions with
no Agent text retain the line with Provider and age, without inventing reply content. Workspace,
checkout, worktree, and pull-request provenance remain on the following line.

The Core preview query must select only the newest Agent text. It must not replace an existing AI
reply with a later user prompt. Preserve the existing one-query projection and 160-character bound.

### Acceptance criteria

- [x] AC-1: A Task with an AI reply renders it on the second line with the correct Provider mark
      and compact relative age.
- [x] AC-2: A later user prompt cannot replace the latest AI reply returned by the preview query;
      a Task without an AI reply does not invent one.
- [x] AC-3: Existing title, activity, actions, drag-and-drop, workspace, checkout/worktree, and PR
      behavior remains intact.
- [x] AC-4: Focused and full tests, renderer build, rendered Browser inspection, and repository
      lifecycle checks pass.

## Decision and gates

The direct user request approves this low-risk sidebar correction. The follow-up `pr` authorizes PR
creation only. Human review remains required before merge; release, deployment, and external
mutation remain unauthorized.

## Plan

1. Lock the AI-only preview and summary-line structure with red regression tests.
2. Restore the Provider mark and age using existing row data and the shared ProviderIcon.
3. Verify actual dark rendered rows at the sidebar's normal width, then run repository Gates.

Rollback restores the previous preview query and SessionRail row projection.

## Build

The Core preview projection now selects only the newest Agent text, preserving the existing
one-query and bounded-preview behavior. SessionRail renders a fixed summary line with the shared
ProviderIcon, a one-line Agent preview when present, and compact relative activity age driven by
one rail-wide minute ticker. Workspace and Git provenance remain on the following line.

## Verification

Verdict: verified.

### Acceptance evidence

- AC-1: PASS — `bun test tests/sessionRailRendered.test.tsx` passed 25 tests and 249
  expectations. Browser inspection of the real SessionRail at 320 px showed Provider marks,
  single-line truncated AI replies, and `5m` / `2h` ages on the second line.
- AC-2: PASS — `cargo test -p codetwo-core
  last_texts_returns_the_newest_agent_text_per_session` and all 50 Core store tests passed,
  including a later user prompt that must not displace the latest Agent reply.
- AC-3: PASS — `bun test tests/sessionRailRendered.test.tsx` retained title, activity, action,
  drag, workspace, checkout/worktree, and pull-request assertions; the full `bun test` suite
  passed 798 tests and 3,773 expectations.
- AC-4: PASS — full `cargo test -p codetwo-core`, `bun run build:renderer`, TypeScript, focused
  ESLint, Browser DOM/geometry inspection, all five verification-script tests, documentation
  verification, and both committed and worktree SDLC checks passed.

Residual risk: the rendered inspection used an isolated fixture-backed renderer so it would not
start or interfere with the user's live Core. Existing persisted sessions require the updated Core
and renderer to be launched together before the repaired projection appears. The repository-wide
`cargo fmt --all --check` remains blocked by pre-existing formatting drift in unrelated Rust files;
this low-risk UI change did not rewrite those files.

## Review and release

Approval: [PR #208](https://github.com/IchenDEV/codeTwo/pull/208) created by user authorization;
merge pending human review.
Release target: none.
Release identity: not applicable until released.
Smoke evidence: not applicable until released.
Rollback: revert this change bundle.
No release: PR creation is authorized; merge, deployment, and release remain unauthorized.

## Feedback

The screenshot is the accepted symptom and scope indicator; no post-change feedback exists yet.
