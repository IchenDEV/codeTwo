---
id: "2026-09-04-pane-window-motion"
stage: verification
schema: 3
status: passed
owner: kimi
created: "2026-09-04"
based_on: plan.md
commit: ""
verification_mode: owner
verified_by: "kimi"
verified_at: "2026-09-04"
release_target: none
release_identity: ""
---

# Verification: Pane Window Motion

## Automated checks

- AC-4: PASS — `bun test tests/paneTiles.test.tsx tests/appearanceSettings.test.tsx tests/paneChrome.test.tsx`
  passed 20 tests; the full desktop `bun test` passed 812 tests and 3,869 expectations;
  `bun run build:renderer` completed ESLint, Stylelint, `tsc --noEmit`, and the Vite build.
- Repository Gates: `bun script/verify/docs.ts`, `bun script/verify/sdlc.ts`, and
  `bun script/verify/sdlc.ts --worktree` all pass.

## Behavioral evidence

- AC-1: PASS — rendered-browser `requestAnimationFrame` sampling against `getBoundingClientRect`
  during Split down showed `pane-1` interpolating 250 → 170 → 138 → 128 → 125 px across ~280ms on
  the standard ease-out curve; computed style on every pane was `left, top, width, height` at
  `0.28s` with `cubic-bezier(0.16, 1, 0.3, 1)`, and the new pane kept `data-pane-entrance`.
- AC-2: PASS — `bun test tests/appearanceSettings.test.tsx` covers `windowMotion` normalization
  (default `"smooth"`, invalid values rejected), `data-window-motion` application, and localStorage
  persistence; rendered-browser inspection showed default `data-window-motion="smooth"` computing
  `--ds-motion-pane` to `280ms`, Fast switching to `160ms`, Instant to `0ms`, and Reduce motion →
  On collapsing the token to `0ms` even with Smooth selected.
- AC-3: PASS — during a pointer drag the document carried `body.resizing-h`, the pane's computed
  `transition-duration` was `0s`, and the pane width tracked the pointer (656 → 699 px); a focused
  divider's ArrowRight keydown interpolated 699 → 685 → 676 → 673 px with no body class, proving
  keyboard steps glide.

## Visual evidence

Captured from the rendered window and referenced here:
[light wide](evidence/tiled-light-wide.png), [dark wide](evidence/tiled-dark-wide.png),
[dark narrow](evidence/tiled-dark-narrow.png) tiled states, and the
[Appearance Window motion row](evidence/appearance-window-motion.png). The browser console held no
errors, only Vite reconnect logs after a dev-server restart.

## Security and privacy evidence

No new network, storage, or permission surface; the preference is one validated enum field inside
the existing localStorage appearance document.

## Deviations and residual risk

Residual risk: geometry transitions animate layout properties on a handful of absolutely
positioned panes, which is cheap at this pane count but is not compositor-only; terminal reflow
during a glide was verified in the renderer-only Vite server, not against a live Core-backed
desktop session.

## Verdict

Verdict: verified.

## Review and release

Approval: [PR #224](https://github.com/IchenDEV/codeTwo/pull/224) created by user authorization;
merge pending human review.
Release target: none.
Release identity: not applicable until released.
Smoke evidence: not applicable until released.
Rollback: revert the branch; no data or persisted-state changes are involved.
No release: PR creation is authorized; merge, deployment, and release remain unauthorized.

## Feedback

The reference video is the accepted scope indicator; CI on the first push caught the schema-2
artifact after `main` adopted schema-3, and the bundle was rewritten into stage files in response.
