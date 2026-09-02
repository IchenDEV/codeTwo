---
id: "2026-08-31-sidebar-organization-git-status"
stage: plan
schema: 3
status: accepted
owner: codex
created: 2026-08-31
based_on: spec.md
risk: medium
scope: apps/desktop
approved_by: "userthe 2026-08-31 sidebar organization request and three supplied references"
approved_at: "2026-08-31"
---

# Plan: Make sidebar organization user-owned and show Git delivery state

## Files and ownership

apps/desktop

## Order of work

1. Version the sidebar organization state, migrate existing manual Sections, and add pure reorder
   operations for Sections, Projects, and Tasks.
2. Remove the automatic Highlight classifier and render every manual Section through one editable,
   draggable component with archive-all and accessible move alternatives; restore Projects as
   draggable child containers without changing their repository identity.
3. Add persisted Feishu Section/resource ordering without changing the connector protocol.
4. Add a bounded read-only Task Git status loader that reuses the existing GitHub bridge and maps
   raw PR/check state into one deterministic row status.
5. Protect migration, ordering, membership, failure handling, and rendering with focused tests;
   then build and inspect the real renderer in light, dark, standard, and narrow layouts.

Rollback reverts this change and lets the prior renderer read its version-1 Section key. The new
version uses a separate key so older builds do not reinterpret richer ordering data.

## Test-first proof

See legacy Verification section.

## Visual or integration proof

See legacy Verification section.

## Risks and mitigations

See legacy Decision and gates.

## Rollback

See legacy Review and release.

## Deviations

The sidebar organization model now has a version-2 local state with version-1 migration, explicit
Section and Task ordering, and no reserved Section names. A parallel Project organization model
persists Project-to-Section membership, peer order, and folds while leaving repository paths and
Task ownership unchanged. The rail renders Section, Project, and Task hierarchy with direct drag
handles plus menu move alternatives; Section menus expose Edit, Archive all Tasks, and Delete.

Feishu has an independent persisted ordering model for its semantic Sections and for conversation,
document, and base resources. The visible rows expose drag handles and Alt+Up/Down alternatives;
pin and activity metadata continue to come from Feishu rather than the local order model.

Each active Task now displays `Worktree` or `Checkout`. A bounded, deduplicated, read-only lookup
through the existing GitHub bridge maps current pull-request and check data to merged, conflicts,
CI failed, CI running, open, or closed. The result is refreshed on a timer and lookup failure
leaves only the local checkout indicator.

No material deviation from the accepted Plan was required.

## Decision

The user directly accepted the Intent and the visible macOS source-list direction on 2026-08-31.
The implementation keeps organization renderer-local and GitHub inspection read-only. No security,
data-migration, release, or production Gate is opened by this Artifact. Human review is required
before any merge, and the current request does not authorize creating or updating a pull request.
