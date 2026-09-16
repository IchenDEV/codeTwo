---
id: 2026-09-16-unify-settings-page-rhythm
schema: 5
stage: verification
status: passed
owner: chenli
created: 2026-09-16
based_on: plan.md
revision: "8d1f32d7 worktree baseline with the uncommitted change applied"
verification_mode: owner
verified_by: chenli
verified_at: 2026-09-16
release_target: none
cleanup_status: complete
---

# Verification: Unify the settings page rhythm

## Verification

- AC-1: PASS — In the real renderer (`bun run dev:renderer --port 1420`, no Core) Appearance, Profile, Worktrees, Memory, Usage and Pets each measured `.settings-page` at `768px` (`getComputedStyle().maxWidth` and `getBoundingClientRect().width`); `settingsRhythmContract` and `settingsLayoutContract` assert the two width overrides are gone.
- AC-2: PASS — The UI Lab settings scenario rendered 6 `[data-slot="settings-section"]` nodes with every title at `14px/600`, a 32px section gap and a 12px heading-to-content inset, matching `GroupHeading` and the 20px/600 `PageHeader`; `settingsRhythmContract` asserts the six `headingId`s survive, the removed `appearance-section*` rules stay gone and both shared headings carry the same weight class, and `appearanceSettings.test.tsx` mounts the real component.
- AC-3: PASS — The Memory tab rendered "Global defaults" and "Project overrides" at `14px/600`; `settingsRhythmContract` asserts the four `GroupHeading` call sites and the absence of the local 12/600 `h2`/`h3` rules.
- AC-4: PASS — The Usage tab rendered a `20px` page-header title with description and actions; `settingsRhythmContract` asserts no hand-rolled page-title `h1` remains in `usage/Usage.tsx`.
- AC-5: PASS — `settingsRhythmContract` extracts each module rule block and asserts the `--ds-color-surface` background with no `fill-quiet`, plus the memory column hairline.
- AC-6: PASS — `settingsRhythmContract` compares the `sm` and `compact` size entries in `button.tsx`; the diff makes them byte-identical.
- AC-7: PASS — From `apps/desktop`: `bun run lint`, `bunx tsc --noEmit`, `bun test` (940 pass, 3 skip, 0 fail) and `bun run build:renderer`; rendered captures `browser-artifacts/browser-screenshot-localhost-mu3sfuce-db2d19b2.png` (light) and `browser-artifacts/browser-screenshot-localhost-mu3sg191-b8d2a6be.png` (dark), plus the per-tab measurements above.

Verification finding: the first rendered pass showed `SettingsSection` titles at weight 500 against `GroupHeading`/`PageHeader` at 600 — one heading role with two weights. The shared section title moved to the 600 weight and both AC-2 and AC-7 were re-rendered and re-run on the corrected revision.

Verdict: verified.
Residual risk: the full-window captures ran against the Core-less empty shell, so populated row
content was not exercised; Profile keeps its identity hero (no `PageHeader` title, recorded design
variation) and its card labels stay at 14/400 and 12/500; the `--ds-font-weight-*` tokens are still
not bridged to Tailwind utilities, so shared headings name Tailwind's `font-semibold` rather than the
token; the dense `xs` button variant, the remaining legacy type aliases, and the legacy colour
variables in `memory-settings.css` are later records in the agreed order.

## Cleanup

Removed: `apps/desktop/dist/` (48 MB renderer build output created by the AC-7 build), the
task-owned `.codex/run/2026-09-16-unify-settings-page-rhythm/renderer.log` root, and the four
superseded screenshots from the first rendered pass.
Retained: two browser screenshots in `/Users/chenli/.t3/userdata/browser-artifacts/` referenced as
AC-7 evidence.
Retention owner: chenli.
Cleanup trigger: remove with the next browser-artifact cleanup after review.
Processes: the task-owned Vite dev server (pid 66134 on port 1420, then pid 18215 on port 1431, the
latter chosen because another worktree's server already owned 1420 and was left untouched) was
stopped; `lsof -nP -iTCP:1431 -sTCP:LISTEN` and `pgrep -fl "vite --port 1431"` match nothing.
Evidence: `git status --porcelain` shows only the intended 12 modified files, the new contract test
and this record bundle; `du -sh apps/desktop/dist` reported 48M before removal.

## Review and release

Approval: implementation and PR delivery were requested directly by the user (开始按照顺序打勾修复,
then pr); merge and release are not authorized.
Rollback: See plan.md.
Release: No release requested; merge and external actions require their own authorization.
Review: [PR #236](https://github.com/IchenDEV/codeTwo/pull/236) carries this change on branch
t3code/cube-computer-ui-cleanup-study; the hosted CI Validate job passed (run 35070958654, job
104712090561, 2m38s).
Feedback: Link an Incident and regression Eval when a real failure occurs.
