---
id: change-2026-09-01-pr-workspace-and-dock
kind: change
schema: 2
status: verified
risk: medium
owner: codex
approvers: user via the 2026-09-01 PR workspace implementation approval
approved_at: 2026-09-01
created: 2026-09-01
updated: 2026-09-01
source: direct user request with an attached PR-workspace reference, followed by approval of the rendered CodeTwo prototype and an explicit request to implement it
inputs: existing Pull requests page, current-branch GitHub pull-request panel, right work Dock, CodeTwo layout specification, and the approved rendered prototype
outputs: a three-region Pull requests workbench plus a dedicated current-branch PR surface beside the conversation
scope: apps/desktop/src/github, apps/desktop/src/git, apps/desktop/src/dock/Dock.tsx, apps/desktop/src/App.tsx, apps/desktop/src/i18n/strings.ts, apps/desktop/layout-spec.json, apps/desktop/tests, docs/sdlc/changes/2026-09-01-pr-workspace-and-dock
next_trigger: human review of the authorized Draft PR
verification_mode: owner
verified_by: codex
verified_at: 2026-09-01
---

# Improve the PR workspace and add a conversation-side PR surface

## Intent

The user wants CodeTwo's GitHub pull-request experience to carry the information hierarchy of the
supplied reference without copying its application-wide navigation. The full Pull requests page
currently has a list and detail view, but branch, review, checks, status, and task metadata compete
inside one central column. The right work Dock already contains a capable current-branch PR panel,
but it is hidden inside the broader Git surface and therefore is not a direct conversation-side PR
destination.

The desired outcome is a macOS-oriented split workspace: global PR selection on the leading side,
the selected PR's title and content in the primary region, and contextual merge/review/check/task
state in a trailing Inspector. Beside a coding conversation, PR must be a first-class Dock surface
that follows the focused session's checkout and branch. This change must reuse the existing GitHub
bridge, review/merge behavior, design tokens, workbench breakpoints, and Dock ownership. It must not
add another GitHub protocol, change merge authorization, create or mutate pull requests, redesign
the application rail, or introduce a mobile application layout.

## Spec

At standard usable widths, Pull requests displays three regions: the existing filtered PR list, a
primary detail region, and a trailing Inspector. The primary header keeps title, author, state,
source and base branches, changed-file count, and additions/deletions together. Summary, Changes,
and Checks are explicit detail tabs. Review changes opens Changes; Join conversation uses the
existing chat handoff. The Inspector prioritizes merge readiness, review state, reviewers, task
association, checks, comments, and last activity without duplicating a second PR description.

The workbench keeps the existing `704px` list/detail collapse contract. The new Inspector is
`clamp(192px, 23cqw, 256px)` and collapses first when the Pull requests container is at or below
`960px`, preserving a usable primary region. Status meaning always includes text or an icon, not
color alone. Existing loading, empty, error, filtering, task-linking, GitHub-open, and compact-back
behavior remains available.

The right work Dock exposes a dedicated PR tab beside Files and Git. It renders the existing
current-branch `GitHubPullRequestPanel`, including overview, diff, checks, review submission, merge
confirmation, and GitHub opening. Git remains the working-tree summary and no longer embeds a
second copy of the PR panel. PR availability follows the existing `git.surface` component policy;
missing GitHub remotes, `gh`, authentication, repository state, or branch PR data continue to use
the existing safe empty and error states.

### Acceptance criteria

- [x] AC-1: At standard width the full Pull requests page renders the selected PR as list, primary
      detail, and contextual Inspector; at or below the recorded breakpoints it removes the
      Inspector first and preserves the existing list/detail compact navigation.
- [x] AC-2: The primary detail exposes Summary, Changes, and Checks with title/state/branch/diff
      context, while Review changes opens Changes and Join conversation keeps the selected PR.
- [x] AC-3: The conversation-side Dock has a direct PR surface for the focused checkout and branch;
      Git shows only working-tree state, and the existing review, merge, diff, loading, empty, and
      failure behavior remains unchanged.
- [x] AC-4: English and Chinese labels, keyboard-accessible controls, semantic landmarks,
      non-color-only states, and narrow reflow are covered by focused rendered tests.
- [x] AC-5: Focused tests, full desktop tests, renderer type/build/lint checks, lifecycle Gates, and
      real rendered dark, light, and narrow inspection pass with no relevant clipping or console
      errors.

## Decision and gates

The user approved the rendered direction and explicitly requested implementation on 2026-09-01,
which accepts Intent, Spec, and the visual design Gate for execution. Codex owns implementation and
owner verification. No security, data migration, provider protocol, merge, release, deployment, or
production Gate is opened. The user's separate `pr` request on 2026-09-01 authorizes creating a
branch, pushing this verified scope, and opening a Draft PR; it does not authorize merging,
releasing, or deploying CodeTwo.

## Plan

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

## Build

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

## Verification

Verdict: verified.

Real renderer inspection used the in-app browser against the Vite development renderer at
`http://127.0.0.1:1420/`. A temporary local fixture mounted the production components and was
removed before the final build. The standard 1440x900 dark workspace rendered the PR list,
primary Summary, and 256px Inspector without clipping. Review changes selected Changes and showed
the file list; Checks showed three named passed checks. The 1440x900 light Chinese rendering
showed translated navigation, actions, and Inspector labels. At 680x820 the Inspector and list
collapsed, the back action and primary Review changes label remained visible, and the page
reported `clientWidth == scrollWidth == 680`. The conversation preview rendered the real Dock and
current-branch PR panel at 440px; PR was directly selectable, all checks were visible, and Changes
rendered the diff. All inspected states had no relevant browser warnings or errors.

### Acceptance evidence

- AC-1: PASS — `layout-spec.json` records `clamp(192px, 23cqw, 256px)` and the 960px-first /
  704px-second collapse sequence; rendered 1440x900 and 680x820 inspection confirmed the three
  regions and compact detail with no horizontal overflow.
- AC-2: PASS — `cd apps/desktop && bun test tests/githubPullRequests.test.ts
  tests/githubPullRequestsRendered.test.tsx tests/githubPullRequestPanelRendered.test.tsx` exercised
  Summary, Changes, Checks, Review changes, and Join conversation; real browser interaction
  confirmed the changed-file and check rows.
- AC-3: PASS — focused Dock and existing `GitHubPullRequestPanel` tests passed, including overview,
  diff, empty, draft, review, merge-confirmation, and Git-only ownership checks; the rendered Dock
  showed the active PR surface beside a conversation.
- AC-4: PASS — `cd apps/desktop && bun test tests/githubPullRequests.test.ts
  tests/githubPullRequestsRendered.test.tsx tests/githubPullRequestPanelRendered.test.tsx
  tests/dockArchitecture.test.ts tests/dockPluginGateRendered.test.tsx` passed 22 tests and 161
  expectations; English and Chinese rendered labels, semantic Inspector, accessible action names,
  text-plus-icon status, and responsive CSS contracts are covered. Final `bun test` passed 794
  tests across 137 files, 3814 expectations, and zero failures.
- AC-5: PASS — `bun run build:renderer` completed ESLint, Stylelint, TypeScript, and Vite build;
  `bun script/verify/docs.ts`, `bun script/verify/sdlc.ts`,
  `bun script/verify/sdlc.ts --worktree`, and `git diff --check` all passed. Browser screenshots
  were captured to `/tmp/codetwo-pr-workspace-dark.png`,
  `/tmp/codetwo-pr-workspace-light-zh.png`, `/tmp/codetwo-pr-workspace-narrow.png`, and
  `/tmp/codetwo-pr-dock-dark.png`.

Residual risk: live authenticated GitHub review, comment, and merge mutations were not performed
because this request did not authorize remote mutations. Their existing panel workflow and mocked
regression coverage pass unchanged. Merge readiness is an intentional local projection of the
detail fields already returned by GitHub; it does not claim to replace GitHub's authoritative
merge button decision.

## Review and release

Approval: implementation plus Draft PR delivery, from the user's 2026-09-01 requests.
Release target: none.
Release identity: not applicable until released.
Smoke evidence: not applicable until released.
Rollback: revert this change; there is no data or remote migration.
No release: implementation, push, and Draft PR creation are authorized; merge, deployment, and
release are not authorized.

Preparing this section does not authorize merge, deployment, release, or production mutation.

## Feedback

No post-implementation feedback exists yet.
