---
id: change-2026-09-02-align-sidebar-trailing-actions
kind: change
schema: 2
status: verified
risk: low
owner: codex
approvers: user via the direct 2026-09-02 screenshot feedback
approved_at: 2026-09-02
created: 2026-09-02
updated: 2026-09-02
source: direct screenshot feedback that the Search shortcut and New task trailing action must align
inputs: the rendered SessionRail trailing-control geometry and existing spacing tokens
outputs: one shared trailing inset for the Search shortcut and Quick Chat action
scope: apps/desktop/src/sidebar/SessionRail.tsx, apps/desktop/tests/sessionRailRendered.test.tsx, docs/sdlc/changes/2026-09-02-align-sidebar-trailing-actions
next_trigger: human review and an explicit merge or release decision
verification_mode: owner
verified_by: codex
verified_at: 2026-09-02
---

# Align sidebar trailing actions

## Intent

The Search shortcut and the Quick Chat action at the end of the New task row do not share the same
right edge. The user's screenshot marks the 4px offset and asks for alignment. The desired outcome
is one quiet vertical trailing baseline without changing row height, icon size, labels, shortcuts,
or interactions.

## Spec

The Quick Chat button uses the same effective 16px right inset as the Search shortcut. The existing
sidebar spacing tokens, shared SessionRail component, action semantics, and focus behavior remain
unchanged. The title-bar collapse button and unrelated navigation rows are out of scope.

### Acceptance criteria

- [x] AC-1: The Search shortcut and Quick Chat action have the same right edge in the rendered Web
      UI at two live browser viewports, verified by live Browser geometry and screenshots.
- [x] AC-2: The Quick Chat action remains present, labeled, and clickable, verified by the focused
      rendered regression and a live Browser interaction.

## Decision and gates

The user's direct screenshot feedback accepts this low-risk alignment correction. Ponytail selected
one existing spacing-token replacement at the shared SessionRail seam plus one regression assertion;
no new wrapper, layout system, or Web-only variant is justified.

Human review remains required before merge. Merge, release, deployment, and publication are not
authorized.

## Plan

1. Move the Quick Chat button inward by one existing spacing step.
2. Extend the focused SessionRail regression with the trailing-inset contract.
3. Rebuild the Web assets and compare the live right-edge geometry at desktop and narrow widths.

Rollback restores the prior margin token and regression expectation. There is no data or protocol
rollback.

## Build

The shared SessionRail now uses the existing `mr-2` spacing token on the Quick Chat button, moving
its right edge inward by 4px to match the Search shortcut's effective 16px trailing inset. The
focused rendered regression prohibits restoring the previous `mr-1` token. No wrapper, dimensions,
semantics, or interaction logic changed.

## Verification

Verdict: verified.

### Acceptance evidence

- AC-1: PASS — `bunx vite build --mode web --outDir ../../target/debug/web-ui --emptyOutDir`
  passed with 6,604 transformed modules. After live reloads at 1201x1204 and 1658x1159, Browser
  geometry measured both trailing controls at right edge 272px with a 0px delta; the saved screenshot
  shows the corrected shared baseline.
- AC-2: PASS — `bun test apps/desktop/tests/sessionRailRendered.test.tsx` passed 30 tests with 286
  expectations, including the new token contract. A live Browser click changed Quick Chat from
  `aria-pressed=false` to `true` and rendered its heading; the paired reload produced no new console
  warnings or errors. `bun run lint` and `bunx tsc --noEmit` also passed.

Residual risk: viewports narrower than 1201px were not exercised because the selected Browser
surface does not expose viewport resizing. The visible rail is fixed at 288px in both measured
viewports, the alignment is enforced by a fixed spacing token, and the controls disappear when the
rail collapses. The unpaired in-app tab retains its pre-existing transport warning; the paired tab
had no new warnings or errors.

## Review and release

Approval: implementation approved by the user on 2026-09-02; merge and release are not approved.
Release target: none.
Release identity: not applicable until released.
Smoke evidence: not applicable until released.
Rollback: restore the previous Quick Chat right-margin token and regression expectation.
No release: merge, deployment, and release are not authorized.

## Feedback

This change is the direct follow-up to the user's annotated sidebar screenshot. No post-fix feedback
exists yet.
