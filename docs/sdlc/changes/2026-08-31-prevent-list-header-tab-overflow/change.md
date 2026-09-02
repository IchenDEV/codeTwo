---
id: change-2026-08-31-prevent-list-header-tab-overflow
kind: change
schema: 2
status: verified
risk: low
owner: codex
approvers: user via the 2026-08-31 screenshot feedback and PR-and-merge request
approved_at: 2026-08-31
created: 2026-08-31
updated: 2026-09-02
source: user-supplied clipping and alignment screenshots plus direct remediation requests on 2026-08-31; Plugin Manager tab padding and gap annotations on 2026-09-02
inputs: screenshots, live checkout, existing split-panel layout, layout specification, and design tokens
outputs: responsive aligned list controls, consistent Plugin Manager tab spacing, focused regression coverage, and rendered narrow-state evidence
scope: apps/desktop, docs/sdlc/changes/2026-08-31-prevent-list-header-tab-overflow
next_trigger: pull request review and explicit merge approval
verification_mode: owner
verified_by: codex
verified_at: 2026-09-02
---

# Prevent list-header tabs from clipping in narrow panes

## Intent

The user supplied macOS screenshots in which Automations truncates the Paused filter and Features &
plugins truncates later resource tabs while exposing horizontal scrollbar thumbs. The list panes
must keep their title, navigation labels, counts, and primary action readable without making text
smaller or requiring horizontal scrolling inside the titlebar.

The affected systems are the Automations, Features & plugins, and Pull requests list-pane controls
and their responsive styling. Automation behavior, plugin state, pull-request data, search
behavior, detail panes, native process ownership, and unrelated full-canvas pages are non-goals.
The user's direct remediation request accepts this Intent and the visible layout correction; it
does not authorize a pull request, merge, release, or deployment.

## Spec

Each affected list pane keeps the semantic window titlebar as a stable title/action row and renders
its filter or category control in a dedicated row with no horizontal scrolling. Plugin category
counts remain visible when their own list pane has room and hide when that pane reaches the
content-defined narrow breakpoint. Responsive behavior is based on the list pane's inline size,
not the full page or device viewport.

Existing button, tab, group, focus, and accessible-name semantics remain unchanged. Existing
48px titlebar geometry, compact list/detail switching, search, selection, and platform safe-area
behavior remain compatible. No stored state or backend interface changes.

The title text, first filter/category label, and search affordance use one deliberate optical
content line derived from the existing 4px spacing grid. Outer control shapes may retain their own
padding; the visible content must not appear to begin on unrelated horizontal coordinates.

All split-list workbenches use the existing 32px `pageSection` content line. Component-specific
button padding may use a token-derived row offset to reach that line. Full-canvas Task board and
Docker layouts keep their existing page/chrome grids because they are not split-list rails.

### Acceptance criteria

- [x] AC-1: Automations displays All, Active, and Paused completely with no titlebar horizontal scrollbar
      at the standard narrow list-pane width.
- [x] AC-2: Features & plugins displays all five category labels completely; counts adapt to the list
      pane's own width and no category row has horizontal scrolling.
- [x] AC-3: Titles, create/recovery action, tab or filter semantics, keyboard focus, search, selection,
      and compact list/detail behavior remain intact.
- [x] AC-4: Focused rendered tests, renderer build, SDLC validation, and real light/dark narrow rendered
      inspection pass without clipping, horizontal overflow, framework overlay, or relevant
      console errors.
- [x] AC-5: In Automations, the title, All label, and search icon share the accepted optical content line
      when the persistent sidebar is present; a shell recovery action may precede the title when
      the sidebar is collapsed.
- [x] AC-6: Automations, Features & plugins, and Pull requests share the same 32px title, first-selection,
      and search-icon content line at standard width; the collapsed-sidebar recovery action remains
      an explicit shell exception.
- [x] AC-7: Pull requests separates its title/action row from its view/search controls without changing
      tab, filter, refresh, selection, or compact list/detail behavior.
- [x] AC-8: Every Plugin Manager category tab uses 4px inline padding and adjacent tabs use a 4px
      gap at the annotated list-pane width, without clipping or horizontal overflow.

## Decision and gates

The user's direct implementation request accepts Intent and visible-design correction. The
existing semantic titlebar, control sizing, spacing tokens, and container-query architecture are
the design source of truth. Human review is required after verification. Pull request, merge,
release, deployment, and production Gates remain unauthorized.

The user's annotated alignment screenshot and direct `grid-layout` request accept reopening this
change for the scoped alignment correction.

The user's follow-up concern about other pages and direct request to improve them accepts extending
the same change to the peer Pull requests split-list surface and one shared 32px workbench rule.
The user's 2026-08-31 request, “pr & merge,” separately authorizes PR creation and merge after the
required repository checks pass; it does not authorize a product release or deployment.

The user's 2026-09-02 browser annotations accept reopening this change for one local spacing
correction: 4px inline padding on each Plugin Manager category tab and a larger 4px inter-tab gap.

## Plan

1. Separate each affected title/action row from its filter or category row while retaining existing
   semantics and the macOS collapsed-sidebar safe area.
2. Base plugin count compaction on a named list-pane container and remove titlebar horizontal
   scrolling from both surfaces.
3. Add focused rendered and source-contract coverage, then verify build, lifecycle contract, and
   real narrow light/dark rendering.
4. Measure the visible title, first selection label, and search affordance against the existing
   4px grid; correct their shared optical line with existing spacing tokens and repeat rendered QA.
5. Record one 32px split-list content line in the layout specification, apply it to the three peer
   workbenches, and keep unrelated full-canvas page shells outside this rule.
6. Replace the Plugin Manager compact row's asymmetric 8px/2px tab padding and 2px gap with the
   existing 4px inline spacing token, preserving the 24rem count-hiding breakpoint.

Rollback restores the two prior single-row headers and page-level plugin breakpoint rules; no data,
configuration, or external state is changed.

## Build

[PR #191](https://github.com/IchenDEV/codeTwo/pull/191) carries the scoped implementation and its
schema-2 lifecycle record.

[PR #219](https://github.com/IchenDEV/codeTwo/pull/219) carries the 2026-09-02 Web UI follow-up and
the local Plugin Manager spacing correction.

- Automations keeps its 48px title/action row and renders the existing accessible filter group plus
  search field in a dedicated list-control stack below it. The macOS safe-area class remains on the
  actual titlebar and the create action retains its accessible name and behavior.
- Features & plugins uses the same title/control separation. Its category group no longer scrolls
  horizontally, and the five labels retain their existing tab roles, selected state, focus styling,
  counts, and click behavior.
- The plugin list pane is now a named inline-size container. Below its content-defined 24rem
  threshold, only numeric counts hide; category labels and spacing remain visible.
- Focused rendered tests protect the title/control separation, all five category tabs, absence of
  the prior overflow utility, and the list-pane container query.
- The layout specification now records one 32px split-list workbench content line. Automations,
  Features & plugins, and Pull requests use that line for their title, first selection label, and
  search icon while preserving the collapsed-sidebar recovery-action exception.
- Pull requests now keeps refresh in its title/action row and renders view tabs, search, and author
  filtering in the dedicated list-control stack below it. Existing roles, state, names, and compact
  list/detail behavior are retained.
- At the plugin list's 24rem compact threshold, optical inter-tab spacing and the final tab's end
  padding keep every label inside the control width without restoring a horizontal scroller.
- Focused assertions protect the alignment-token classes, tab-label measurement hooks, compact
  end padding, title/control separation, and existing leading-action exception.
- The 2026-09-02 follow-up replaces Plugin Manager's asymmetric 8px/2px category padding and 2px
  compact gap with the existing 4px inline token for every tab and every adjacent gap. The 24rem
  container breakpoint continues to hide only numeric counts.

## Verification

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

Residual risk: verification used the isolated renderer with fixture data rather than launching
this worktree's native app because another worktree already owns the default desktop data directory.
Native window chrome was not re-exercised. The 48px titlebar and platform safe-area classes remain
unchanged, and their normal and recovery-action branches are covered by focused rendered assertions
plus the successful renderer build.

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
