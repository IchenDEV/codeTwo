---
id: change-2026-08-31-align-environment-popover
kind: change
schema: 2
status: verified
risk: low
owner: codex
approvers: [user]
approved_at: 2026-08-31
created: 2026-08-31
updated: 2026-08-31
source: direct user request with screenshot asking to adjust the environment popover position
inputs: EnvironmentPopover placement props and the shared Base UI Popover collision behavior
outputs: environment popover opens to the right from the header trigger
scope: apps/desktop/src/environment/EnvironmentPopover.tsx, apps/desktop/tests/environmentPopoverRendered.test.tsx, docs/sdlc/changes/2026-08-31-align-environment-popover
next_trigger: PR review; merge and release remain pending
verification_mode: owner
verified_by: codex
verified_at: 2026-08-31
---

# Align the environment popover

## Intent

The user highlighted the Environment popover and asked to move it to the right. The current
end-aligned placement makes the wide popover extend left across the reading surface. Align its
leading edge with the Environment trigger so it opens toward the available space on the right.

## Spec

Keep the existing header trigger, vertical offset, popover size, content, and shared Popover
primitive. Change only the horizontal alignment from trailing-edge placement to leading-edge
placement. Retain the primitive's built-in collision handling so the popover shifts back into the
viewport when there is not enough room on the right.

### Acceptance criteria

- [x] AC-1: The Environment popover's left edge aligns with the Environment trigger and the
      popover opens to its right in a normal desktop window.
- [x] AC-2: The popover remains within the viewport and all existing Environment interactions and
      content remain intact.
- [x] AC-3: Focused tests, renderer build, rendered Browser inspection, and repository lifecycle
      checks pass.

## Decision and gates

The direct user request approves this low-risk placement adjustment. The follow-up `pr` authorizes
PR creation only. Human review remains required before merge; release, deployment, and external
mutation remain unauthorized.

## Plan

1. Replace the manual trailing-edge offset with semantic leading-edge alignment.
2. Add a focused regression contract for the Environment popover alignment.
3. Exercise the trigger in an isolated rendered window and measure trigger, popup, and viewport
   bounds before completing the standard repository checks.

Rollback restores the previous Environment popover alignment props.

## Build

`EnvironmentPopover` now uses the shared Popover primitive's semantic `start` alignment without a
manual horizontal offset. At normal desktop width, the popup therefore starts at the Environment
trigger and grows rightward. The same primitive retains its viewport collision middleware for
constrained windows. The existing side offset, width, scrolling, content, and interactions are
unchanged.

## Verification

Verdict: verified.

### Acceptance evidence

- AC-1: PASS — isolated Browser rendering measured the Environment trigger at left `885.57 px`
  and the popup at left `885.5 px`; the Base UI positioner reported `data-align="start"`.
- AC-2: PASS — the rendered popup occupied `885.5–1173.5 px` inside a `1280 px` viewport. It
  retained Settings, Changes, Local, Git state, and Commit or push; clicking Local expanded the
  existing Add a project action.
- AC-3: PASS — `bun test tests/environmentPopoverRendered.test.tsx` passed four tests and 39
  expectations; targeted TypeScript and ESLint passed; full `bun test` passed 797 tests and 3,808
  expectations; and `bun run build:renderer` completed lint, TypeScript, and the Vite production
  build. `bun test script/verify/checks.test.ts`, `bun script/verify/docs.ts`,
  `bun script/verify/sdlc.ts`, and `bun script/verify/sdlc.ts --worktree` all passed. Rendered DOM,
  interaction, geometry measurement, and screenshot inspection passed.

Residual risk: collision behavior remains owned by the existing Base UI Popover primitive; the
renderer-only QA verified a 1280 px dark desktop viewport and did not restart the user's existing
Core-backed desktop process. No Core, persistence, or protocol path changed.

## Review and release

Approval: [PR #208](https://github.com/IchenDEV/codeTwo/pull/208) created by user authorization;
merge pending human review.
Release target: none.
Release identity: not applicable until released.
Smoke evidence: not applicable until released.
Rollback: revert this change bundle.
No release: PR creation is authorized; merge, deployment, and release remain unauthorized.

## Feedback

The screenshot and right-pointing annotation are the accepted scope indicator; no post-change
feedback exists yet.
