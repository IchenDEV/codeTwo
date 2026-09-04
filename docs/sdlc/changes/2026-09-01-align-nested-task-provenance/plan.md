---
id: "2026-09-01-align-nested-task-provenance"
stage: plan
schema: 3
status: accepted
owner: codex
created: 2026-09-01
based_on: spec.md
risk: low
scope: apps/desktop/src/sidebar/SessionRail.tsx, apps/desktop/src/styles.css, apps/desktop/tests/sessionRailRendered.test.tsx, apps/desktop/tests/desktopPerformanceContract.test.ts, docs/sdlc/changes/2026-09-01-align-nested-task-provenance
approved_by: "userdirect screenshot feedback on 2026-09-01"
approved_at: "2026-09-01"
---

# Plan: Align nested Task provenance

## Files and ownership

apps/desktop/src/sidebar/SessionRail.tsx, apps/desktop/src/styles.css, apps/desktop/tests/sessionRailRendered.test.tsx, apps/desktop/tests/desktopPerformanceContract.test.ts, docs/sdlc/changes/2026-09-01-align-nested-task-provenance

## Order of work

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

## Test-first proof

See legacy Verification section.

## Visual or integration proof

See legacy Verification section.

## Risks and mitigations

See legacy Decision and gates.

## Rollback

See legacy Review and release.

## Deviations

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

## Decision

The direct screenshot report approves this low-risk visual correction. Ponytail selects the existing
session-row seam: conditionally place already-rendered provenance rather than adding a new component,
state model, or sidebar variant. Merge, release, deployment, and unrelated sidebar redesign remain
outside the authorized scope.
