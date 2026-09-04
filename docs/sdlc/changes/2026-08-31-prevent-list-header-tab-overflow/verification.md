---
id: "2026-08-31-prevent-list-header-tab-overflow"
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

# Verification: Prevent list-header tabs from clipping in narrow panes

## Automated checks

Verdict: verified.

- The first focused-test command stopped before loading tests because this fresh worktree did not
  have desktop dependencies and Bun could not resolve `react/jsx-dev-runtime`. `bun install
  --frozen-lockfile` installed the locked dependency graph without changing the lock file.
- The final focused run passed 28 tests and 217 expectations across
  `automationPageRendered.test.tsx`, `pluginManagerRendered.test.tsx`, and
  `githubPullRequestsRendered.test.tsx`. Existing non-failing React `act(...)` warnings remained
  unchanged.
- `bun run build:renderer` passed ESLint, Stylelint, TypeScript, and the production Vite build with
  6,401 transformed modules. Vite retained its existing large-chunk advisory.
- Browser-backed inspection at `http://localhost:1420/` passed page identity (`C2`), meaningful DOM,
  framework-overlay, and console checks. At the default 1280x720 viewport, Automations, Features &
  plugins, and Pull requests each measured exactly 32px / 32px / 32px for title, first-selection
  text, and search-icon offsets. Dark and light rendering retained zero document horizontal
  overflow.
- At a temporary 720x720 viewport the list pane reached its 320px minimum. It showed Features,
  MCPs, Skills, Hooks, and Marketplace completely; the category group's client and scroll widths
  matched, the final tab ended inside the pane, and document horizontal overflow remained zero.
  Automations and Pull requests retained their shared 32px content line at the same list width, and
  both plugin and pull-request selection groups had zero horizontal overflow. When the persistent
  sidebar collapsed, its recovery action correctly preceded the title as the documented shell
  exception.
- Clicking Paused set its pressed state, clicking Skills set its selected state and changed the
  search placeholder to `Search skills…`, and clicking Reviewing set its selected state. Light,
  dark, and compact screenshots showed complete labels, no horizontal scrollbar, and no overlap.
  Browser warning and error logs were empty, and no Vite or framework overlay was present. The
  temporary viewport and appearance overrides were reset after inspection.
- On the pre-rebase baseline, `git diff --check` and `bun script/check-sdlc.ts` passed. After
  rebasing onto `origin/main` at `c37868db`, the same 28 focused tests and 217 expectations passed,
  and `bun run build:renderer` again passed ESLint, Stylelint, TypeScript, and the 6,401-module Vite
  production build.
- The first schema-2 `bun script/verify/sdlc.ts` run retained five concrete failures because the
  migrated acceptance mappings did not yet contain machine-readable command references. Adding a
  command reference to each affected mapping corrected the Artifact; `bun script/verify/docs.ts`
  and `bun script/verify/sdlc.ts` then passed. The first `--worktree` pass correctly rejected the
  transitional deletion of the pre-rebase flat Artifact until the migration was folded into the
  branch commit.
- The 2026-09-02 focused follow-up passed 18 tests and 127 expectations in
  `pluginManagerRendered.test.tsx`, plus `bunx tsc --noEmit` and a fresh static Web UI build.
  Browser measurement at the annotated 1247x1576 viewport found 4px left/right padding on all five
  category tabs, four exact 4px adjacent gaps, and a tab list whose client and scroll widths both
  measured 310px. All five categories remained clickable and ArrowRight moved focus from Hooks to
  Marketplace. The only console errors were the existing unpaired-static-Web-UI transport errors.
- The later 2026-09-02 focused follow-up passed 18 tests and 129 expectations in
  `pluginManagerRendered.test.tsx`. `bun run build:renderer` passed ESLint, Stylelint, TypeScript,
  and the 6,604-module production Vite build; a fresh static Web UI build also passed with the same
  module count and existing large-chunk advisory. Because the Browser plugin was not available in
  this environment, local Playwright measured the rendered page at the annotated 1247x1576
  viewport: the control stack had exactly 8px left and right padding, the category row retained
  matching 310px client/scroll widths, and the document retained matching 1247px client/scroll
  widths with no framework overlay. Hooks selection and its `Search hooks…` placeholder worked,
  then Features selection was restored. The only console errors were the existing unpaired static
  Web UI transport errors.

### Acceptance evidence

- AC-1: PASS — `in-app Browser DOM measurement at 320px list width` showed All, Active, and Paused completely with zero horizontal overflow.
- AC-2: PASS — `in-app Browser DOM measurement at 320px list width` showed all five plugin categories with matched client and scroll widths.
- AC-3: PASS — `bun test apps/desktop/tests/automationPageRendered.test.tsx apps/desktop/tests/pluginManagerRendered.test.tsx apps/desktop/tests/githubPullRequestsRendered.test.tsx` preserved selection, search, refresh, focus, leading-action, and compact list/detail semantics.
- AC-4: PASS — the focused tests, `bun run build:renderer`, light/dark/narrow browser inspection, overlay and console checks, and repository Gate commands passed.
- AC-5: PASS — `in-app Browser DOM measurement at 1280x720` recorded exact 32px Automations title, All-label, and search-icon offsets plus the collapsed-shell exception.
- AC-6: PASS — `in-app Browser DOM measurement at 1280x720` recorded exact 32px / 32px / 32px offsets on Automations, Features & plugins, and Pull requests.
- AC-7: PASS — `githubPullRequestsRendered.test.tsx` and the rendered interaction check preserved view selection, search, filter, refresh, and compact structure after row separation.
- AC-8: PASS — `bun test ./tests/pluginManagerRendered.test.tsx` protected the 4px token contract;
  in-app Browser DOM measurement at 1247x1576 confirmed 4px inline padding, 4px adjacent gaps, and
  matched 310px client/scroll widths across the category row.
- AC-9: PASS — `bun test ./tests/pluginManagerRendered.test.tsx` protects the local 8px utility;
  local Playwright at 1247x1576 confirmed exact 8px left/right computed padding, preserved category
  interaction, matched category and document client/scroll widths, and no framework overlay.

Residual risk: verification used the isolated renderer with fixture data rather than launching
this worktree's native app because another worktree already owns the default desktop data directory.
Native window chrome was not re-exercised. The 48px titlebar and platform safe-area classes remain
unchanged, and their normal and recovery-action branches are covered by focused rendered assertions
plus the successful renderer build.

## Behavioral evidence

Verdict: verified.

- The first focused-test command stopped before loading tests because this fresh worktree did not
  have desktop dependencies and Bun could not resolve `react/jsx-dev-runtime`. `bun install
  --frozen-lockfile` installed the locked dependency graph without changing the lock file.
- The final focused run passed 28 tests and 217 expectations across
  `automationPageRendered.test.tsx`, `pluginManagerRendered.test.tsx`, and
  `githubPullRequestsRendered.test.tsx`. Existing non-failing React `act(...)` warnings remained
  unchanged.
- `bun run build:renderer` passed ESLint, Stylelint, TypeScript, and the production Vite build with
  6,401 transformed modules. Vite retained its existing large-chunk advisory.
- Browser-backed inspection at `http://localhost:1420/` passed page identity (`C2`), meaningful DOM,
  framework-overlay, and console checks. At the default 1280x720 viewport, Automations, Features &
  plugins, and Pull requests each measured exactly 32px / 32px / 32px for title, first-selection
  text, and search-icon offsets. Dark and light rendering retained zero document horizontal
  overflow.
- At a temporary 720x720 viewport the list pane reached its 320px minimum. It showed Features,
  MCPs, Skills, Hooks, and Marketplace completely; the category group's client and scroll widths
  matched, the final tab ended inside the pane, and document horizontal overflow remained zero.
  Automations and Pull requests retained their shared 32px content line at the same list width, and
  both plugin and pull-request selection groups had zero horizontal overflow. When the persistent
  sidebar collapsed, its recovery action correctly preceded the title as the documented shell
  exception.
- Clicking Paused set its pressed state, clicking Skills set its selected state and changed the
  search placeholder to `Search skills…`, and clicking Reviewing set its selected state. Light,
  dark, and compact screenshots showed complete labels, no horizontal scrollbar, and no overlap.
  Browser warning and error logs were empty, and no Vite or framework overlay was present. The
  temporary viewport and appearance overrides were reset after inspection.
- On the pre-rebase baseline, `git diff --check` and `bun script/check-sdlc.ts` passed. After
  rebasing onto `origin/main` at `c37868db`, the same 28 focused tests and 217 expectations passed,
  and `bun run build:renderer` again passed ESLint, Stylelint, TypeScript, and the 6,401-module Vite
  production build.
- The first schema-2 `bun script/verify/sdlc.ts` run retained five concrete failures because the
  migrated acceptance mappings did not yet contain machine-readable command references. Adding a
  command reference to each affected mapping corrected the Artifact; `bun script/verify/docs.ts`
  and `bun script/verify/sdlc.ts` then passed. The first `--worktree` pass correctly rejected the
  transitional deletion of the pre-rebase flat Artifact until the migration was folded into the
  branch commit.
- The 2026-09-02 focused follow-up passed 18 tests and 127 expectations in
  `pluginManagerRendered.test.tsx`, plus `bunx tsc --noEmit` and a fresh static Web UI build.
  Browser measurement at the annotated 1247x1576 viewport found 4px left/right padding on all five
  category tabs, four exact 4px adjacent gaps, and a tab list whose client and scroll widths both
  measured 310px. All five categories remained clickable and ArrowRight moved focus from Hooks to
  Marketplace. The only console errors were the existing unpaired-static-Web-UI transport errors.
- The later 2026-09-02 focused follow-up passed 18 tests and 129 expectations in
  `pluginManagerRendered.test.tsx`. `bun run build:renderer` passed ESLint, Stylelint, TypeScript,
  and the 6,604-module production Vite build; a fresh static Web UI build also passed with the same
  module count and existing large-chunk advisory. Because the Browser plugin was not available in
  this environment, local Playwright measured the rendered page at the annotated 1247x1576
  viewport: the control stack had exactly 8px left and right padding, the category row retained
  matching 310px client/scroll widths, and the document retained matching 1247px client/scroll
  widths with no framework overlay. Hooks selection and its `Search hooks…` placeholder worked,
  then Features selection was restored. The only console errors were the existing unpaired static
  Web UI transport errors.

### Acceptance evidence

- AC-1: PASS — `in-app Browser DOM measurement at 320px list width` showed All, Active, and Paused completely with zero horizontal overflow.
- AC-2: PASS — `in-app Browser DOM measurement at 320px list width` showed all five plugin categories with matched client and scroll widths.
- AC-3: PASS — `bun test apps/desktop/tests/automationPageRendered.test.tsx apps/desktop/tests/pluginManagerRendered.test.tsx apps/desktop/tests/githubPullRequestsRendered.test.tsx` preserved selection, search, refresh, focus, leading-action, and compact list/detail semantics.
- AC-4: PASS — the focused tests, `bun run build:renderer`, light/dark/narrow browser inspection, overlay and console checks, and repository Gate commands passed.
- AC-5: PASS — `in-app Browser DOM measurement at 1280x720` recorded exact 32px Automations title, All-label, and search-icon offsets plus the collapsed-shell exception.
- AC-6: PASS — `in-app Browser DOM measurement at 1280x720` recorded exact 32px / 32px / 32px offsets on Automations, Features & plugins, and Pull requests.
- AC-7: PASS — `githubPullRequestsRendered.test.tsx` and the rendered interaction check preserved view selection, search, filter, refresh, and compact structure after row separation.
- AC-8: PASS — `bun test ./tests/pluginManagerRendered.test.tsx` protected the 4px token contract;
  in-app Browser DOM measurement at 1247x1576 confirmed 4px inline padding, 4px adjacent gaps, and
  matched 310px client/scroll widths across the category row.
- AC-9: PASS — `bun test ./tests/pluginManagerRendered.test.tsx` protects the local 8px utility;
  local Playwright at 1247x1576 confirmed exact 8px left/right computed padding, preserved category
  interaction, matched category and document client/scroll widths, and no framework overlay.

Residual risk: verification used the isolated renderer with fixture data rather than launching
this worktree's native app because another worktree already owns the default desktop data directory.
Native window chrome was not re-exercised. The 48px titlebar and platform safe-area classes remain
unchanged, and their normal and recovery-action branches are covered by focused rendered assertions
plus the successful renderer build.

## Visual evidence

See bundle evidence/ when present.

## Security and privacy evidence

Not separately recorded unless present in legacy Verification.

## Deviations and residual risk

Residual risk: verification used the isolated renderer with fixture data rather than launching

## Verdict

Verdict: verified..

## Review and release

Approval: the user explicitly authorized PR creation and merge on 2026-08-31 after the verified
rendered handoff. [PR #191](https://github.com/IchenDEV/codeTwo/pull/191) is the authoritative
review and integration record; repository checks must pass before merge.
Release target: none requested.
Release identity: not applicable until released.
Smoke evidence: not applicable until released.
Rollback: restore the prior scoped renderer markup, styles, and tests.
No release: this is a repository UI correction only; no package, deployment, or product release is
requested.

## Feedback

The user supplied an annotated screenshot showing that the Automations title and list-control
content do not share an intentional left alignment line, and requested a grid-based correction.
