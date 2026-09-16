---
id: 2026-09-16-quiet-shell-chrome
schema: 5
stage: verification
status: passed
owner: chenli
created: 2026-09-16
based_on: plan.md
revision: "8d1f32d7 (origin/main) with the quiet-shell-chrome change applied"
verification_mode: owner
verified_by: chenli
verified_at: 2026-09-16
release_target: none
cleanup_status: complete
---

# Verification: Quiet the app shell chrome

## Verification

- AC-1: PASS — In the renderer (`bun run dev:renderer`, port 1420, 1728px) the toolbar computed `gap: 4px` with measured gaps `[4, 4]` across the environment, action and layout clusters, and the action group computed `gap: 4px` with measured `[4, 4]`; before the change the same points measured `16px`, `8px`, `8px` and a 17px trailing gap. `shellChromeContract` and the updated `windowChromeContract` assert the semantic gap and the absence of the container-query overrides.
- AC-2: PASS — `ProjectIcon` no longer emits `bg-foreground/[0.055]` or `ring-1`, asserted by `shellChromeContract`; the capture cannot show it because the empty shell has no selected project, and the settings picker and worktree list share the same component.
- AC-3: PASS — The checkout and pull-request badges render as `text-fine` inline meta with no `bg-fill-quiet`, `rounded-micro`, or `px-1`, and `sessionRailRendered` asserts that the title line and the workspace line share the same `data-session-content` parent, so removing the badge padding restores the title's text edge.
- AC-4: PASS — The compact composer renders the chips in the single control row: the footer computed `flex min-w-0 items-center gap-0.5 p-2`, and the measured row holds `+` at x=488, the plugin and scene/model chips at x=518–883, then the expand, voice and send controls at x=1144–1240 on one line (the 32px send control centres 2px above the 28px icons).
- AC-5: PASS — From `apps/desktop`: `bun run lint`, `bunx tsc --noEmit` (inside `build:renderer`), `bun test` (947 pass, 3 skip, 0 fail) and `bun run build:renderer`. Rendered captures `browser-artifacts/browser-screenshot-localhost-mu3u2676-4aa21431.png` and `browser-artifacts/browser-screenshot-localhost-mu3urkcu-a8e0e136.png` show the unified titlebar spacing and the single composer row.
- AC-6: PASS — The rail badge renders only the state icon and `#{pullRequest.number}`, with `pullRequestTone` carrying the state colour; `sessionRailRendered` asserts `#84` is visible while `Merged`/`CI failed` appear only in `title` and `aria-label`, and `shellChromeContract` asserts the source keeps the tone and the accessible words.
- AC-7: PASS — `shellChromeContract` asserts `App.tsx` no longer renders `session-header-project-icon`, no longer imports `ProjectIcon`, and `styles.css` no longer hides that mark; the rendered shell reports `headerHasProjectMark: false`.
- AC-8: PASS — `shellChromeContract` asserts the selected rail row keeps `bg-fill-selected` and no longer emits `before:inset-y-3`/`before:rounded-full`; the rendered rail test still passes with the fill as the only selection state.
- AC-9: PASS — In the renderer the checkout chip's label computed `oklch(0.49583 0.00272918 none)` (the muted foreground) instead of the former `text-foreground/85`, and `shellChromeContract` covers the source change for both chips.

Verdict: verified.
Residual risk: the rail rows, the project mark and the branch chip need session/project data that the
Core-less renderer does not have, so their evidence is structural plus the rendered rail/header
tests; the user's running dev window carries the same source for the visual check. The 4px toolbar
rhythm is now flat across every window width, and the narrow-window label collapse is unchanged. The
composer's chips can still wrap inside their own measure when the composer is narrow, by design. The
shared `selectable` button variant keeps its own leading mark for navigation rows; only the rail
session row lost it.

## Cleanup

Removed: the task-owned Vite dev server on port 1420 and its log at
`/var/folders/nl/47s4vtc92m74_j8pmm7d0chh0000gn/T/opencode/renderer-1420.log`, plus the ignored
`apps/desktop/dist/` renderer output from the build check.
Retained: the after screenshot in `/Users/chenli/.t3/userdata/browser-artifacts/` as AC-5 evidence,
and the user's running `C2-dev` window with its build output under `apps/desktop/build/` and the
Rust `target/` tree.
Retention owner: chenli.
Cleanup trigger: remove the screenshot with the next browser-artifact cleanup after review; the dev
window and its build output go when the user stops or restarts their instance.
Processes: the task-owned Vite server on port 1420 was stopped and
`lsof -nP -iTCP:1420 -sTCP:LISTEN` plus `pgrep -fl "vite --port 1420"` match nothing. The user's
`C2-dev` app (launcher 26364, app 26365, core 26368 on data dir `dev.codetwo.app.dev`) and the
installed `C2 Nightly` app were left untouched.
Evidence: `git status --porcelain` lists only the intended source and test files plus the record
bundle.

## Review and release

Approval: implementation and PR delivery were requested directly by the user (the annotated review
and the four follow-up marks); merge and release are not authorized.
Rollback: See plan.md.
Release: No release requested; merge and external actions require their own authorization.
Review: [PR #238](https://github.com/IchenDEV/codeTwo/pull/238) carries this change on branch
t3code/quiet-shell-chrome, based on main 833ecb8b; the hosted CI Validate job passed (run
35075609711, job 104727185571, 2m44s).
Feedback: Link an Incident and regression Eval when a real failure occurs.
