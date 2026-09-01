---
id: change-2026-09-01-align-nested-task-provenance
kind: change
schema: 2
status: verified
risk: low
owner: codex
approvers: user via direct screenshot feedback on 2026-09-01
approved_at: 2026-09-01
created: 2026-09-01
updated: 2026-09-01
source: direct user screenshot feedback on nested Task provenance, indentation, title/action spacing, summary alignment, the shared Task/folder baseline, and empty-Project alignment
inputs: existing SessionRail Task summary and workspace provenance rows
outputs: aligned Task titles and summaries with trailing provider and Git metadata
scope: apps/desktop/src/sidebar/SessionRail.tsx, apps/desktop/src/styles.css, apps/desktop/tests/sessionRailRendered.test.tsx, apps/desktop/tests/desktopPerformanceContract.test.ts, docs/sdlc/changes/2026-09-01-align-nested-task-provenance
next_trigger: user visual acceptance in the populated Project view
verification_mode: owner
verified_by: codex
verified_at: 2026-09-01
---

# Align nested Task provenance

## Intent

Project-grouped Tasks already inherit their workspace identity from the visible Project heading. The
current row still reserves a third workspace line and pushes the ordinary checkout badge to its far
edge, leaving the badge visually detached below the summary age. The user requested correction of
that alignment issue without changing the surrounding sidebar hierarchy.

## Spec

- A Project-grouped Task places its checkout/worktree badge in the summary metadata rail.
- A grouped Task without pull-request status does not render an otherwise empty workspace line.
- A grouped Task with pull-request status retains a dedicated provenance line for that richer state.
- Ungrouped Tasks retain the existing workspace, checkout/worktree, and pull-request row.
- Existing selection, status, actions, drag-and-drop, truncation, and accessible labels remain intact.
- Project-grouped Task titles share the same horizontal start as top-level Task titles.
- A Task title keeps a stable small gap from its hover/focus action group at narrow widths.
- Summary text shares the Task title start; the Provider icon belongs to the trailing metadata rail.
- A Project disclosure trigger stays transparent on hover so the whole row uses one neutral feedback surface.
- Task rows keep their full-width surfaces while applying only the measured optical inset to their content.
- Top-level and Project-grouped Task titles align with the leading edge of Project folder icons.
- Empty-Project copy aligns beneath the Project label rather than the folder-icon column.

### Acceptance criteria

- [x] AC-1: A grouped Task without a pull request renders age and checkout/worktree metadata on the summary line and has no empty workspace line.
- [x] AC-2: An ungrouped Task retains its workspace line and Git provenance.
- [x] AC-3: A grouped Task with pull-request status retains a dedicated provenance line with its checkout/worktree and pull-request badges.
- [x] AC-4: Focused rendered tests, renderer build, Browser QA, repository Gates, and the rebuilt native window pass.
- [x] AC-5: Project-grouped Task containers use zero whole-row offset so their interaction surfaces align with top-level Tasks.
- [x] AC-6: Task titles keep an 8px minimum gap from the action group without moving the actions away from the right edge.
- [x] AC-7: Summary text starts below the Task title while Provider, age, and checkout metadata remain grouped on the right.
- [x] AC-8: The active Session row always paints its contents after selection and scrolling instead of leaving only its background visible.
- [x] AC-9: Hovering a Project disclosure does not add a blue/accent fill inside the Project row.
- [x] AC-10: Grouped Task content retains a full-width hover or selected surface.
- [x] AC-11: A grouped Task title and its Project folder icon share the same leading edge while the row surface remains full width.
- [x] AC-12: Top-level and grouped Task content use the shared 6px optical inset visible in the populated native sidebar, without moving row surfaces.
- [x] AC-13: Empty-Project copy starts in the Project label column while existing Task rows remain unchanged.

## Decision and gates

The direct screenshot report approves this low-risk visual correction. Ponytail selects the existing
session-row seam: conditionally place already-rendered provenance rather than adding a new component,
state model, or sidebar variant. Merge, release, deployment, and unrelated sidebar redesign remain
outside the authorized scope.

## Plan

1. Add a rendered regression for the grouped row's metadata placement.
2. Reuse the existing provenance elements in the summary or workspace row according to grouping.
3. Verify grouped, ungrouped, pull-request, narrow-width, and live-window rendering.
4. Apply the user's follow-up spacing correction at the existing Project-content and title-row seams.
5. Reorder the existing summary children so preview text leads and Provider joins trailing metadata.
6. Preserve off-screen paint deferral while opting the active Session row out of paint containment.
7. Keep the Project disclosure transparent and let its existing parent row own neutral hover feedback.
8. Apply the Project hierarchy step to grouped Task content, not to the row container.
9. Align the grouped Task title with the Project folder icon by removing the content-only hierarchy step.
10. Correct the measured remaining 8px offset at the grouped Task content seam.
11. Replace the grouped-only 8px correction with one shared 6px Task-content baseline.
12. Move only the empty-Project placeholder from the folder-icon column to the Project label column.

Rollback restores the unconditional workspace row and its previous trailing provenance placement.

## Build

The existing checkout/worktree and pull-request badges are now reusable row fragments. A grouped
Task without a pull request places its checkout/worktree badge after the age on the summary line and
does not render an empty workspace line. Ungrouped Tasks preserve the workspace line. Grouped Tasks
with a pull request keep a provenance line because the additional delivery state is meaningful.
No state, bridge, styling token, action, or shared component changed. Follow-up screenshot feedback
reopened this Artifact to reduce nested content indentation and stabilize the title/action gap.
The latest alignment feedback reuses the same elements and moves only the Provider icon's render order.
The blank-active-row report reopens this Artifact at the existing session-row paint seam. Off-screen
rows still use paint containment, while the row containing `aria-current="page"` opts back into
normal painting so its background and contents cannot diverge.
The latest Project-row feedback reopens this Artifact to remove the nested trigger's accent hover fill
while retaining the existing full-row neutral hover and keyboard focus outline.
The latest alignment crop reopens this Artifact because zeroing the whole Project-content offset made
the selected surfaces consistent but flattened the label hierarchy. The correction keeps those surfaces
full width and indents only the grouped Task content to the Project label column.
The user's explicit baseline clarification reopens the Artifact: the grouped Task title should align
with the Project folder icon, not with the Project label. The full-width surfaces remain unchanged.
The user's populated native screenshot disproves the zero-offset geometry assumption: Project rows
still place their folder icon one 8px spacing step to the right of grouped Task text.
The next populated screenshot disproves that grouped-only 8px correction: grouped Task text moved
past the red baseline while top-level Task text remained left of it. Both need the same 6px inset.
The latest red bracket isolates the remaining mismatch to empty-Project copy, which still uses the
folder-icon column instead of the Project label column.

## Verification

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

## Review and release

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
