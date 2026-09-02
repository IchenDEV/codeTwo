---
id: "2026-09-01-ui-lab"
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

# Verification: Add a permanent UI Lab and design-system demo catalog

## Automated checks

Verdict: verified.

The in-app browser inspected the development renderer at `http://127.0.0.1:1420/`. At 1440x900,
the dark catalog, light PR Workspace, and dark conversation-side PR Dock rendered without clipping
or horizontal overflow. Theme navigation changed the URL and removed the dark root state. Review
changes selected the production Changes tab and revealed the fixture file list; Dock Changes 30
rendered the expected added and removed diff lines. At 680x860, PR Workspace switched from list to
detail, PR Dock became a full-width panel, and Design System kept a visible UI Lab return link.
Every inspected state reported `body.scrollWidth == window.innerWidth` and no relevant browser
warnings or errors.

### Acceptance evidence

- AC-1: PASS — `tests/uiLabRendered.test.tsx` protects the catalog's five stable destinations,
  current-page semantics, layout contract, development gate, and legacy Design System alias;
  browser navigation loaded each canonical page with title `C2` and meaningful DOM content.
- AC-2: PASS — `cd apps/desktop && bun test tests/uiLabRendered.test.tsx` protects the production
  workspace/Dock composition and deterministic PR, task, current-branch, and diff fixtures.
  Browser interaction confirmed the resolved fixture data and production Changes views; the
  production Vite output contains none of the UI Lab or fixture strings.
- AC-3: PASS — `cd apps/desktop && bun test tests/uiLabRendered.test.tsx` confirmed dark/Chinese
  preview state while the saved light/English preferences remained byte-for-byte unchanged.
  Browser theme navigation confirmed URL-addressed light and dark states; Design System inherited
  the URL theme.
- AC-4: PASS — `cd apps/desktop && bun test tests/uiLabRendered.test.tsx
  tests/githubPullRequestsRendered.test.tsx tests/githubPullRequestPanelRendered.test.tsx`
  protects the semantic and interaction contracts. Browser DOM snapshots confirmed semantic
  landmarks and controls; screenshots covered dark/light at 1440x900 and compact PR, Dock, and
  Design System at 680x860 with no horizontal overflow or console errors.
- AC-5: PASS — full `bun test` passed 799 tests across 138 files with 3829 expectations and zero
  failures. `bun run build:renderer` completed ESLint, Stylelint, TypeScript, and Vite build. Final
  docs, SDLC, worktree, and whitespace Gates passed.

Residual risk: UI Lab is intentionally a renderer-only developer surface, so it does not validate
native WebView chrome or authenticated GitHub mutations. Those remote actions remain disabled by
the fixture API and covered by the existing production panel tests rather than executed against a
real repository.

## Behavioral evidence

Verdict: verified.

The in-app browser inspected the development renderer at `http://127.0.0.1:1420/`. At 1440x900,
the dark catalog, light PR Workspace, and dark conversation-side PR Dock rendered without clipping
or horizontal overflow. Theme navigation changed the URL and removed the dark root state. Review
changes selected the production Changes tab and revealed the fixture file list; Dock Changes 30
rendered the expected added and removed diff lines. At 680x860, PR Workspace switched from list to
detail, PR Dock became a full-width panel, and Design System kept a visible UI Lab return link.
Every inspected state reported `body.scrollWidth == window.innerWidth` and no relevant browser
warnings or errors.

### Acceptance evidence

- AC-1: PASS — `tests/uiLabRendered.test.tsx` protects the catalog's five stable destinations,
  current-page semantics, layout contract, development gate, and legacy Design System alias;
  browser navigation loaded each canonical page with title `C2` and meaningful DOM content.
- AC-2: PASS — `cd apps/desktop && bun test tests/uiLabRendered.test.tsx` protects the production
  workspace/Dock composition and deterministic PR, task, current-branch, and diff fixtures.
  Browser interaction confirmed the resolved fixture data and production Changes views; the
  production Vite output contains none of the UI Lab or fixture strings.
- AC-3: PASS — `cd apps/desktop && bun test tests/uiLabRendered.test.tsx` confirmed dark/Chinese
  preview state while the saved light/English preferences remained byte-for-byte unchanged.
  Browser theme navigation confirmed URL-addressed light and dark states; Design System inherited
  the URL theme.
- AC-4: PASS — `cd apps/desktop && bun test tests/uiLabRendered.test.tsx
  tests/githubPullRequestsRendered.test.tsx tests/githubPullRequestPanelRendered.test.tsx`
  protects the semantic and interaction contracts. Browser DOM snapshots confirmed semantic
  landmarks and controls; screenshots covered dark/light at 1440x900 and compact PR, Dock, and
  Design System at 680x860 with no horizontal overflow or console errors.
- AC-5: PASS — full `bun test` passed 799 tests across 138 files with 3829 expectations and zero
  failures. `bun run build:renderer` completed ESLint, Stylelint, TypeScript, and Vite build. Final
  docs, SDLC, worktree, and whitespace Gates passed.

Residual risk: UI Lab is intentionally a renderer-only developer surface, so it does not validate
native WebView chrome or authenticated GitHub mutations. Those remote actions remain disabled by
the fixture API and covered by the existing production panel tests rather than executed against a
real repository.

## Visual evidence

See bundle evidence/ when present.

## Security and privacy evidence

Not separately recorded unless present in legacy Verification.

## Deviations and residual risk

Residual risk: UI Lab is intentionally a renderer-only developer surface, so it does not validate

## Verdict

Verdict: verified..

## Review and release

Review handoff: [Draft PR #212](https://github.com/IchenDEV/codeTwo/pull/212).
Approval: implementation plus Draft PR delivery from the user's 2026-09-01 requests.
Release target: none.
Release identity: not applicable until released.
Smoke evidence: not applicable until released.
Rollback: revert this change; no migration or remote cleanup is required.
No release: this remains a development surface; Draft PR creation is authorized, while merge,
deployment, and release are not authorized.

Preparing this section does not authorize merge, deployment, release, or production mutation.

## Feedback

No post-implementation feedback exists yet.
