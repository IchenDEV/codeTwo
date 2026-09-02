---
id: "2026-09-01-pr-workspace-and-dock"
stage: verification
schema: 3
status: passed
owner: codex
created: 2026-09-01
based_on: plan.md
commit: ""
verification_mode: owner
verified_by: "codex"
verified_at: "2026-09-01"
release_target: none
release_identity: "not applicable until released."
---

# Verification: Improve the PR workspace and add a conversation-side PR surface

## Automated checks

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

## Behavioral evidence

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

## Visual evidence

See bundle evidence/ when present.

## Security and privacy evidence

Not separately recorded unless present in legacy Verification.

## Deviations and residual risk

Residual risk: live authenticated GitHub review, comment, and merge mutations were not performed

## Verdict

Verdict: verified..

## Review and release

Review handoff: [Draft PR #212](https://github.com/IchenDEV/codeTwo/pull/212).
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
