---
id: "2026-08-31-group-session-toolbar-actions"
stage: verification
schema: 3
status: passed
owner: codex
created: 2026-08-31
based_on: plan.md
commit: ""
verification_mode: owner
verified_by: "codex"
verified_at: "2026-09-02"
release_target: none requested
release_identity: "not applicable until released."
---

# Verification: Clarify the session toolbar hierarchy

## Automated checks

Verdict: verified.

- 2026-09-02 focused checks: `bun test ./tests/paneChrome.test.tsx` — 5 passed, 0 failed,
  35 expectations; `cargo test -p codetwo-core keymap` — 3 passed, 0 failed; `bunx tsc --noEmit`
  passed; and exact `rustfmt --check --edition 2021 crates/core/src/keymap.rs` passed.
- `bun run build:renderer` passed ESLint, Stylelint, TypeScript, and the 6,604-module production
  build. The existing large-chunk advisory remains non-failing.
- Browser QA at `http://127.0.0.1:4599/` rendered `⌘⌥R`, `⌘⌥D`, and `⌘⌥P` at the trailing edge of
  the View menu. Real keyboard input produced a 50/50 right split, then split only the focused right
  pane into 50/50 top and bottom panes. Side panel input toggled the Dock between 339px and 0px.
- The browser-preview transport remained intentionally unpaired, so its existing
  `C2 Web UI is not paired` conversation-load error was visible; menu and local-layout interaction
  remained available and no new UI runtime error appeared.
- `bun script/verify/docs.ts`, `bun script/verify/sdlc.ts`,
  `bun script/verify/sdlc.ts --worktree`, and `git diff --check` passed. Whole-workspace
  `cargo fmt --check` still reports pre-existing formatting drift in unchanged Rust files; the
  changed keymap file passes exact rustfmt validation.

- Focused post-rebase command:
  `bun test apps/desktop/tests/tabsToolbarRendered.test.tsx
  apps/desktop/tests/sessionHeaderActionsRendered.test.tsx apps/desktop/tests/paneChrome.test.tsx
  apps/desktop/tests/environmentPopoverRendered.test.tsx
  apps/desktop/tests/windowChromeContract.test.ts` — 31 passed, 0 failed, 206 expectations.
- Browser at 1280x720 measured Add action, Open, and Commit at 28px with independent fills and 8px
  spacing; plugin, environment, and View measured 28x28px with transparent rest backgrounds. The
  group had zero padding and no box shadow.
- Clicking Open exposed Cursor, Antigravity, Finder, and Move task to device. Clicking View exposed
  Split right, Split down, and Side panel.
- Explicit light and system dark appearances preserved hierarchy. At 600x720, labels and resting
  fills collapsed to 28px icons; body and header widths matched scroll widths and the header remained
  40px.
- Browser warning/error output was empty. Appearance and viewport were restored after QA.
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

- AC-1: PASS — `bun test apps/desktop/tests/sessionHeaderActionsRendered.test.tsx` and rendered
  metrics prove independent filled icon-label
  controls with no group shadow or trailing trigger.
- AC-2: PASS — `Browser 1280px toolbar metrics` and component tests prove 28px icon-only secondary controls with
  accessible names.
- AC-3: PASS — `bun test apps/desktop/tests/paneChrome.test.tsx` and the View interaction expose
  split, close, and checked panel commands.
- AC-4: PASS — `bun test apps/desktop/tests/sessionHeaderActionsRendered.test.tsx` covers Open,
  repository, checkpoint, push, pane, and panel
  routes and states.
- AC-5: PASS — `Browser 1280px light/dark and 600px compact checks` retained geometry without
  overflow.
- AC-6: PASS — `Browser rail-divider rendered check` retained the vertical boundary and removed only the
  title-row hairline.
- AC-7: PASS — `bun run build:renderer`, `bun script/verify/sdlc.ts --worktree`, and
  `git diff --check origin/main...HEAD` passed; `bun script/verify/docs.ts` is
  recorded separately because current `origin/main` has 16 unclassified website evidence images.
- AC-8: PASS — `bun test ./tests/paneChrome.test.tsx` covers the rendered View hints, and the
  settings page lists the same three shared actions for user rebinding.
- AC-9: PASS — `cargo test -p codetwo-core keymap` covers the shared defaults; browser keypress
  evidence proves focused right/down splitting and side-panel open/close behavior.

Residual risk: truly compact windows necessarily return to multiple icons; accessible names and
tooltips carry distinction there. Multiple third-party plugin actions can look similar at that
width. Native Core behavior is outside this renderer-only visual change.

## Behavioral evidence

Verdict: verified.

- 2026-09-02 focused checks: `bun test ./tests/paneChrome.test.tsx` — 5 passed, 0 failed,
  35 expectations; `cargo test -p codetwo-core keymap` — 3 passed, 0 failed; `bunx tsc --noEmit`
  passed; and exact `rustfmt --check --edition 2021 crates/core/src/keymap.rs` passed.
- `bun run build:renderer` passed ESLint, Stylelint, TypeScript, and the 6,604-module production
  build. The existing large-chunk advisory remains non-failing.
- Browser QA at `http://127.0.0.1:4599/` rendered `⌘⌥R`, `⌘⌥D`, and `⌘⌥P` at the trailing edge of
  the View menu. Real keyboard input produced a 50/50 right split, then split only the focused right
  pane into 50/50 top and bottom panes. Side panel input toggled the Dock between 339px and 0px.
- The browser-preview transport remained intentionally unpaired, so its existing
  `C2 Web UI is not paired` conversation-load error was visible; menu and local-layout interaction
  remained available and no new UI runtime error appeared.
- `bun script/verify/docs.ts`, `bun script/verify/sdlc.ts`,
  `bun script/verify/sdlc.ts --worktree`, and `git diff --check` passed. Whole-workspace
  `cargo fmt --check` still reports pre-existing formatting drift in unchanged Rust files; the
  changed keymap file passes exact rustfmt validation.

- Focused post-rebase command:
  `bun test apps/desktop/tests/tabsToolbarRendered.test.tsx
  apps/desktop/tests/sessionHeaderActionsRendered.test.tsx apps/desktop/tests/paneChrome.test.tsx
  apps/desktop/tests/environmentPopoverRendered.test.tsx
  apps/desktop/tests/windowChromeContract.test.ts` — 31 passed, 0 failed, 206 expectations.
- Browser at 1280x720 measured Add action, Open, and Commit at 28px with independent fills and 8px
  spacing; plugin, environment, and View measured 28x28px with transparent rest backgrounds. The
  group had zero padding and no box shadow.
- Clicking Open exposed Cursor, Antigravity, Finder, and Move task to device. Clicking View exposed
  Split right, Split down, and Side panel.
- Explicit light and system dark appearances preserved hierarchy. At 600x720, labels and resting
  fills collapsed to 28px icons; body and header widths matched scroll widths and the header remained
  40px.
- Browser warning/error output was empty. Appearance and viewport were restored after QA.
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

- AC-1: PASS — `bun test apps/desktop/tests/sessionHeaderActionsRendered.test.tsx` and rendered
  metrics prove independent filled icon-label
  controls with no group shadow or trailing trigger.
- AC-2: PASS — `Browser 1280px toolbar metrics` and component tests prove 28px icon-only secondary controls with
  accessible names.
- AC-3: PASS — `bun test apps/desktop/tests/paneChrome.test.tsx` and the View interaction expose
  split, close, and checked panel commands.
- AC-4: PASS — `bun test apps/desktop/tests/sessionHeaderActionsRendered.test.tsx` covers Open,
  repository, checkpoint, push, pane, and panel
  routes and states.
- AC-5: PASS — `Browser 1280px light/dark and 600px compact checks` retained geometry without
  overflow.
- AC-6: PASS — `Browser rail-divider rendered check` retained the vertical boundary and removed only the
  title-row hairline.
- AC-7: PASS — `bun run build:renderer`, `bun script/verify/sdlc.ts --worktree`, and
  `git diff --check origin/main...HEAD` passed; `bun script/verify/docs.ts` is
  recorded separately because current `origin/main` has 16 unclassified website evidence images.
- AC-8: PASS — `bun test ./tests/paneChrome.test.tsx` covers the rendered View hints, and the
  settings page lists the same three shared actions for user rebinding.
- AC-9: PASS — `cargo test -p codetwo-core keymap` covers the shared defaults; browser keypress
  evidence proves focused right/down splitting and side-panel open/close behavior.

Residual risk: truly compact windows necessarily return to multiple icons; accessible names and
tooltips carry distinction there. Multiple third-party plugin actions can look similar at that
width. Native Core behavior is outside this renderer-only visual change.

## Visual evidence

See bundle evidence/ when present.

## Security and privacy evidence

Not separately recorded unless present in legacy Verification.

## Deviations and residual risk

Residual risk: truly compact windows necessarily return to multiple icons; accessible names and

## Verdict

Verdict: verified..

## Review and release

Approval: implementation, final screenshot review, and PR creation were authorized by the user.
Review surface: [PR #198](https://github.com/IchenDEV/codeTwo/pull/198).
Follow-up review surface: [Draft PR #219](https://github.com/IchenDEV/codeTwo/pull/219).
Release target: none requested.
Release identity: not applicable until released.
Smoke evidence: renderer evidence is recorded above.
Rollback: revert the scoped renderer and focused-test changes; no data migration is involved.
No release: merge, deployment, and release are not authorized.

Preparing this section does not authorize merge, deployment, release, or production mutation.

## Feedback

The accepted direction pairs icons and labels only on filled primary actions, keeps secondary
controls as bare icons, uses C2's radius and icon set, and relies on whitespace for grouping. After
reviewing the final rendered screenshot, the user requested a PR. Merge remains a separate Gate.
