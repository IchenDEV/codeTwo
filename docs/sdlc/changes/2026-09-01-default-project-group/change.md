---
id: change-2026-09-01-default-project-group
kind: change
schema: 2
status: verified
risk: low
owner: codex
approvers: [user]
approved_at: 2026-09-01
created: 2026-09-01
updated: 2026-09-01
source: direct user request with screenshot highlighting the root Project list
inputs: root Projects currently rendered as an unlabelled flat list in SessionRail
outputs: one built-in expanded Project group containing every root Project
scope: apps/desktop/src/sidebar/SessionRail.tsx, apps/desktop/tests/sessionRailRendered.test.tsx, docs/sdlc/changes/2026-09-01-default-project-group
next_trigger: user visual acceptance in the populated Project view
verification_mode: owner
verified_by: codex
verified_at: 2026-09-01
---

# Add a default Project group

## Intent

The screenshot highlights the unlabelled block of root Projects and requests a default Project
group. The existing Project, Task, custom Section, ordering, and drag/drop models should remain the
authority; this change only gives root Projects a visible shared container.

## Spec

- Root Projects render inside one built-in `All projects` group.
- The group is expanded by default and can be collapsed independently.
- Existing Project rows, empty Project copy, nested Tasks, ordering, and drag/drop targets remain
  unchanged.
- User-created Sections remain separate from this built-in group.

### Acceptance criteria

- [x] AC-1: Every root Project appears once inside the built-in Project group.
- [x] AC-2: The group is expanded by default and its disclosure hides and restores the Project list.
- [x] AC-3: Focused and full desktop tests, native rebuild, and repository lifecycle checks pass.

## Decision and gates

The direct screenshot request approves this low-risk presentation change. Ponytail selects the
existing root Project render seam and the existing persisted disclosure primitive. No new Project,
Section, assignment, or synchronization model is introduced.

## Plan

1. Add a rendered regression for the built-in group and its disclosure.
2. Wrap the existing root Project drop zone in the group without changing its contents.
3. Rebuild the existing desktop instance and run the required checks.

Rollback removes the built-in wrapper and restores the root Project list directly.

## Build

SessionRail now wraps the unchanged root Project drop zone in one built-in collapsible group. It
reuses the existing `All projects` string, Button, Collapsible, Chevron, and persisted-boolean hook.
The group opens by default, remembers the local fold preference, and temporarily opens while a
Project is being dragged so the root drop target remains available. No Project or Task data moved.

## Verification

Verdict: verified.

### Acceptance evidence

- AC-1: PASS — `bun test tests/sessionRailRendered.test.tsx --test-name-pattern
  "default Project group"` first failed because the wrapper did not exist, then passed with one
  `/tmp/repo` Project rendered once beneath `data-default-project-content`.
- AC-2: PASS — the same regression verifies `All projects`, the default `aria-expanded="true"`
  state, and a click transition to `aria-expanded="false"` with the Project content removed.
  `bun test tests/sessionRailRendered.test.tsx` passed 30 tests and 283 expectations.
- AC-3: PASS — `bun test` passed 848 tests and 5,063 expectations; `git diff --check` passed. The
  existing Electrobun watcher passed lint, TypeScript, Vite production build, native helpers,
  packaging, and relaunched C2-dev on port 50000. The rebuilt native app exposed a meaningful C2
  window with no startup overlay.

Residual risk: the Browser plugin can reach port 50000, but that HTTP root is Electrobun's Bun
bootstrap page rather than the `views://main/index.html` renderer. The rebuilt native window's
current data contains only unassigned recent Sessions and no root Projects, so exact populated-list
appearance is covered by the rendered DOM regression; the user's populated state remains the final
visual acceptance surface.

## Review and release

Approval: the user approved implementation through direct screenshot feedback on 2026-09-01.
Release target: none.
Release identity: not applicable until released.
Smoke evidence: local rendered and native-window verification only.
Rollback: remove the built-in root Project wrapper.
No release: no merge, deployment, or release was requested.

## Feedback

The supplied native screenshot is the scope and pre-change visual evidence.
