---
id: "2026-09-01-floating-pr-inspector"
stage: verification
schema: 3
status: passed
owner: codex
created: 2026-09-01
based_on: plan.md
commit: ""
verification_mode: owner
verified_by: "codex owner verification"
verified_at: "2026-09-01"
release_target: none
release_identity: "not applicable until released."
---

# Verification: Promote the floating PR Inspector

## Automated checks

Verdict: verified.

### Acceptance evidence

- AC-1: PASS — `cd apps/desktop && bun test tests/githubPullRequestsRendered.test.tsx tests/uiLabRendered.test.tsx` completed with 10 passing tests and 85 expectations; live dark and light UI Lab inspection measured the production Inspector at a 12px top/right/bottom inset, 16px radius, token-derived shadow, intact `complementary` semantics, and working Review changes navigation.
- AC-2: PASS — `cd apps/desktop && bun test tests/githubPullRequestsRendered.test.tsx tests/uiLabRendered.test.tsx` protected the 960px/704px layout contract; live checks at 1280px, 920px, and 680px found no horizontal overflow, hid only the Inspector at 920px, and preserved the existing list-only compact state at 680px.
- AC-3: PASS — `rg -n "ui-lab-prototype-switcher|data-inspector-variant|PullRequestInspectorVariant|variant=overlay|variant=attached" apps/desktop/src apps/desktop/tests apps/desktop/layout-spec.json` returned no matches, while dark/light rendering exposed no prototype controls or variant query state.
- AC-4: PASS — `cd apps/desktop && bun test` completed with 799 passing tests, 0 failures, and 3,847 expectations; `bun run lint` and `bun run build:renderer` passed; `bun script/verify/docs.ts`, `bun script/verify/sdlc.ts`, `bun script/verify/sdlc.ts --worktree`, and `git diff --check` passed. Dark, light, medium, and narrow rendered inspection produced no relevant console warning or error.

Lock-screen-compatible native acceptance additionally launched the current packaged `C2-dev.app`
against a fresh isolated data directory. The native host stayed live, bound its expected local port,
and registered a 1176x784 `C2 Dev` main window with the macOS window server. Because macOS blocks
window capture while the desktop is locked, a same-host native `WKWebView` harness loaded the
permanent production-component fixture and used WebKit's own snapshot path. The harness advanced
only the decorative entrance animation to its normal completed state because hidden documents do
not tick that animation. At 1280x720 it verified and captured dark and light rendering with the
12px right inset, 16px radius, token-derived shadow, no overflow, and no error state; clicking
Review changes selected Changes and rendered the 30-file view. At 920x800 it verified and captured
the expected hidden Inspector with both list and detail panes remaining visible and no overflow.

Residual risk: the locked-machine pass separates native-shell startup from native-WebKit visual
and interaction rendering; it does not provide a pixel capture of the actual Electrobun window.
A signed-in native-shell GitHub session was also not exercised, so provider/auth integration remains
covered by existing automated behavior rather than this visual pass.

## Behavioral evidence

Verdict: verified.

### Acceptance evidence

- AC-1: PASS — `cd apps/desktop && bun test tests/githubPullRequestsRendered.test.tsx tests/uiLabRendered.test.tsx` completed with 10 passing tests and 85 expectations; live dark and light UI Lab inspection measured the production Inspector at a 12px top/right/bottom inset, 16px radius, token-derived shadow, intact `complementary` semantics, and working Review changes navigation.
- AC-2: PASS — `cd apps/desktop && bun test tests/githubPullRequestsRendered.test.tsx tests/uiLabRendered.test.tsx` protected the 960px/704px layout contract; live checks at 1280px, 920px, and 680px found no horizontal overflow, hid only the Inspector at 920px, and preserved the existing list-only compact state at 680px.
- AC-3: PASS — `rg -n "ui-lab-prototype-switcher|data-inspector-variant|PullRequestInspectorVariant|variant=overlay|variant=attached" apps/desktop/src apps/desktop/tests apps/desktop/layout-spec.json` returned no matches, while dark/light rendering exposed no prototype controls or variant query state.
- AC-4: PASS — `cd apps/desktop && bun test` completed with 799 passing tests, 0 failures, and 3,847 expectations; `bun run lint` and `bun run build:renderer` passed; `bun script/verify/docs.ts`, `bun script/verify/sdlc.ts`, `bun script/verify/sdlc.ts --worktree`, and `git diff --check` passed. Dark, light, medium, and narrow rendered inspection produced no relevant console warning or error.

Lock-screen-compatible native acceptance additionally launched the current packaged `C2-dev.app`
against a fresh isolated data directory. The native host stayed live, bound its expected local port,
and registered a 1176x784 `C2 Dev` main window with the macOS window server. Because macOS blocks
window capture while the desktop is locked, a same-host native `WKWebView` harness loaded the
permanent production-component fixture and used WebKit's own snapshot path. The harness advanced
only the decorative entrance animation to its normal completed state because hidden documents do
not tick that animation. At 1280x720 it verified and captured dark and light rendering with the
12px right inset, 16px radius, token-derived shadow, no overflow, and no error state; clicking
Review changes selected Changes and rendered the 30-file view. At 920x800 it verified and captured
the expected hidden Inspector with both list and detail panes remaining visible and no overflow.

Residual risk: the locked-machine pass separates native-shell startup from native-WebKit visual
and interaction rendering; it does not provide a pixel capture of the actual Electrobun window.
A signed-in native-shell GitHub session was also not exercised, so provider/auth integration remains
covered by existing automated behavior rather than this visual pass.

## Visual evidence

See bundle evidence/ when present.

## Security and privacy evidence

Not separately recorded unless present in legacy Verification.

## Deviations and residual risk

Residual risk: the locked-machine pass separates native-shell startup from native-WebKit visual

## Verdict

Verdict: verified..

## Review and release

Review handoff: [Draft PR #212](https://github.com/IchenDEV/codeTwo/pull/212).
Approval: implementation plus Draft PR delivery from the user's 2026-09-01 requests.
Release target: none.
Release identity: not applicable until released.
Smoke evidence: not applicable until released.
Rollback: revert this production floating-card change; no migration or remote cleanup is required.
No release: Draft PR delivery is authorized; merge and release are not authorized.

Preparing this section does not authorize merge, deployment, release, or production mutation.

## Feedback

No post-implementation feedback exists yet.
