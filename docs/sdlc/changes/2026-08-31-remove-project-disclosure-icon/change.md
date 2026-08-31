---
id: change-2026-08-31-remove-project-disclosure-icon
kind: change
schema: 2
status: verified
risk: low
owner: codex
approvers: [user]
approved_at: 2026-08-31
created: 2026-08-31
updated: 2026-08-31
source: direct user request with screenshot marking the Project-row disclosure icon
inputs: current desktop SessionRail Project header and screenshot feedback
outputs: Project rows without a trailing disclosure icon while retaining whole-row folding
scope: apps/desktop/src/sidebar/SessionRail.tsx, apps/desktop/tests/sessionRailRendered.test.tsx, docs/sdlc/changes/2026-08-31-remove-project-disclosure-icon
next_trigger: PR review; merge and release remain pending
verification_mode: owner
verified_by: codex
verified_at: 2026-08-31
---

# Remove the Project disclosure icon

## Intent

The user marked the trailing arrow on the `codeTwo` Project row and requested that the icon not be
shown. The affected surface is every Project header in the desktop sidebar. The Project name,
folder icon, actions, drag behavior, ordering, and whole-row expand/collapse interaction must remain
unchanged. The follow-up `pr` authorizes PR creation for this verified scope only; a broader sidebar
redesign, merge, release, or deployment remains unauthorized.

## Spec

Project headers render the folder icon and Project name without a trailing disclosure arrow. The
existing Project header remains the accessible collapsible trigger, continues to expose its
expanded state, and still reveals or hides the Project's Tasks when activated. Section, archive,
menu, and unrelated chevron icons are outside this change.

### Acceptance criteria

- [x] AC-1: Every Project header omits the trailing disclosure icon while retaining its folder icon.
- [x] AC-2: Activating the Project header still toggles its expanded state and Task content.
- [x] AC-3: Focused rendered tests, renderer checks, lifecycle checks, and a real rendered sidebar
      inspection pass.

## Decision and gates

The direct user request accepts this low-risk Intent and visible UI direction. Human review remains
required before merge. No release or production action is authorized.

## Plan

1. Remove the decorative disclosure icon from the shared Project-header renderer.
2. Add a rendered regression covering both the icon count and retained collapse behavior.
3. Run focused checks, repository lifecycle checks, and inspect the rendered sidebar.

Rollback reverts this bundle and restores the disclosure icon.

## Build

The shared Project header no longer renders its trailing disclosure arrow. A rendered regression
asserts that its only SVG is the folder and that activating the same header still folds its Task
content. No material deviation from the Plan was required.

## Verification

Verdict: verified.

### Acceptance evidence

- AC-1: PASS — `bun test tests/sessionRailRendered.test.tsx` passed 24 tests and the 954 by 858
  in-app Browser inspection showed `codeTwo`, `open-mole`, and `MacOS` with one folder SVG each and
  no trailing disclosure arrow.
- AC-2: PASS — the focused test and Browser interaction changed the `codeTwo` header from
  `aria-expanded=true` to `false`, removed its Project content, then restored the expanded content.
- AC-3: PASS — full `bun test` passed 795 tests across 137 files with 3,799 expectations;
  `bun run build:renderer`, `bun test script/verify/checks.test.ts`,
  `bun script/verify/docs.ts`, `bun script/verify/sdlc.ts`, and
  `bun script/verify/sdlc.ts --worktree` passed; the dark rendered view had no relevant console
  error or warning.

The first focused test attempt failed before loading the suite because this new worktree had no
installed dependencies (`Cannot find module 'react/jsx-dev-runtime'`). `bun install
--frozen-lockfile` restored the lockfile-defined dependencies, after which the same test passed.

Residual risk: native Core-backed data was not opened because another CodeTwo checkout already
owned the user's live development instance. Visual QA used the isolated renderer on port 1421 with
temporary in-memory Project fixtures that were removed before the final build; the shared Project
component and interaction path were the production implementation.

## Review and release

Approval: [PR #208](https://github.com/IchenDEV/codeTwo/pull/208) created by user authorization;
merge pending human review.
Release target: none.
Release identity: not applicable until released.
Smoke evidence: not applicable until released.
Rollback: revert this change bundle to restore the previous Project-header icon.
No release: PR creation is authorized; merge, deployment, and release remain unauthorized.

Preparing this section does not authorize merge, deployment, release, or production mutation.

## Feedback

This change directly records the screenshot feedback. No post-change feedback exists yet.
