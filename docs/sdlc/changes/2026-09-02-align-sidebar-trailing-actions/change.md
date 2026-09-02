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
source: direct screenshot feedback that the Search shortcut, New task trailing action, and title-bar collapse action must align
inputs: the rendered SessionRail trailing-control geometry and existing spacing tokens
outputs: one shared trailing inset for the Search shortcut, Quick Chat action, and title-bar collapse action
scope: apps/desktop/src/sidebar/SessionRail.tsx, apps/desktop/tests/sessionRailRendered.test.tsx, docs/sdlc/changes/2026-09-02-align-sidebar-trailing-actions
next_trigger: human review and an explicit merge or release decision
verification_mode: owner
verified_by: codex
verified_at: 2026-09-02
---

# Align sidebar trailing actions

## Intent

The first screenshot showed that the Search shortcut and the Quick Chat action at the end of the New
task row did not share the same right edge. After that 4px correction, the user's follow-up screenshot
shows the title-bar collapse action still sitting farther right. Live geometry confirms its icon
center is 8px to the right of the other two controls. The desired outcome is one quiet vertical
trailing baseline without changing row height, icon size, labels, shortcuts, or interactions.

## Spec

The Quick Chat button and title-bar collapse button use the same effective 16px right inset as the
Search shortcut. The existing sidebar spacing tokens, shared SessionRail component, action
semantics, and focus behavior remain unchanged. Collapsed-rail layout and unrelated navigation rows
are out of scope.

### Acceptance criteria

- [x] AC-1: The Search shortcut, Quick Chat action, and title-bar collapse action share one rendered
      trailing centerline in the live Web UI, verified by Browser geometry and screenshots.
- [x] AC-2: The Quick Chat and collapse actions remain present, labeled, keyboard-focusable, and
      clickable, verified by the focused rendered regression and live Browser interactions.

## Decision and gates

The user's direct screenshot feedback accepts this low-risk alignment correction. Ponytail selected
one existing spacing-token addition at the shared SessionRail seam plus one regression assertion; no
new wrapper, layout system, or Web-only variant is justified.

Human review remains required before merge. Merge, release, deployment, and publication are not
authorized.

## Plan

1. Keep the corrected Quick Chat inset and move the title-bar collapse button onto the same axis.
2. Extend the focused SessionRail regression with the complete trailing-inset contract.
3. Rebuild the Web assets and compare the live right-edge geometry at desktop and narrow widths.

Rollback restores the prior margin token and regression expectation. There is no data or protocol
rollback.

## Build

The shared SessionRail uses the existing `mr-2` spacing token on the Quick Chat button, moving
its right edge inward by 4px to match the Search shortcut's effective 16px trailing inset. The
focused rendered regression prohibits restoring the previous `mr-1` token. No wrapper, dimensions,
semantics, or interaction logic changed.

The follow-up adds the same existing `mr-2` trailing token to the title-bar collapse button. Combined
with the title row's existing padding, this moves its 28px button and 16px icon 8px inward onto the
same axis as the Search shortcut and Quick Chat action. Dimensions, native button semantics, labels,
focus treatment, and event handling remain unchanged.

## Verification

Verdict: verified.

### Acceptance evidence

- AC-1: PASS — `bunx vite build --mode web --outDir ../../target/debug/web-ui --emptyOutDir`
  passed with 6,604 transformed modules. After reloading the live CLI Web UI at 980x998, Browser
  geometry measured Collapse and Quick Chat centers at 258px and the Search shortcut visual center
  at 258.17px. At 900x700 with the overlay rail expanded, the same centers and zero horizontal
  overflow were observed; screenshots show the single trailing axis.
- AC-2: PASS — `bun test apps/desktop/tests/sessionRailRendered.test.tsx` passed 30 tests with 287
  expectations, including the collapse `mr-2` contract. In the live Browser, clicking Collapse
  exposed the visible `Expand the sidebar` button, and clicking Expand restored the labeled collapse
  control and full rail. `bun run lint` and `bunx tsc --noEmit` passed.

Residual risk: at 700px the responsive rail starts collapsed, so the three-control axis is not
simultaneously visible until the rail is expanded at a wider overlay breakpoint. The alignment is
enforced by fixed shared spacing tokens rather than viewport-dependent offsets. The current in-app
tab is unpaired and retains its pre-existing transport errors; they were present before the CSS
change and do not affect the local collapse/expand or layout evidence.

## Review and release

Approval: implementation approved by the user on 2026-09-02; merge and release are not approved.
Review: Draft PR [#219](https://github.com/IchenDEV/codeTwo/pull/219) contains this change.
Release target: none.
Release identity: not applicable until released.
Smoke evidence: not applicable until released.
Rollback: restore the previous Quick Chat and title-bar collapse margin tokens and regression
expectations.
No release: merge, deployment, and release are not authorized.

## Feedback

The first annotated screenshot led to the Quick Chat inset correction. The user's follow-up
screenshot shows the title-bar collapse action still offset from the corrected Search and Quick Chat
axis. Before this iteration, live Browser geometry measured centers at 266px for Collapse, 258.17px
for the Search shortcut, and 258px for Quick Chat. The follow-up now measures the two icon centers at
258px and the shortcut at 258.17px.
