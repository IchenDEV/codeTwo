---
id: "2026-08-31-fix-dock-tab-indicator-alignment"
stage: verification
schema: 3
status: passed
owner: codex
created: 2026-08-31
based_on: plan.md
commit: ""
verification_mode: owner
verified_by: "codex"
verified_at: "2026-08-31"
release_target: none requested
release_identity: "not applicable until released."
---

# Verification: Align the selected Dock tab background

## Automated checks

Verdict: verified.

- Focused post-rebase command:
  `bun test apps/desktop/tests/tabsToolbarRendered.test.tsx
  apps/desktop/tests/sessionHeaderActionsRendered.test.tsx apps/desktop/tests/paneChrome.test.tsx
  apps/desktop/tests/environmentPopoverRendered.test.tsx
  apps/desktop/tests/windowChromeContract.test.ts` — 31 passed, 0 failed, 206 expectations.
- Browser-backed dark and light inspection measured selected triggers at top 6px and height 28px
  before and after switching, with a semantic secondary background and zero liquid hosts.
- At the 300px minimum Dock width, labels collapsed without overlap; panel client and scroll widths
  were both 300px and browser warning/error output was empty.
- First post-rebase `bun run build:renderer` stopped at `eslint: command not found` because this
  existing worktree predated main's new lint dependencies. `bun install --frozen-lockfile`
  installed the lockfile versions without tracked changes.
- The next build found stale `sideChatOpen` references introduced by conflict resolution after
  main consolidated side chat into `dockTab`. The correction uses the current Dock state.
- Final `bun run build:renderer` passed ESLint, Stylelint, TypeScript, and a 6,401-module Vite
  production build. The existing large-chunk advisory remains non-failing.
- `bun script/verify/docs.ts` was run and reported 16 unclassified website evidence images already
  present on `origin/main`; this branch does not change those paths.
- `git diff --check origin/main...HEAD` passed after conflict resolution.

### Acceptance evidence

- AC-1: PASS — `bun test apps/desktop/tests/tabsToolbarRendered.test.tsx` passed and asserts zero
  toolbar liquid hosts.
- AC-2: PASS — `Browser dark/light switching check` kept the selected background inside the
  28px trigger.
- AC-3: PASS — `Browser 300px Dock check` retained tab semantics with matching client/scroll widths
  and empty warning/error logs.
- AC-4: PASS — `bun run build:renderer`, `bun script/verify/sdlc.ts --worktree`, and
  `git diff --check origin/main...HEAD` passed; `bun script/verify/docs.ts` is
  recorded separately because current `origin/main` has 16 unclassified website evidence images.

Residual risk: verification uses an isolated renderer because another worktree can own the native
Core and data directory. The defect and correction are renderer-only geometry, but native-window
review remains available during PR review.

## Behavioral evidence

Verdict: verified.

- Focused post-rebase command:
  `bun test apps/desktop/tests/tabsToolbarRendered.test.tsx
  apps/desktop/tests/sessionHeaderActionsRendered.test.tsx apps/desktop/tests/paneChrome.test.tsx
  apps/desktop/tests/environmentPopoverRendered.test.tsx
  apps/desktop/tests/windowChromeContract.test.ts` — 31 passed, 0 failed, 206 expectations.
- Browser-backed dark and light inspection measured selected triggers at top 6px and height 28px
  before and after switching, with a semantic secondary background and zero liquid hosts.
- At the 300px minimum Dock width, labels collapsed without overlap; panel client and scroll widths
  were both 300px and browser warning/error output was empty.
- First post-rebase `bun run build:renderer` stopped at `eslint: command not found` because this
  existing worktree predated main's new lint dependencies. `bun install --frozen-lockfile`
  installed the lockfile versions without tracked changes.
- The next build found stale `sideChatOpen` references introduced by conflict resolution after
  main consolidated side chat into `dockTab`. The correction uses the current Dock state.
- Final `bun run build:renderer` passed ESLint, Stylelint, TypeScript, and a 6,401-module Vite
  production build. The existing large-chunk advisory remains non-failing.
- `bun script/verify/docs.ts` was run and reported 16 unclassified website evidence images already
  present on `origin/main`; this branch does not change those paths.
- `git diff --check origin/main...HEAD` passed after conflict resolution.

### Acceptance evidence

- AC-1: PASS — `bun test apps/desktop/tests/tabsToolbarRendered.test.tsx` passed and asserts zero
  toolbar liquid hosts.
- AC-2: PASS — `Browser dark/light switching check` kept the selected background inside the
  28px trigger.
- AC-3: PASS — `Browser 300px Dock check` retained tab semantics with matching client/scroll widths
  and empty warning/error logs.
- AC-4: PASS — `bun run build:renderer`, `bun script/verify/sdlc.ts --worktree`, and
  `git diff --check origin/main...HEAD` passed; `bun script/verify/docs.ts` is
  recorded separately because current `origin/main` has 16 unclassified website evidence images.

Residual risk: verification uses an isolated renderer because another worktree can own the native
Core and data directory. The defect and correction are renderer-only geometry, but native-window
review remains available during PR review.

## Visual evidence

See bundle evidence/ when present.

## Security and privacy evidence

Not separately recorded unless present in legacy Verification.

## Deviations and residual risk

Residual risk: verification uses an isolated renderer because another worktree can own the native

## Verdict

Verdict: verified..

## Review and release

Approval: implementation, visible design, and PR creation were authorized by the user.
Review surface: [PR #198](https://github.com/IchenDEV/codeTwo/pull/198).
Release target: none requested.
Release identity: not applicable until released.
Smoke evidence: renderer evidence is recorded above.
Rollback: revert the scoped shared Tabs and regression-test changes.
No release: merge, package, deployment, and release are not authorized.

Preparing this section does not authorize merge, deployment, release, or production mutation.

## Feedback

After the rendered toolbar screenshot, the user requested a PR. Merge remains a separate human Gate.
