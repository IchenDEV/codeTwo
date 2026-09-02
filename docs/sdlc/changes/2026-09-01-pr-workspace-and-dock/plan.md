---
id: "2026-09-01-pr-workspace-and-dock"
stage: plan
schema: 3
status: accepted
owner: codex
created: 2026-09-01
based_on: spec.md
risk: medium
scope: apps/desktop/src/github, apps/desktop/src/git, apps/desktop/src/dock/Dock.tsx, apps/desktop/src/App.tsx, apps/desktop/src/i18n/strings.ts, apps/desktop/layout-spec.json, apps/desktop/tests, docs/sdlc/changes/2026-09-01-pr-workspace-and-dock
approved_by: "userthe 2026-09-01 PR workspace implementation approval"
approved_at: "2026-09-01"
---

# Plan: Improve the PR workspace and add a conversation-side PR surface

## Files and ownership

apps/desktop/src/github, apps/desktop/src/git, apps/desktop/src/dock/Dock.tsx, apps/desktop/src/App.tsx, apps/desktop/src/i18n/strings.ts, apps/desktop/layout-spec.json, apps/desktop/tests, docs/sdlc/changes/2026-09-01-pr-workspace-and-dock

## Order of work

1. Record the new Pull requests Inspector geometry in the existing desktop layout specification.
2. Promote the existing current-branch PR panel into a dedicated Dock surface and leave Git as the
   working-tree surface without adding backend commands or data models.
3. Recompose the full Pull requests detail into a primary region plus Inspector, add Checks as an
   explicit view, and preserve compact selection, task linkage, and chat handoff.
4. Update English and Chinese copy and protect the new Dock ownership, state projection, detail
   views, action behavior, semantics, and responsive contract with focused tests.
5. Run the applicable full Gates and inspect real renderer output in dark, light, standard, and
   narrow layouts before changing the Artifact to `verified`.

Rollback reverts this change. GitHub commands and persisted data are unchanged, so rollback does
not require migration or remote cleanup.

## Test-first proof

See legacy Verification section.

## Visual or integration proof

See legacy Verification section.

## Risks and mitigations

See legacy Decision and gates.

## Rollback

See legacy Review and release.

## Deviations

- Added `pull-request` as a first-class Dock surface under the existing `git.surface` component
  policy. It renders the existing current-branch `GitHubPullRequestPanel`; the Git surface now
  owns only the working-tree summary.
- Reworked the full Pull requests detail into a primary content region plus semantic Inspector,
  with Summary, Changes, and Checks views, a primary Review changes action, and the existing chat,
  GitHub-open, task-link, filtering, loading, error, and compact-back behavior preserved.
- Added a deterministic merge-readiness projection and shared check-result projection so text,
  icons, tones, and counts agree across Summary, Checks, and Inspector states.
- Added English and Chinese labels, layout-spec geometry, responsive action-label behavior, and
  focused projection, interaction, Dock-ownership, semantic, and reflow coverage.
- No GitHub command, persistence, review/merge authorization, dependency, or remote data contract
  changed. The temporary development-only visual fixture used for browser screenshots was removed
  before final build and verification.

## Decision

The user approved the rendered direction and explicitly requested implementation on 2026-09-01,
which accepts Intent, Spec, and the visual design Gate for execution. Codex owns implementation and
owner verification. No security, data migration, provider protocol, merge, release, deployment, or
production Gate is opened. The user's separate `pr` request on 2026-09-01 authorizes creating a
branch, pushing this verified scope, and opening a Draft PR; it does not authorize merging,
releasing, or deploying CodeTwo.
