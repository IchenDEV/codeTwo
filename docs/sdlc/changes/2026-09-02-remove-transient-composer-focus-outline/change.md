---
id: change-2026-09-02-remove-transient-composer-focus-outline
kind: change
schema: 2
status: verified
risk: low
owner: codex
approvers: user via the direct 2026-09-02 Browser comment
approved_at: 2026-09-02
created: 2026-09-02
updated: 2026-09-02
source: direct Browser comment that the focused transient composer must not show a blue frame
inputs: rendered Quick Chat focus state and the shared transient composer component
outputs: one shared neutral focus treatment for Quick Chat and Side Chat composers
scope: apps/desktop/src/session/SideChatPanel.tsx, apps/desktop/tests/sideChatPanelRendered.test.tsx, docs/sdlc/changes/2026-09-02-remove-transient-composer-focus-outline
next_trigger: human review and an explicit merge or release decision
verification_mode: owner
verified_by: codex
verified_at: 2026-09-02
---

# Remove the transient composer blue focus outline

## Intent

The focused Quick Chat composer currently paints a blue inset outline around the whole input card.
The user asked to remove that frame. Quick Chat and Side Chat share the same transient composer, so
the correction must remain at that shared seam and must not introduce a Web-only or placement-only
variant.

The desired outcome is a quiet, non-blue focus state that keeps the textarea operable and visible.
The main task Composer, layout, controls, transport, and conversation behavior are out of scope.

## Spec

When focus is anywhere inside a transient composer, its existing card uses the design system's
neutral hover-fill token instead of the blue inset focus-ring utility. The textarea retains its
caret and keyboard behavior, and nested buttons retain their own focus-visible treatment. The same
class contract applies to Quick Chat and Side Chat.

### Acceptance criteria

- [x] AC-1: Focused Quick Chat and Side Chat composer cards show no blue outline and retain a
      visible neutral surface state, verified by a focused rendered test and live Browser inspection.
- [x] AC-2: The shared transient composer remains keyboard-operable and the main task Composer's
      focus contract is unchanged, verified by targeted source and rendered tests.

## Decision and gates

The user's direct Browser comment accepts this low-risk visual correction. Ponytail selected one
shared class replacement and one existing regression update; no new component, option, or Web UI
branch is justified.

Human review remains required before merge. Merge, release, deployment, and publication are not
authorized.

## Plan

1. Replace the transient card's blue `focus-within` outline with the existing neutral focus fill.
2. Update the existing Quick Chat and Side Chat rendered contract to prohibit the old ring.
3. Run the focused test, renderer checks, live dark/light and narrow Browser focus passes, and
   repository documentation/lifecycle Gates.

Rollback restores the prior shared class and test expectation. There is no data or protocol
rollback.

## Build

The shared transient composer now replaces its blue inset focus ring with the existing neutral
hover-fill token and color transition. The existing rendered contract covers both Quick Chat and
Side Chat and prohibits the removed ring. The main task Composer was not changed. There were no
material deviations from the accepted plan.

## Verification

Verdict: verified.

### Acceptance evidence

- AC-1: PASS — `bun test apps/desktop/tests/sideChatPanelRendered.test.tsx` passed 21 tests with
  90 expectations, including both transient surfaces and the new no-blue-ring contract. In the
  live paired CLI Web UI, focused Quick Chat computed `outline-style: none` at 1658x1159 dark and
  700x700 light; the narrow pass had zero horizontal overflow and rendered the neutral focus fill.
- AC-2: PASS — the live textarea remained `document.activeElement` and accepted an ArrowLeft
  keyboard action. `bun test apps/desktop/tests/composerGeometryContract.test.ts` passed 6 tests
  with 37 expectations and retained the main Composer's existing focus contract. ESLint,
  Stylelint, TypeScript, and the actual Web Vite build passed with 6,604 transformed modules; the
  stable final Browser interaction produced no new console warnings or errors.

Residual risk: Side Chat was covered by the same shared component's rendered regression rather
than opened separately in the final live Browser pass. The visual change is a design-token class
replacement with no state or transport behavior, and both relevant themes plus the narrow layout
were rendered live.

## Review and release

Approval: implementation approved by the user on 2026-09-02; merge and release are not approved.
Review: Draft PR [#219](https://github.com/IchenDEV/codeTwo/pull/219) contains this change.
Release target: none.
Release identity: not applicable until released.
Smoke evidence: not applicable until released.
Rollback: restore the previous transient composer focus class and regression expectation.
No release: merge, deployment, and release are not authorized.

## Feedback

This change is the direct follow-up to the user's rendered Browser comment. No post-fix feedback
exists yet.
