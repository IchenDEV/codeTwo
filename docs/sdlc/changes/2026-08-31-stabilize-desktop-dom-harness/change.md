---
id: change-2026-08-31-stabilize-desktop-dom-harness
kind: change
schema: 2
status: executing
risk: low
owner: codex
approvers: [user]
approved_at: 2026-08-31
created: 2026-08-31
updated: 2026-08-31
source: user request to fix PR 198 CI on 2026-08-31
inputs: PR 198 Desktop design system failure logs, shared happy-dom test harness, Base UI ScrollArea contract
outputs: Web Animations API test compatibility and cross-platform desktop test evidence
scope: apps/desktop/tests/domTestHarness.ts, apps/desktop/tests/domTestHarness.test.ts, docs/sdlc/changes/2026-08-31-stabilize-desktop-dom-harness
next_trigger: PR 198 Desktop design system CI completes on all three platforms
verification_mode: owner
verified_by: pending
verified_at: pending
---

# Stabilize the desktop DOM test harness

## Intent

PR 198's Desktop design system workflow fails on Linux and macOS because Base UI ScrollArea asks
the shared happy-dom viewport for `getAnimations()`, an API the test DOM does not implement. The
same missing method causes otherwise unrelated rendered suites to fail depending on timer ordering.

This change is limited to test infrastructure. Production renderer behavior, dependencies, and
workflow runner versions remain unchanged.

## Spec

The shared DOM harness must expose the browser `Element.getAnimations()` shape required by Base UI.
Because happy-dom does not simulate Web Animations, the fallback returns an empty animation list.
The fallback must stay scoped to the harness-owned window and must not replace a native
implementation if happy-dom adds one later.

### Acceptance criteria

- [x] AC-1: A harness-owned element exposes `getAnimations()` and returns an empty animation list.
- [x] AC-2: The Bun 1.4.0 full desktop suite no longer reports
      `viewport.getAnimations is not a function`.
- [x] AC-3: The renderer build and repository lifecycle checks pass with clean diff hygiene.
- [ ] AC-4: PR 198's Desktop design system checks rerun successfully on Linux, macOS, and Windows.

## Decision and gates

The user's direct CI repair request accepts this low-risk test-infrastructure Intent. Pushing the
fix to the existing PR is authorized by that request. Merge, release, and deployment remain pending
separate Gates.

## Plan

1. Add a focused regression for the Web Animations method required by ScrollArea.
2. Add the smallest harness-owned compatibility implementation without touching production code.
3. Run the focused test, the Bun 1.4.0 full suite, renderer build, lifecycle checks, and PR CI.

Rollback removes the harness fallback and regression test. No product data or runtime behavior is
affected.

## Build

`domTestHarness` now defines `Element.getAnimations()` only when the harness-owned happy-dom window
does not provide it. The compatibility implementation returns an empty list, matching the
no-running-animation state Base UI's ScrollArea already handles. A focused test locks down the
exact method call and `{ subtree: true }` option that failed in CI. No production source or runner
configuration changed.

## Verification

Verdict: running.

### Acceptance evidence

- AC-1: PASS — `npx -y bun@1.4.0 test ./tests/domTestHarness.test.ts` first failed with
  `element.getAnimations is not a function`, then passed after the harness fallback.
- AC-2: PASS — `npx -y bun@1.4.0 test` passed 753 tests across 126 files with 0 failures and 3,569
  expectations; the pre-fix command reproduced 3 failures with the CI exception.
- AC-3: PASS — `bun run build:renderer` passed ESLint, Stylelint, TypeScript, and a 6,401-module
  Vite production build. `bun script/verify/sdlc.ts --worktree` and `git diff --check` passed.
- AC-4: PENDING.

`bun script/verify/docs.ts` still reports the 16 unclassified website evidence images already
present on `origin/main`; this change introduces no new documentation-catalog error.

Residual risk: remote runner timing still requires confirmation. The fallback deliberately models
the no-active-animation case only, which is appropriate for happy-dom's animation-free environment.

## Review and release

Review surface: [PR #198](https://github.com/IchenDEV/codeTwo/pull/198).
No release: merge, deployment, and release are not authorized.

Preparing this section does not authorize merge, deployment, release, or production mutation.

## Feedback

No post-review feedback exists yet. PR 198 CI is the next observation boundary.
