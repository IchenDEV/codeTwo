---
id: change-2026-08-31-fix-dock-tab-indicator-alignment
kind: change
schema: 2
status: verified
risk: medium
owner: codex
approvers: [user]
approved_at: 2026-08-31
created: 2026-08-31
updated: 2026-08-31
source: user-supplied selected Dock tab misalignment screenshot and direct implementation request on 2026-08-31
inputs: rendered defect reproduction, shared Tabs implementation, macOS compact-toolbar conventions
outputs: scoped toolbar indicator correction, regression coverage, and rendered evidence
scope: apps/desktop/src/components/ui/tabs.tsx, apps/desktop/tests/tabsToolbarRendered.test.tsx, apps/desktop/tests/windowChromeContract.test.ts, docs/sdlc/changes/2026-08-31-fix-dock-tab-indicator-alignment.md, docs/sdlc/changes/2026-08-31-fix-dock-tab-indicator-alignment
next_trigger: pull request review and explicit merge approval
verification_mode: owner
verified_by: codex
verified_at: 2026-08-31
---

# Align the selected Dock tab background

## Intent

The user supplied a rendered screenshot in which the selected Dock tab label and icon were correctly
placed, but the rounded selection background was shifted down and left into the content boundary.
The desired outcome is one quiet selected state whose background stays inside its selected tab at
every Dock width.

The change is limited to the compact toolbar presentation of shared Tabs. Other tab variants, Dock
content, panel resizing, and navigation behavior are non-goals.

## Spec

Compact toolbar Tabs use a stable, trigger-owned selected background instead of mounting the shared
liquid selection layer. Default and line Tabs keep their existing animation. The toolbar trigger's
selected background, rounded shape, text color, hover behavior, accessible tab semantics, and
keyboard behavior remain expressed through the shared component.

The fallback works without JavaScript geometry and is therefore unaffected by the liquid wrapper's
positioning, delayed measurement, Dock width animation, or reduced-motion setting. Rollback restores
the toolbar liquid layer and removes the focused regression.

### Acceptance criteria

- [x] AC-1: The Dock toolbar omits the liquid selection layer and its selected trigger owns the
      semantic secondary background.
- [x] AC-2: Selected background bounds match the selected trigger in light and dark appearance
      before and after switching tabs.
- [x] AC-3: Standard and constrained Dock widths retain correct tab semantics with no overlap or
      relevant console error.
- [x] AC-4: Focused rendered tests, renderer build, lifecycle checks, and diff hygiene pass; the
      documentation check is run and any inherited base failure is recorded.

## Decision and gates

The user's screenshot-backed implementation request accepted Intent and visible design. After the
final toolbar screenshot was shown, the user explicitly requested a PR on 2026-08-31. PR creation
is authorized; merge, release, deployment, and production mutation remain separate pending Gates.

The diagnosis measured a 28px selected trigger at top 6px while the liquid indicator rendered at top
20px inside a 0x0 wrapper after the library overwrote absolute positioning. This evidence selected a
static toolbar background while preserving animation for variants designed to contain it.

## Plan

1. Add rendered coverage proving toolbar Tabs omit the liquid layer and expose a selected trigger
   background.
2. Scope liquid measurement and rendering away from the toolbar variant.
3. Re-run browser geometry checks across switching, appearance, and constrained width, followed by
   focused tests, the renderer build, documentation, lifecycle, and diff checks.

## Build

The shared Tabs component disables liquid measurement, observers, and rendering only for the
compact toolbar variant. Toolbar triggers own their semantic secondary selected background and
hover state, so the painted shape cannot leave the trigger's coordinate system. Default and line
Tabs retain liquid indicators. A focused rendered regression mounts Tabs with ResizeObserver
available and proves a selected toolbar does not mount the liquid host.

The implementation was rebased onto `origin/main` at `a224a752`. The Tabs conflict preserved the
latest semantic radius from main and retained the trigger-owned toolbar correction.

## Verification

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

## Review and release

Approval: implementation, visible design, and PR creation were authorized by the user.
Release target: none requested.
Release identity: not applicable until released.
Smoke evidence: renderer evidence is recorded above.
Rollback: revert the scoped shared Tabs and regression-test changes.
No release: merge, package, deployment, and release are not authorized.

Preparing this section does not authorize merge, deployment, release, or production mutation.

## Feedback

After the rendered toolbar screenshot, the user requested a PR. Merge remains a separate human Gate.
