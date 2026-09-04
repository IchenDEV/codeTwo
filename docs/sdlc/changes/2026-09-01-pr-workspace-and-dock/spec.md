---
id: "2026-09-01-pr-workspace-and-dock"
stage: spec
schema: 3
status: accepted
owner: codex
created: 2026-09-01
based_on: intent.md
risk: medium
approved_by: "userthe 2026-09-01 PR workspace implementation approval"
approved_at: "2026-09-01"
---

# Spec: Improve the PR workspace and add a conversation-side PR surface

## Requirements

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

## User experience

Not separately recorded in legacy change.md.

## Technical design

See Requirements and legacy Git history.

## Security and privacy

See migrated Decision and gates.

## Alternatives and non-goals

Not separately recorded in legacy change.md.

## Areas of concern

The user approved the rendered direction and explicitly requested implementation on 2026-09-01,
which accepts Intent, Spec, and the visual design Gate for execution. Codex owns implementation and
owner verification. No security, data migration, provider protocol, merge, release, deployment, or
production Gate is opened. The user's separate `pr` request on 2026-09-01 authorizes creating a
branch, pushing this verified scope, and opening a Draft PR; it does not authorize merging,
releasing, or deploying CodeTwo.

## Acceptance criteria

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

## Decision

The user approved the rendered direction and explicitly requested implementation on 2026-09-01,
which accepts Intent, Spec, and the visual design Gate for execution. Codex owns implementation and
owner verification. No security, data migration, provider protocol, merge, release, deployment, or
production Gate is opened. The user's separate `pr` request on 2026-09-01 authorizes creating a
branch, pushing this verified scope, and opening a Draft PR; it does not authorize merging,
releasing, or deploying CodeTwo.
