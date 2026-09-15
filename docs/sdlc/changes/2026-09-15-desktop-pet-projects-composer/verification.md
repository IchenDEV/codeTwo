---
id: 2026-09-15-desktop-pet-projects-composer
schema: 5
stage: verification
status: passed
owner: chenli
created: 2026-09-15
based_on: plan.md
revision: "worktree t3code/4e8b2ec9 on 9de1ebb1"
verification_mode: owner
verified_by: chenli
verified_at: 2026-09-15
release_target: none
cleanup_status: complete
---

# Verification: Desktop pet, empty-project add, composer tone

## Verification

- AC-1: PASS — rendered `?pet-preview=1&pet-size=large` in the Vite renderer. `.codetwo-pet-mascot`
  and `.codetwo-pet-stage` measured 136×147.3 (was 32×32), and `.codex-pet` bottom = 796 inside the
  800px viewport, so the sprite is no longer clipped. Before the fix the 136×147 sprite overflowed a
  32px button and the lower frames fell outside the window. Evidence `pet-large-fixed.png`.
- AC-2: PASS — the mascot reports `electrobun-webkit-app-region-drag` = true and
  `electrobun-webkit-app-region-no-drag` = false in the rendered DOM, so `isAppRegionDrag` starts the
  move from the pet body. The top handle is retained. Native OS-level window move was not exercised
  (see residual risk).
- AC-3: PASS — with `projects: []` the rail renders "No projects yet. Add a directory to work in —
  sessions and git status follow it." and an "Add a project…" button; the new regression test
  `SessionRail empty projects` clicks it and observes `onAddProject` once. The "All projects" header
  also carries an add button. `App.tsx` wires both to `addProjectFolder`.
- AC-4: PASS — the compact `.composer-card` class is now `… rounded-composer bg-card shadow-surface
  duration-feedback ease-enter focus-within:shadow-raised transition-shadow …` and its background
  measured `oklch(0.984944 0.00012978)` (white-neutral, no accent). With the input focused, the
  computed `outline-style` was `none` (no black border) and `box-shadow` was
  `rgba(16, 24, 40, 0.08) 0px 4px 12px` (`--ds-elevation-raised`), so focus floats the card on the
  shared raised shadow. Evidence `composer-focus-shadow.png`. The accent-tinted draft was reverted.
- AC-5: PASS — affected suites `bun test tests/sessionRailRendered.test.tsx
  tests/composerGeometryContract.test.ts tests/pluginComponentPolicyContract.test.ts
  tests/petSettings.test.tsx tests/titlebarDoubleClick.test.ts` → **51 pass, 0 fail**. `bunx tsc
  --noEmit` clean. `bun run lint:styles` clean. Scoped `ultracite check` clean on all changed files.
  Full desktop suite: **902 pass, 3 skip, 0 fail**. `bun script/verify/sdlc.ts --worktree` and
  `bun script/verify/docs.ts` both pass.
- AC-6: PASS — CI run [34988233344](https://github.com/IchenDEV/codeTwo/actions/runs/34988233344)
  failed the "Desktop tests" step with `ENOENT crates/plugins/src/app/plugins/{engine,handoff}.rs`.
  The two suites now read `crates/core/src/plugins/app/plugins/{engine,handoff}.rs`; they pass
  locally (`7 pass` across both) and the full desktop suite is green (902 pass, 0 fail).

Verdict: verified
Residual risk: The Electrobun native window move for the pet body was verified only at the class
contract level; the actual OS-level drag was not exercised because the native app was not launched.
If a plain click on the draggable pet stops triggering the wave on macOS, split the drag region back
to a dedicated handle. The Composer now uses a raised shadow instead of the design-system neutral
focus outline (user request); keyboard focus remains visible through the shadow but no longer meets
the 2px-outline focus convention.

### Evidence

- Rendered: `.codex/run/2026-09-15-desktop-pet-projects-composer/pet-large-fixed.png`,
  `composer-focus-shadow.png`.
- Measured: pet mascot/stage 136×147, codex-pet bottom 796/800; mascot drag=true, no-drag=false;
  composer card background `oklch(0.984944 0.00012978)` (neutral); focused composer
  outline-style `none`, box-shadow `rgba(16, 24, 40, 0.08) 0px 4px 12px`.
- Commands: `bun test` (905), `bunx tsc --noEmit`, `bun run lint:styles`,
  `bunx ultracite check <changed files>`, `bun script/verify/sdlc.ts --worktree`,
  `bun script/verify/docs.ts`.

## Cleanup

Removed: the Vite renderer dev server (port 1420) was stopped after each verification pass and its
log removed; the browser preview tab was closed. The temporarily edited preview `localStorage`
(`codetwo.appearance.v1`, `codetwo.theme`, `codetwo.docMode`) was reset. The reverted
accent-composer screenshots were deleted because they no longer describe the diff. No native build,
Core process, or user data directory was created or replaced.
Retained: the two rendered screenshots under `.codex/run/2026-09-15-desktop-pet-projects-composer/`
(gitignored) for review; source changes and this change record.
Retention owner: chenli / this change record.
Cleanup trigger: delete the evidence directory when the diff is accepted or withdrawn.
Processes: none; no Core owner was started or stopped.
Evidence: `git status --short`, `lsof -nP -iTCP:1420 -sTCP:LISTEN` (empty after shutdown).

## Review and release

Approval: Local implementation authorized by the user's direct request; final diff is ready for
human review.
Rollback: See plan.md.
Release: No release requested; commit, push, merge and release need their own authorization.
Feedback: Link an Incident and regression Eval if the pet drag fails in the real app.
