---
id: "2026-08-31-macos-titlebar-window-behavior"
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

# Verification: Preserve native macOS titlebar window behavior

## Automated checks

Verdict: verified.

The initial live C2 window ignored three double-clicks in an empty drag region while its native
Zoom action changed and restored the frame, isolating the missing custom-titlebar dispatch. Earlier
constructor-offset attempts were clamped by Electrobun and later reset by AppKit. The fixed native
position aligned the controls; the user then requested a 6 px leading adjustment, reviewed the
fresh `(28, 21)` packaged screenshot, and authorized the PR.

The first complete build after rebasing failed before compilation with `eslint: command not found`
because this worktree's installed packages predated the updated upstream lockfile. `bun install
--frozen-lockfile` installed the locked lint dependencies, and the unchanged build command then
passed lint, TypeScript, the 6,402-module Vite build, native helpers, and Electrobun packaging.

PR #194's first hosted run failed because `main.tsx` imported two Electrobun implementation
modules directly and because the latest `main` added eight referenced change-evidence screenshots
without a matching catalog class. After rebasing, `bun test
apps/desktop/tests/containerBoundary.test.ts` and `bun script/verify/docs.ts` reproduced those exact
failures locally. Routing installation through `container.ts` and adding the `change-evidence`
classification made both loops pass. The full suite then exposed one stale source-contract
assertion for the former direct import; updating it to assert the new container route restored the
complete test suite.

### Acceptance evidence

- AC-1: PASS — `bun test apps/desktop/tests/titlebarDoubleClick.test.ts apps/desktop/tests/nativeTitlebarDoubleClick.test.ts apps/desktop/tests/windowChromeContract.test.ts`; live packaged C2 changed from 1152×768 to 1188×768 and restored to 1152×768 through the titlebar action.
- AC-2: PASS — `bun test apps/desktop/tests/titlebarDoubleClick.test.ts apps/desktop/tests/windowChromeContract.test.ts` dispatches only from draggable, noninteractive content and verifies the desktop-pet exclusion.
- AC-3: PASS — `bun test apps/desktop/tests/nativeTitlebarDoubleClick.test.ts apps/desktop/tests/windowChromeContract.test.ts` compiles and runs the production AppKit harness for None, Fill/restore, Zoom, Minimize, and unknown values while preserving the missing-preference fallback.
- AC-4: PASS — `bun test apps/desktop/tests/windowChromeContract.test.ts`; the packaged host contains exactly two literal `(28, 21)` calls and no geometry measurement, and the fresh user-reviewed C2 screenshot shows the native group centered in the shared titlebar with the adjusted leading inset.
- AC-5: PASS — the focused suite, full `bun run build` desktop package, `bun script/verify/docs.ts`, `bun script/verify/sdlc.ts`, `bun script/verify/sdlc.ts --worktree`, and `git diff --check` pass on the rebased branch.
- AC-6: PASS — local equivalents pass (`bun test` reports 760 passing tests and no failures;
  `cd apps/desktop && bun run build` passes lint, TypeScript, the 6,402-module Vite build, native
  helpers, and Electrobun packaging). [GitHub Actions run
  33331964839](https://github.com/IchenDEV/codeTwo/actions/runs/33331964839) passed the combined
  validate job plus macOS and Windows cross-platform jobs; the separate documentation/SDLC
  [validate run 33331964999](https://github.com/IchenDEV/codeTwo/actions/runs/33331964999) also
  passed.

Residual risk: the live machine exercised the current Zoom fallback. Minimize, Fill, None, and
unknown preference values are verified in the production AppKit harness rather than by changing
the user's system preference. Native traffic-light artwork and diameter remain AppKit-owned.

## Behavioral evidence

Verdict: verified.

The initial live C2 window ignored three double-clicks in an empty drag region while its native
Zoom action changed and restored the frame, isolating the missing custom-titlebar dispatch. Earlier
constructor-offset attempts were clamped by Electrobun and later reset by AppKit. The fixed native
position aligned the controls; the user then requested a 6 px leading adjustment, reviewed the
fresh `(28, 21)` packaged screenshot, and authorized the PR.

The first complete build after rebasing failed before compilation with `eslint: command not found`
because this worktree's installed packages predated the updated upstream lockfile. `bun install
--frozen-lockfile` installed the locked lint dependencies, and the unchanged build command then
passed lint, TypeScript, the 6,402-module Vite build, native helpers, and Electrobun packaging.

PR #194's first hosted run failed because `main.tsx` imported two Electrobun implementation
modules directly and because the latest `main` added eight referenced change-evidence screenshots
without a matching catalog class. After rebasing, `bun test
apps/desktop/tests/containerBoundary.test.ts` and `bun script/verify/docs.ts` reproduced those exact
failures locally. Routing installation through `container.ts` and adding the `change-evidence`
classification made both loops pass. The full suite then exposed one stale source-contract
assertion for the former direct import; updating it to assert the new container route restored the
complete test suite.

### Acceptance evidence

- AC-1: PASS — `bun test apps/desktop/tests/titlebarDoubleClick.test.ts apps/desktop/tests/nativeTitlebarDoubleClick.test.ts apps/desktop/tests/windowChromeContract.test.ts`; live packaged C2 changed from 1152×768 to 1188×768 and restored to 1152×768 through the titlebar action.
- AC-2: PASS — `bun test apps/desktop/tests/titlebarDoubleClick.test.ts apps/desktop/tests/windowChromeContract.test.ts` dispatches only from draggable, noninteractive content and verifies the desktop-pet exclusion.
- AC-3: PASS — `bun test apps/desktop/tests/nativeTitlebarDoubleClick.test.ts apps/desktop/tests/windowChromeContract.test.ts` compiles and runs the production AppKit harness for None, Fill/restore, Zoom, Minimize, and unknown values while preserving the missing-preference fallback.
- AC-4: PASS — `bun test apps/desktop/tests/windowChromeContract.test.ts`; the packaged host contains exactly two literal `(28, 21)` calls and no geometry measurement, and the fresh user-reviewed C2 screenshot shows the native group centered in the shared titlebar with the adjusted leading inset.
- AC-5: PASS — the focused suite, full `bun run build` desktop package, `bun script/verify/docs.ts`, `bun script/verify/sdlc.ts`, `bun script/verify/sdlc.ts --worktree`, and `git diff --check` pass on the rebased branch.
- AC-6: PASS — local equivalents pass (`bun test` reports 760 passing tests and no failures;
  `cd apps/desktop && bun run build` passes lint, TypeScript, the 6,402-module Vite build, native
  helpers, and Electrobun packaging). [GitHub Actions run
  33331964839](https://github.com/IchenDEV/codeTwo/actions/runs/33331964839) passed the combined
  validate job plus macOS and Windows cross-platform jobs; the separate documentation/SDLC
  [validate run 33331964999](https://github.com/IchenDEV/codeTwo/actions/runs/33331964999) also
  passed.

Residual risk: the live machine exercised the current Zoom fallback. Minimize, Fill, None, and
unknown preference values are verified in the production AppKit harness rather than by changing
the user's system preference. Native traffic-light artwork and diameter remain AppKit-owned.

## Visual evidence

See bundle evidence/ when present.

## Security and privacy evidence

Not separately recorded unless present in legacy Verification.

## Deviations and residual risk

Residual risk: the live machine exercised the current Zoom fallback. Minimize, Fill, None, and

## Verdict

Verdict: verified..

## Review and release

Approval: the user authorized opening a pull request on 2026-08-31; merge remains pending.
Review surface: [PR #194](https://github.com/IchenDEV/codeTwo/pull/194).
Release target: none requested.
Release identity: not applicable until released.
Smoke evidence: not applicable until released.
Rollback: revert the scoped PR commit.
No release: no merge, package publication, deployment, or versioned release was requested.

## Feedback

The user requested the final 6 px rightward adjustment, reviewed the resulting packaged screenshot,
and asked for a PR. No post-merge feedback exists.
