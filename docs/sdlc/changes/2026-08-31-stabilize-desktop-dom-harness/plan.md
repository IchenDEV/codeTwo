---
id: "2026-08-31-stabilize-desktop-dom-harness"
stage: plan
schema: 3
status: accepted
owner: codex
created: 2026-08-31
based_on: spec.md
risk: low
scope: apps/desktop/tests/domTestHarness.ts, apps/desktop/tests/domTestHarness.test.ts, docs/sdlc/changes/2026-08-31-stabilize-desktop-dom-harness
approved_by: "[user]"
approved_at: "2026-08-31"
---

# Plan: Stabilize the desktop DOM test harness

## Files and ownership

apps/desktop/tests/domTestHarness.ts, apps/desktop/tests/domTestHarness.test.ts, docs/sdlc/changes/2026-08-31-stabilize-desktop-dom-harness

## Order of work

1. Add a focused regression for the Web Animations method required by ScrollArea.
2. Add the smallest harness-owned compatibility implementation and retain browser-like frame
   scheduling without touching production code.
3. Run focused tests, macOS and Linux Bun 1.4.0 full suites, renderer build, lifecycle checks, and
   PR CI.

Rollback removes the harness fallback and regression test. No product data or runtime behavior is
affected.

## Test-first proof

See legacy Verification section.

## Visual or integration proof

See legacy Verification section.

## Risks and mitigations

See legacy Decision and gates.

## Rollback

See legacy Review and release.

## Deviations

`domTestHarness` now defines `Element.getAnimations()` only when the harness-owned happy-dom window
does not provide it. The compatibility implementation returns an empty list, matching the
no-running-animation state Base UI's ScrollArea already handles. A focused test locks down the
exact method call and `{ subtree: true }` option that failed in CI. No production source or runner
configuration changed. Global animation-frame calls now delegate to happy-dom's own scheduler and
canceller instead of zero-delay timers, preventing Base UI Popover positioning from entering a
tight Linux-only update loop.

## Decision

The user's direct CI repair request accepts this low-risk test-infrastructure Intent. Pushing the
fix to the existing PR is authorized by that request. Merge, release, and deployment remain pending
separate Gates.
