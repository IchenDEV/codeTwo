---
id: "2026-08-31-restore-sidebar-session-summary"
stage: spec
schema: 3
status: accepted
owner: codex
created: 2026-08-31
based_on: intent.md
risk: low
approved_by: "[user]"
approved_at: "2026-08-31"
---

# Spec: Restore the sidebar session summary

## Requirements

The first line remains the Task title and its existing activity/actions. Immediately below it,
render one compact summary line with the monochrome Provider mark, a truncated newest Agent text,
and a compact relative age derived from `last_active_at` with `created_at` fallback. Sessions with
no Agent text retain the line with Provider and age, without inventing reply content. Workspace,
checkout, worktree, and pull-request provenance remain on the following line.

The Core preview query must select the complete newest Agent reply, coalescing all of its streamed
text chunks. It must not replace an existing AI reply with a later user prompt. Preserve the
existing one-query projection and 160-character bound.

## User experience

Not separately recorded in legacy change.md.

## Technical design

See Requirements and legacy Git history.

## Security and privacy

See migrated Decision and gates.

## Alternatives and non-goals

Not separately recorded in legacy change.md.

## Areas of concern

The direct user request approves this low-risk sidebar correction. The follow-up `pr` authorizes PR
creation only. Human review remains required before merge; release, deployment, and external
mutation remain unauthorized.

## Acceptance criteria

- [x] AC-1: A Task with an AI reply renders it on the second line with the correct Provider mark
      and compact relative age.
- [x] AC-2: A later user prompt cannot replace the latest AI reply returned by the preview query;
      a Task without an AI reply does not invent one.
- [x] AC-3: Existing title, activity, actions, drag-and-drop, workspace, checkout/worktree, and PR
      behavior remains intact.
- [x] AC-4: Focused and full tests, renderer build, rendered Browser inspection, and repository
      lifecycle checks pass.

## Decision

The direct user request approves this low-risk sidebar correction. The follow-up `pr` authorizes PR
creation only. Human review remains required before merge; release, deployment, and external
mutation remain unauthorized.
