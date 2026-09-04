---
id: "2026-08-31-codex-appearance-controls"
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
release_target: none
release_identity: "not applicable until released."
---

# Verification: Complete the Codex-aligned Appearance controls

## Automated checks

Verdict: verified.

Browser inspection used the in-app Browser against the renderer at `http://localhost:1421/`.
Appearance rendered correctly in light and dark modes and at a narrow 820x900 viewport, with no
horizontal overflow, framework overlay, or console warning/error. Real interaction showed the
active dark font weight applying as 500 while light remained 400, pointer cursor switching between
`pointer` and `default`, and explicit motion switching transition duration from `0.12s` to
`0.00001s`. Restore defaults returned pointer, motion, diff mode, weight, and opacity to their
documented values.

### Acceptance evidence

- AC-1: PASS — `cd apps/desktop && bun test tests/appearanceSettings.test.tsx` proves independent
  persistence and runtime application; rendered interaction confirmed dark weight 500 while light
  stayed 400 when switching schemes.
- AC-2: PASS — `cd apps/desktop && bun test tests/appearanceSettings.test.tsx` covers every root
  preference value; rendered interaction confirmed pointer and motion changes, while scoped CSS
  preserves text, drag, resize, and disabled cursors.
- AC-3: PASS — `cd apps/desktop && bun test tests/gitState.test.ts` and
  `bun test tests/githubPullRequestPanelRendered.test.tsx` assert separate visible markers,
  content, and added/removed accessible labels; both modes are selected from the shared root state.
- AC-4: PASS — `cd apps/desktop && bun test tests/appearanceSettings.test.tsx` covers version-1/2
  migration, defaults, persisted profiles, and existing theme data; `cd apps/desktop && bun test`
  passed 794 tests in 137 files with 3,783 expectations.
- AC-5: PASS — `bunx tsc --noEmit`, `bun run lint`, and `bun run build:renderer` passed; Browser
  light/dark/narrow inspection passed; `bun script/verify/docs.ts`, `bun script/verify/sdlc.ts`, and
  `bun script/verify/sdlc.ts --worktree` passed.

Residual risk: the preference state applies within the renderer process; a future native Dock-icon
picker still requires approved alternate artwork and a supported runtime integration. The existing
Vite large-chunk warning and React test `act(...)` notices remain pre-existing, non-failing signals.

## Behavioral evidence

Verdict: verified.

Browser inspection used the in-app Browser against the renderer at `http://localhost:1421/`.
Appearance rendered correctly in light and dark modes and at a narrow 820x900 viewport, with no
horizontal overflow, framework overlay, or console warning/error. Real interaction showed the
active dark font weight applying as 500 while light remained 400, pointer cursor switching between
`pointer` and `default`, and explicit motion switching transition duration from `0.12s` to
`0.00001s`. Restore defaults returned pointer, motion, diff mode, weight, and opacity to their
documented values.

### Acceptance evidence

- AC-1: PASS — `cd apps/desktop && bun test tests/appearanceSettings.test.tsx` proves independent
  persistence and runtime application; rendered interaction confirmed dark weight 500 while light
  stayed 400 when switching schemes.
- AC-2: PASS — `cd apps/desktop && bun test tests/appearanceSettings.test.tsx` covers every root
  preference value; rendered interaction confirmed pointer and motion changes, while scoped CSS
  preserves text, drag, resize, and disabled cursors.
- AC-3: PASS — `cd apps/desktop && bun test tests/gitState.test.ts` and
  `bun test tests/githubPullRequestPanelRendered.test.tsx` assert separate visible markers,
  content, and added/removed accessible labels; both modes are selected from the shared root state.
- AC-4: PASS — `cd apps/desktop && bun test tests/appearanceSettings.test.tsx` covers version-1/2
  migration, defaults, persisted profiles, and existing theme data; `cd apps/desktop && bun test`
  passed 794 tests in 137 files with 3,783 expectations.
- AC-5: PASS — `bunx tsc --noEmit`, `bun run lint`, and `bun run build:renderer` passed; Browser
  light/dark/narrow inspection passed; `bun script/verify/docs.ts`, `bun script/verify/sdlc.ts`, and
  `bun script/verify/sdlc.ts --worktree` passed.

Residual risk: the preference state applies within the renderer process; a future native Dock-icon
picker still requires approved alternate artwork and a supported runtime integration. The existing
Vite large-chunk warning and React test `act(...)` notices remain pre-existing, non-failing signals.

## Visual evidence

See bundle evidence/ when present.

## Security and privacy evidence

Not separately recorded unless present in legacy Verification.

## Deviations and residual risk

Residual risk: the preference state applies within the renderer process; a future native Dock-icon

## Verdict

Verdict: verified..

## Review and release

Review handoff: [Draft PR #207](https://github.com/IchenDEV/codeTwo/pull/207).
Approval: [user] approved on 2026-08-31. human review of the verified Appearance page.
Release target: none.
Release identity: not applicable until released.
Smoke evidence: not applicable until released.
Rollback: revert this change's appearance model, controls, presentation styles, tests, and Artifact.
No release: no merge, release, or deployment was requested.

Preparing this section does not authorize merge, deployment, release, or production mutation.

## Feedback

No post-implementation feedback exists yet.
