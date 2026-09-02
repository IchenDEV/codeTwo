---
id: "2026-09-01-floating-pr-inspector-prototype"
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

# Verification: Prototype a floating PR Inspector

## Automated checks

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

## Behavioral evidence

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

## Visual evidence

See bundle evidence/ when present.

## Security and privacy evidence

Not separately recorded unless present in legacy Verification.

## Deviations and residual risk

Residual risk: this verifies a renderer-only deterministic fixture, not native WebView chrome or a

## Verdict

Verdict: verified..

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
[`change-2026-09-01-floating-pr-inspector`](../2026-09-01-floating-pr-inspector/intent.md).
