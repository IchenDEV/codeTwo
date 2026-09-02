---
id: "2026-08-31-sidebar-organization-git-status"
stage: intent
schema: 3
status: accepted
owner: codex
created: 2026-08-31
source: direct user request with Codex sidebar section, task, and Git-state screenshots
risk: medium
approved_by: "userthe 2026-08-31 sidebar organization request and three supplied references"
approved_at: "2026-08-31"
---

# Intent: Make sidebar organization user-owned and show Git delivery state

## Problem

The user reported that the current sidebar implementation incorrectly treats `Highlight` as a
fixed system Section. In the supplied product reference it is only one user-created test grouping,
so CodeTwo must not infer special behavior from that name. The user also needs richer Section
editing, direct drag ordering for Tasks, Feishu conversations and documents, Projects where they
are represented, and Section groups, plus a quiet way to distinguish an isolated worktree from an
ordinary checkout and see whether the current branch's GitHub pull request is merged, open,
conflicting, or failing CI.

The affected surface is the desktop sidebar and its local organization state. The request does not
change Task execution, Project ownership, Feishu source data, Git history, GitHub pull requests,
or release state. GitHub lookup remains read-only and best effort; missing `gh`, authentication,
network, or pull-request data must not block the Task list. The direct request accepts Intent and
the visible interaction direction, but does not authorize a PR, merge, push, release, deployment,
or production mutation.

## Proposed outcome

The user reported that the current sidebar implementation incorrectly treats `Highlight` as a

## Affected users and systems

Migrated from legacy change.md.

## Constraints

The user directly accepted the Intent and the visible macOS source-list direction on 2026-08-31.
The implementation keeps organization renderer-local and GitHub inspection read-only. No security,
data-migration, release, or production Gate is opened by this Artifact. Human review is required
before any merge, and the current request does not authorize creating or updating a pull request.

## Out of scope

Not recorded in the legacy single-file Artifact.

## Success signals

See Spec acceptance criteria.

## Open questions

None recorded in migration.

## Decision

The user directly accepted the Intent and the visible macOS source-list direction on 2026-08-31.
The implementation keeps organization renderer-local and GitHub inspection read-only. No security,
data-migration, release, or production Gate is opened by this Artifact. Human review is required
before any merge, and the current request does not authorize creating or updating a pull request.
