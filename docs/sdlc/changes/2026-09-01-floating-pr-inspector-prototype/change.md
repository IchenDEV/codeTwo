---
id: change-2026-09-01-floating-pr-inspector-prototype
kind: change
schema: 2
status: verified
risk: low
owner: codex
approvers: user via the 2026-09-01 request to try the PR workspace's trailing Inspector as a floating panel
approved_at: 2026-09-01
created: 2026-09-01
updated: 2026-09-01
source: direct user visual-design feedback on the verified PR workspace and permanent UI Lab
inputs: verified PR workspace, deterministic UI Lab PR fixture, existing Inspector breakpoints, and CodeTwo design tokens
outputs: a development-only three-variant Inspector comparison with the floating card selected by default
scope: apps/desktop/src/design/ui-lab, apps/desktop/layout-spec.json, apps/desktop/tests/uiLabRendered.test.tsx, docs/sdlc/changes/2026-09-01-floating-pr-inspector-prototype
next_trigger: production promotion is tracked by change-2026-09-01-floating-pr-inspector
verification_mode: owner
verified_by: codex
verified_at: 2026-09-01
---

# Prototype a floating PR Inspector

## Intent

The verified PR workspace currently attaches its contextual Inspector directly to the primary
detail column. The user asked to try the trailing panel as a floating surface. The question is
visual and spatial: whether detaching the Inspector improves hierarchy without making PR content
feel obstructed or shrinking the primary review region too far.

The desired outcome is a reversible UI Lab comparison using the real `PullRequestsPage` and its
deterministic fixture. This change does not alter the production page, GitHub behavior, persisted
state, or remote data. It should make the requested floating direction the default comparison
while preserving the existing attached layout and a more aggressive overlay as references.

## Spec

The existing `?ui-lab=pull-requests` route accepts `variant=attached|floating|overlay` and defaults
to `floating`. Attached retains the production rail. Floating reserves its existing bounded width
but detaches it with a 12px inset, rounded surface, border, and elevation. Overlay gives the
primary region its full width and positions the Inspector above it for comparison. The production
960px Inspector collapse remains authoritative for all variants.

A development-only bottom switcher shows the current variant, cycles with buttons or left/right
arrow keys, writes selection into the URL, restores browser history, and does not intercept arrow
keys while a text field is focused. Theme and locale links preserve the selected variant.

### Acceptance criteria

- [x] AC-1: PR Workspace defaults to a visibly detached floating Inspector while attached and
      overlay variants remain reachable through stable URL state.
- [x] AC-2: The switcher exposes accessible named controls, click and keyboard cycling, browser
      history restoration, and preserves variant state across theme and locale links.
- [x] AC-3: Desktop dark/light and narrow rendered checks show no unintended clipping, overflow,
      framework overlay, or relevant console errors; the existing compact Inspector collapse is
      unchanged.
- [x] AC-4: Focused tests, renderer checks, documentation checks, SDLC checks, and whitespace
      checks pass without adding the prototype to production application behavior.

## Decision and gates

The user's direct request accepts this low-risk, development-only visual prototype for execution.
Codex owns implementation and owner verification. Selecting and promoting a production variant is
a later human design Gate. The prototype request alone did not authorize GitHub mutation; the
user's later `pr` request authorizes including this historical decision record in the verified
Draft PR scope, but does not authorize merge, release, deployment, or production mutation.

## Plan

1. Record the three comparison geometries and keep the current production collapse breakpoint.
2. Add URL-backed variant state and a development-only keyboard-accessible switcher to the
   existing PR Workspace fixture.
3. Style attached, floating, and overlay variants with current CodeTwo tokens and no production
   component fork.
4. Run focused checks and inspect desktop dark/light plus narrow behavior in the in-app browser.

Rollback removes this change bundle and the UI Lab-only variant code. Production components,
stored data, and remote services require no cleanup.

## Build

Added three URL-addressed Inspector layouts to the permanent development-only PR Workspace fixture.
The requested floating card is the default and reserves the production Inspector column while
adding a 12px inset, 16px radius, border, tokenized surface, and raised elevation. Attached remains
the production baseline; overlay deliberately gives the primary region the full width for a more
aggressive comparison.

Added a bottom comparison switcher using the shared Button component. Clicks and left/right arrow
keys update the visible variant and URL, browser history restores prior selection, text inputs keep
their arrow-key behavior, and theme/locale navigation preserves the variant. The production
component, GitHub bridge, and normal app routes are unchanged.

## Verification

Verdict: verified.

### Acceptance evidence

- AC-1: PASS — the in-app browser rendered `variant=attached`, `variant=floating`, and
  `variant=overlay` at 1440x900. Floating was the no-param default and measured a 244px-wide card
  inset 12px from the top, right, and bottom with a 16px radius and raised shadow.
- AC-2: PASS — browser flow `Next -> Back -> ArrowLeft` cycled C to B to A
  and restored B with the matching URL; theme navigation retained `variant=floating`. The focused
  `bun test tests/uiLabRendered.test.tsx` contract also passed six tests and 32 expectations.
- AC-3: PASS — browser viewport checks `1440x900 dark`, `1440x900 light`, and `680x860 light`
  rendered floating in both themes and the compact state. The narrow state hid the Inspector under
  the existing 960px rule. Every state kept body
  width equal to viewport width, contained meaningful DOM, showed no framework overlay, and had no
  console warnings or errors.
- AC-4: PASS — full `cd apps/desktop && bun test` passed 800 tests across 138 files with 3834
  expectations. `bun run build:renderer` passed ESLint, Stylelint, TypeScript, and Vite; exact
  prototype strings were absent from production output. Final docs, SDLC, worktree, and whitespace
  Gates passed.

The first verification attempt failed because the switcher used raw buttons, one shadow token did
not exist, and a full-suite assertion read a shared test window's URL. The correction adopted the
shared Button, the existing menu elevation token, and component-owned link state while retaining
real-browser URL proof; the complete rerun then passed.

Residual risk: this verifies a renderer-only deterministic fixture, not native WebView chrome or a
real authenticated GitHub session. The production PR Inspector remains attached until the user
selects a prototype variant.

## Review and release

Review handoff: [Draft PR #212](https://github.com/IchenDEV/codeTwo/pull/212).
Approval: comparison implementation, subsequent production selection, and Draft PR delivery were
authorized by the user's 2026-09-01 requests.
Release target: none.
Release identity: not applicable until released.
Smoke evidence: not applicable until released.
Rollback: remove the UI Lab-only prototype wrapper, styles, switcher, layout contract, tests, and this Artifact.
No release: the selected comparison is retained as historical decision evidence in the authorized
Draft PR; merge, deployment, and release remain unauthorized.

Preparing this section does not authorize merge, deployment, release, or production mutation.

## Feedback

The user selected the reserved floating-card variant and requested production implementation on
2026-09-01. Promotion and prototype cleanup are tracked in
[`change-2026-09-01-floating-pr-inspector`](../2026-09-01-floating-pr-inspector/change.md).
