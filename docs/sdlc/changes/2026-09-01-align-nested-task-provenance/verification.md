---
id: "2026-09-01-align-nested-task-provenance"
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

# Verification: Align nested Task provenance

## Automated checks

Verdict: verified

AC-13 passed its rendered regression, full desktop suite, repository checks, and native rebuild.

### Acceptance evidence

- AC-1: PASS — `bun test tests/sessionRailRendered.test.tsx` passed 28 tests and 255
  expectations after first failing on the old third-line placement. The regression locates `1h`
  and the checkout badge inside the summary line and requires no workspace line.
- AC-2: PASS — the same `bun test tests/sessionRailRendered.test.tsx` run verifies an ungrouped Task
  still renders its workspace name and checkout badge on a three-line row.
- AC-3: PASS — `bun test tests/sessionRailRendered.test.tsx` retains checkout/worktree and
  merged/CI-failed badges through the existing async pull-request fixtures
  on the dedicated provenance line.
- AC-4: PASS — `bun test` passed 846 tests and 5,043 expectations. The Electrobun watcher passed
  ESLint, Stylelint, TypeScript, Vite build, native packaging, and relaunch. `Browser QA` confirmed
  the renderer was nonblank with no framework overlay or console warnings/errors and exercised a
  dropdown. The rebuilt native window rendered the actual grouped rows as `preview · 1h · 普通` on
  one line; collapsing and expanding `codeTwo` remained functional. Repository Gate commands pass.
- AC-5: PASS — the user's follow-up crop disproved the prior `ml-2` assumption: it aligned the
  grouped card edge rather than the Task title. The corrected regression first failed against that
  8px offset, then `bun test tests/sessionRailRendered.test.tsx` passed 28 tests and 259 expectations
  with `ml-0`. In the rebuilt 301px native sidebar, the top-level and grouped Task titles now share
  the same horizontal start, including while the grouped row exposes all hover actions.
- AC-6: PASS — the focused rendered test requires `gap-2` on the title row. Native hover QA on both
  a pinned Task and a grouped `codeTwo` Task showed all four right-aligned actions without title
  overlap; the Browser renderer reloaded without errors and Task Board navigation remained live.
- AC-7: PASS — the focused regression first failed on the old `Provider → preview → age → checkout`
  order, then `bun test tests/sessionRailRendered.test.tsx` passed 28 tests and 260 expectations with
  `preview → Provider → age → checkout`. The rebuilt 301px native sidebar shows preview text starting
  below the title while Provider, time, and checkout occupy the trailing metadata rail. Browser QA
  loaded the renderer and exercised Task Board navigation successfully.
- AC-8: PASS — `bun test tests/desktopPerformanceContract.test.ts` first failed because the active-row
  paint override was absent, then passed 5 tests and 39 expectations after adding it. The rebuilt
  native window repeated `scroll → select third codeTwo Session` and kept `hi`, its reply preview,
  Provider, age, and checkout visible inside the active card. Browser QA found the active paint rule
  in the loaded stylesheet, reported no warning/error logs, and completed Task Board navigation.
  The final Electrobun package also contains the override before its native-window replay passed.
- AC-9: PASS — `bun test tests/sessionRailRendered.test.tsx` first failed against the inherited
  ghost-button hover, then passed 28 tests and 263 expectations
  after making the disclosure trigger transparent in light and dark schemes. The existing watcher
  passed lint, type-check, Vite production build, native packaging, and relaunched C2. In the real
  light native window, moving keyboard focus away while leaving the pointer on `codeTwo` removed the
  blue inner highlight and retained only the parent row's neutral hover surface. Browser smoke QA
  loaded Task Board, exercised its navigation, and reported no warning/error logs. `bun test` passed
  846 tests and 5,053 expectations.
- AC-10: PASS — `bun test tests/sessionRailRendered.test.tsx` requires both the grouped row and its
  Project content container to remain free of whole-row margin, preserving the full-width hover and
  selected surfaces.
- AC-11: PASS — `bun test tests/sessionRailRendered.test.tsx` keeps the Project trigger and grouped
  Task row on matching `px-2` containers without moving the row surface. The user's populated native
  screenshot then refined this from box alignment to optical alignment.
- AC-12: PASS — `bun test tests/sessionRailRendered.test.tsx` first failed twice because grouped Task
  content retained `pl-2` while the top-level Task had no optical inset, then passed 28 tests and 272
  expectations with the same `pl-1.5` on both. Neither uses `pl-2` or `pl-6`, and the row surfaces
  remain unmoved. `bun test` passed all 846 tests and 5,060 expectations. The existing Electrobun
  watcher passed lint, type-check, Vite production build, native packaging, and relaunched C2 on
  port 50000.
- AC-13: PASS — `bun test tests/sessionRailRendered.test.tsx` first failed against the empty
  Project placeholder's old `px-2`, then passed 29 tests and 276 expectations after changing only
  that copy to `pl-8 pr-2`. Existing Task content and row surfaces were not changed. `bun test`
  passed all 847 tests and 5,063 expectations; `git diff --check` passed. The existing Electrobun
  watcher completed lint, type-check, Vite production build, native packaging, and relaunched C2
  on port 50000.

Residual risk: pull-request badges remain on a third line by design; title, action, summary, and
active-row painting were verified at the current 301px sidebar width but not at every intermediate.
The neutral Project hover was visually replayed in the light native window; its dark-scheme override
is covered by the rendered class regression rather than a populated native dark-mode Project row.
The rebuilt native window currently showed its resource-injected recent-session state rather than a
populated Project tree, so AC-12 and AC-13's exact hierarchy is covered by the rendered DOM contract
and packaged bundle inspection; the supplied populated state remains the final visual acceptance
surface.

## Behavioral evidence

Verdict: verified

AC-13 passed its rendered regression, full desktop suite, repository checks, and native rebuild.

### Acceptance evidence

- AC-1: PASS — `bun test tests/sessionRailRendered.test.tsx` passed 28 tests and 255
  expectations after first failing on the old third-line placement. The regression locates `1h`
  and the checkout badge inside the summary line and requires no workspace line.
- AC-2: PASS — the same `bun test tests/sessionRailRendered.test.tsx` run verifies an ungrouped Task
  still renders its workspace name and checkout badge on a three-line row.
- AC-3: PASS — `bun test tests/sessionRailRendered.test.tsx` retains checkout/worktree and
  merged/CI-failed badges through the existing async pull-request fixtures
  on the dedicated provenance line.
- AC-4: PASS — `bun test` passed 846 tests and 5,043 expectations. The Electrobun watcher passed
  ESLint, Stylelint, TypeScript, Vite build, native packaging, and relaunch. `Browser QA` confirmed
  the renderer was nonblank with no framework overlay or console warnings/errors and exercised a
  dropdown. The rebuilt native window rendered the actual grouped rows as `preview · 1h · 普通` on
  one line; collapsing and expanding `codeTwo` remained functional. Repository Gate commands pass.
- AC-5: PASS — the user's follow-up crop disproved the prior `ml-2` assumption: it aligned the
  grouped card edge rather than the Task title. The corrected regression first failed against that
  8px offset, then `bun test tests/sessionRailRendered.test.tsx` passed 28 tests and 259 expectations
  with `ml-0`. In the rebuilt 301px native sidebar, the top-level and grouped Task titles now share
  the same horizontal start, including while the grouped row exposes all hover actions.
- AC-6: PASS — the focused rendered test requires `gap-2` on the title row. Native hover QA on both
  a pinned Task and a grouped `codeTwo` Task showed all four right-aligned actions without title
  overlap; the Browser renderer reloaded without errors and Task Board navigation remained live.
- AC-7: PASS — the focused regression first failed on the old `Provider → preview → age → checkout`
  order, then `bun test tests/sessionRailRendered.test.tsx` passed 28 tests and 260 expectations with
  `preview → Provider → age → checkout`. The rebuilt 301px native sidebar shows preview text starting
  below the title while Provider, time, and checkout occupy the trailing metadata rail. Browser QA
  loaded the renderer and exercised Task Board navigation successfully.
- AC-8: PASS — `bun test tests/desktopPerformanceContract.test.ts` first failed because the active-row
  paint override was absent, then passed 5 tests and 39 expectations after adding it. The rebuilt
  native window repeated `scroll → select third codeTwo Session` and kept `hi`, its reply preview,
  Provider, age, and checkout visible inside the active card. Browser QA found the active paint rule
  in the loaded stylesheet, reported no warning/error logs, and completed Task Board navigation.
  The final Electrobun package also contains the override before its native-window replay passed.
- AC-9: PASS — `bun test tests/sessionRailRendered.test.tsx` first failed against the inherited
  ghost-button hover, then passed 28 tests and 263 expectations
  after making the disclosure trigger transparent in light and dark schemes. The existing watcher
  passed lint, type-check, Vite production build, native packaging, and relaunched C2. In the real
  light native window, moving keyboard focus away while leaving the pointer on `codeTwo` removed the
  blue inner highlight and retained only the parent row's neutral hover surface. Browser smoke QA
  loaded Task Board, exercised its navigation, and reported no warning/error logs. `bun test` passed
  846 tests and 5,053 expectations.
- AC-10: PASS — `bun test tests/sessionRailRendered.test.tsx` requires both the grouped row and its
  Project content container to remain free of whole-row margin, preserving the full-width hover and
  selected surfaces.
- AC-11: PASS — `bun test tests/sessionRailRendered.test.tsx` keeps the Project trigger and grouped
  Task row on matching `px-2` containers without moving the row surface. The user's populated native
  screenshot then refined this from box alignment to optical alignment.
- AC-12: PASS — `bun test tests/sessionRailRendered.test.tsx` first failed twice because grouped Task
  content retained `pl-2` while the top-level Task had no optical inset, then passed 28 tests and 272
  expectations with the same `pl-1.5` on both. Neither uses `pl-2` or `pl-6`, and the row surfaces
  remain unmoved. `bun test` passed all 846 tests and 5,060 expectations. The existing Electrobun
  watcher passed lint, type-check, Vite production build, native packaging, and relaunched C2 on
  port 50000.
- AC-13: PASS — `bun test tests/sessionRailRendered.test.tsx` first failed against the empty
  Project placeholder's old `px-2`, then passed 29 tests and 276 expectations after changing only
  that copy to `pl-8 pr-2`. Existing Task content and row surfaces were not changed. `bun test`
  passed all 847 tests and 5,063 expectations; `git diff --check` passed. The existing Electrobun
  watcher completed lint, type-check, Vite production build, native packaging, and relaunched C2
  on port 50000.

Residual risk: pull-request badges remain on a third line by design; title, action, summary, and
active-row painting were verified at the current 301px sidebar width but not at every intermediate.
The neutral Project hover was visually replayed in the light native window; its dark-scheme override
is covered by the rendered class regression rather than a populated native dark-mode Project row.
The rebuilt native window currently showed its resource-injected recent-session state rather than a
populated Project tree, so AC-12 and AC-13's exact hierarchy is covered by the rendered DOM contract
and packaged bundle inspection; the supplied populated state remains the final visual acceptance
surface.

## Visual evidence

See bundle evidence/ when present.

## Security and privacy evidence

Not separately recorded unless present in legacy Verification.

## Deviations and residual risk

Residual risk: pull-request badges remain on a third line by design; title, action, summary, and

## Verdict

Verdict: verified.

## Review and release

Draft PR: [#218](https://github.com/IchenDEV/codeTwo/pull/218).
Approval: the user approved implementation through direct screenshot feedback on 2026-09-01.
Release target: none.
Release identity: not applicable until released.
Smoke evidence: local Browser and rebuilt native-window verification only.
Rollback: remove the scoped presentation correction.
No release: no merge, release, or deployment was requested.

## Feedback

The supplied native-window crops first highlighted the ordinary checkout badge sitting alone
beneath the summary age, then the over-indented grouped Task card, title/action spacing, and the
Provider icon occupying the summary's left edge. The final crop exposed an active Session whose
background painted while WebKit deferred its child subtree.
