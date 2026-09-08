---
id: 2026-09-08-visual-coherence-standard
schema: 5
stage: verification
status: passed
owner: codex
created: 2026-09-08
based_on: plan.md
revision: "worktree based on 6a2884ce with prior visible UI remediation"
verification_mode: owner
verified_by: codex
verified_at: 2026-09-09
release_target: none
cleanup_status: complete
---

# Verification: Visual coherence standard

## Verification

- AC-1: PASS — `bun script/verify/docs.ts` and `bun script/verify/sdlc.ts --worktree` validate the root Design.md standard, linked component contract, scope and four-stage records. Design.md owns visual decisions; system.md owns implementation rules. Minimum 12px control radius and 24px composer radius are retained.
- AC-2: PASS — `bun test` includes the neutral state ladder and selection tests. Actual production Button/navigation/Input primitives were exercised through the in-app browser: light hover L=0.94732, selection L=0.909696, selected-hover L=0.879597; these remain distinct. Iris dark selection L=0.341943 and hover L=0.296559 remain distinct. Real mouse-down reported active=true, L=0.417583 and transform=none; mouse-up released it. Final keyboard focus reported a solid 2px foreground-colored outline with 2px offset, independent of hover. Disabled controls remain disabled. Native dark settings confirm the persistent selected marker remains visible over macOS vibrancy.
- AC-3: PASS — `bun test` includes typography, appearance and composer regressions. Browser measured prose 15px/24px and control radius 12px; saved native code preference remained 12px despite the new-install default changing to 13px. Native screenshots confirm clearer placeholder, aligned document/toolbar, flat surfaces and readable narrow layout. A test draft survived compact → expanded transitions and was then cleared without sending. Placeholder contrast calculated from actual computed colors was 5.61:1 for default light and 6.24:1 for Iris dark.
- AC-4: PASS — `bun test` includes the new resource expansion regression: first-use groups start collapsed, an explicit expansion survives remount. Existing saved resource state remained untouched in the native app. Native settings, light/dark and narrow screenshots confirm group headings, page insets and visible selection; shared session/navigation rows have a persistent current marker.
- AC-5: PASS — `./script/dev/run.sh --restart` completed the final native build with lint, TypeScript and Vite checks; `bun run lint:styles`, docs, SDLC and `git diff --check` pass. Full desktop suite: **900 pass, 3 skip, 0 fail**, 903 tests across 160 files. Temporary UI preview and draft were disposed; final process inventory confirms one Core owner.

Verdict: verified
Residual risk: Three pre-existing process integration tests remain skipped. Windows native rendering was not exercised; the earlier design-system Windows sign-off boundary remains. No real provider task, permission flow, remote operation or production deployment was triggered. Sampled palette contrast passes; arbitrary user-authored palettes still require their own contrast review.

### Evidence

- Final logs: `.codex/run/visual-coherence/full-tests-final.log`, `native-build-final.log`, `styles-final.log`, `format.log`; the scoped retest had 84 passes before final full-suite verification.
- Rendered evidence root: `/Users/chenli/.codex/visualizations/2026/09/08/01a08172-715c-73c3-8f1c-cb8fdd6f7ff4/visual-coherence/`.
- State evidence: `states-light-hover.png`, `states-light-selected-hover.png`, `states-dark-selected-hover.png`, `states-iris-dark.png`, `states-iris-pressed.png`, `states-keyboard-focus.png`, `states-iris-narrow.png`, `states-light-final.png`.
- Native evidence: `native-document-light.jpg`, `native-settings-light.jpg`, `native-document-dark-narrow.jpg`, `native-settings-dark-narrow.jpg`, `native-settings-dark-final.jpg`, `native-workspace-final.jpg`. Native narrow capture measured 938×750; browser narrow viewport was 900×720. Final native capture returned to 1152×768.
- `focus-final.json`, `light-final.json`, `contrast.json` hold sampled computed values and derived contrast ratios. Browser error/warn logs were empty at final inspection.
- Initial full suite exposed four old assertions expecting selection to equal hover; these were updated to the accepted independent selection roles. Initial native build caught two unformatted tests; final format/build passed. Visual QA also caught the inherited accent/50 focus rule and low separation over native sidebar vibrancy; final focus and selection markers address both.

## Cleanup

Removed: Test draft cleared; temporary browser tab 3 closed; renderer-only preview session 3386 stopped with Ctrl-C, port 1420 released. Removed the one-off update.py, superseded failed-suite/build/preview logs, and obsolete temporary window-restoration capture.
Retained: Source changes, Design.md, existing user data and dependencies, final development app, final validation logs and visual evidence. Previous visible-UI remediation changes are preserved.
Retention owner: codex / current visual-coherence change; the running development app is retained for the user's review.
Cleanup trigger: Stop the retained development instance when the user ends review or a later authorized rebuild replaces it; retain evidence until this diff is accepted or withdrawn. User data is not temporary cleanup material.
Processes: launcher 21517, runtime 21518 and Core 21520 are the single live development instance. No test shell or preview server remains. The original light theme, empty draft, no-scene selection, pet and window dimensions are restored.
Evidence: `git status --short`, `git diff --check`, `pgrep -fl 'C2-dev.app|codetwo-desktop-host'`, `lsof -nP -iTCP:1420 -iTCP:50000 -sTCP:LISTEN`, `sips -g pixelWidth -g pixelHeight` and `du -sh .codex/run/visual-coherence` inspected ownership and retained output. Scratch logs were approximately 600K before disposal.

## Review and release

Approval: Local implementation authorized by the user's request; final diff is ready for human review.
Rollback: See plan.md.
Release: Commit, push and PR creation authorized by the user’s “pr” in this conversation. Merge and release are not authorized.
Feedback: Scope and large-radius preference originate in this conversation; visual reference comparison was advisory, not claimed as exact Codex/ChatGPT sampling.
