---
id: change-2026-08-31-group-session-toolbar-actions
kind: change
schema: 2
status: verified
risk: medium
owner: codex
approvers: [user]
approved_at: 2026-08-31
created: 2026-08-31
updated: 2026-09-02
source: user-supplied session-toolbar screenshots and iterative visual feedback on 2026-08-31; View-menu browser comment requesting shortcuts on 2026-09-02
inputs: screenshot feedback, accepted three-group layout, existing titlebar toolbar contract
outputs: independent filled primary actions, icon-only secondary controls, consolidated View menu, configurable View-command shortcuts, rail divider removal, and rendered evidence
scope: apps/desktop/src/App.tsx, apps/desktop/src/bridge.ts, apps/desktop/src/environment/EnvironmentPopover.tsx, apps/desktop/src/i18n/strings.ts, apps/desktop/src/session/PaneChrome.tsx, apps/desktop/src/session/SessionHeaderActions.tsx, apps/desktop/src/settings/PersonalSettings.tsx, apps/desktop/src/styles.css, apps/desktop/tests/environmentPopoverRendered.test.tsx, apps/desktop/tests/paneChrome.test.tsx, apps/desktop/tests/sessionHeaderActionsRendered.test.tsx, apps/desktop/tests/windowChromeContract.test.ts, crates/core/src/keymap.rs, docs/sdlc/changes/2026-08-31-group-session-toolbar-actions.md, docs/sdlc/changes/2026-08-31-group-session-toolbar-actions
next_trigger: pull request review and explicit merge approval
verification_mode: owner
verified_by: codex
verified_at: 2026-09-02
---

# Clarify the session toolbar hierarchy

## Intent

The user reported that the session titlebar mixed wide and narrow buttons, placed controls too close
together, varied icon tone, and exposed too many similar glyphs to distinguish reliably. The final
reference establishes hierarchy only: primary task actions should read as separate filled control
islands, while contextual and layout actions remain bare icons. Its large capsule radius and literal
glyphs are not authoritative.

The affected system is the renderer session titlebar. Action behavior, menu destinations, plugin
contributions, pane creation, Dock state, titlebar height, and application data are otherwise
unchanged.

## Spec

Present Add action, Open, Commit, and saved actions as independent controls with the existing C2
28px compact-control height, C2 control radius, semantic resting fill, one muted leading icon, and
one label. Use 8px between these controls and no shared outer package. Open and Commit remain one
complete pull-down button apiece, without a separate trailing chevron.

Present plugin, environment, and View as quiet icon-only toolbar controls beside the primary action
set. Keep their accessible names and tooltips. View retains one menu for split, conditional close,
and side-panel commands. Show each persistent View command's live keymap binding at the trailing
edge of its menu row, and let those same bindings invoke the focused-pane or side-panel action.
Keep 8px inside the context group and 16px between context, task, and layout groups. Below the
compact breakpoint, hide primary labels and remove resting fills so each action becomes a 28px bare
icon.

Remove only the horizontal hairline between the session rail title row and its search/content area.
Keep the rail's vertical edge, the session header's content-dependent divider, and unrelated
boundaries.

### Acceptance criteria

- [x] AC-1: Expanded primary actions are independent semantic-fill controls with one muted icon and
      one label, without a shared package or trailing chevrons.
- [x] AC-2: Plugin, environment, and View are icon-only controls with intact accessible names and
      tooltips.
- [x] AC-3: View exposes split, conditional close, and checked side-panel commands through one menu
      separated from the primary actions by 16px.
- [x] AC-4: Open, move-task, source-control, checkpoint, push, split, close, and panel-toggle
      behaviors retain accessible names, disabled states, and effects.
- [x] AC-5: Standard, 600px narrow, light, and dark states retain a 40px titlebar and 28px controls
      without clipping or horizontal overflow.
- [x] AC-6: The rail title row has no bottom hairline while the vertical edge and unrelated dividers
      remain intact.
- [x] AC-7: Focused tests, renderer build, lifecycle checks, and diff hygiene pass without relevant
      runtime errors; the documentation check is run and any inherited base failure is recorded.
- [x] AC-8: Split right, Split down, and Side panel show their current customizable keymap bindings
      in the View menu, including user overrides.
- [x] AC-9: The three displayed shortcuts execute against the focused pane or current side-panel
      state, and rendered-browser interaction plus focused keymap tests pass.

## Decision and gates

The final screenshot-backed direction supersedes experiments with transparent text-only items,
outlined capsules, split-button chevrons, and a shared package. After the verified screenshot was
shown, the user explicitly requested a PR on 2026-08-31. PR creation is authorized; merge, release,
deployment, and production mutation remain separate pending Gates.

## Plan

1. Keep Open and Commit as whole-item pull-down controls and give every expanded primary action one
   icon, one label, and its own semantic resting fill.
2. Keep plugin, environment, and View icon-only with existing accessible labels and menu behavior.
3. Protect hierarchy and interaction with focused tests, then validate standard, narrow, light, and
   dark renderer states plus repository Gates.
4. Extend the shared Core keymap with View commands, dispatch them through the existing renderer
   shortcut handler, and render the live bindings with the existing menu-shortcut primitive.

Rollback reverts the scoped titlebar, pane-chrome, responsive-style, and test changes. It does not
affect stored sessions, pane layout data, or repository data.

## Build

- `SessionHeaderActions` uses independent 28px controls with semantic resting fills for Add action,
  saved actions, Open, and Commit. Each has one muted icon and one label; the group has 8px spacing
  and no shared padding, shadow, border, or radius.
- Open and Commit keep complete-button dropdown interaction. No trailing arrow, split trigger,
  duplicate compact control, or extra state was added.
- Plugin, environment, and View retain their components and behavior but render at 28px as icon-only
  controls. The compact rule removes primary fills, hides labels, and fixes each action to 28px.
- View consolidates pane split, conditional close, and side-panel state in one menu.
- The implementation was rebased onto `origin/main` at `a224a752`. Conflict resolution preserved
  main's Feishu-page suppression, pet conversation work, and semantic radius while retaining the
  accepted toolbar hierarchy.
- The 2026-09-02 follow-up adds Split pane right, Split pane down, and Toggle side panel to the
  shared Core keymap with `Mod+Alt+R`, `Mod+Alt+D`, and `Mod+Alt+P` defaults. Existing keymap loading
  layers user overrides over those defaults, so the menu and settings page stay synchronized.
- `PaneLayoutToolbar` reuses the repository's `DropdownMenuShortcut` primitive. `App` routes the
  three actions through the existing global key dispatcher and shares one side-panel callback
  between the menu and keyboard path.

## Verification

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
