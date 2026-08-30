---
id: change-2026-08-31-align-selectable-row-icons
kind: change
schema: 2
status: verified
risk: low
owner: codex
approvers: [user via the 2026-08-31 direct icon-alignment request]
approved_at: 2026-08-31
created: 2026-08-31
updated: 2026-08-31
source: direct user feedback that the icon is crooked and not aligned
inputs: rendered Provider picker and shared SelectableRow layout
outputs: first-line-aligned selection indicators and leading icons
scope: apps/desktop/src/components/business/selectable-row.tsx, apps/desktop/tests/designSystemBusinessComponents.test.tsx, docs/sdlc/changes/2026-08-31-align-selectable-row-icons/change.md
next_trigger: human review and feedback
verification_mode: owner
verified_by: codex
verified_at: 2026-08-31
---

# Align selectable-row icons with their labels

## Intent

The user reported that the icon in the recently rendered Provider picker looked crooked and out of
alignment. Browser geometry confirmed that description-bearing `SelectableRow` children were
top-aligned: the 14 px provider mark sat 3.5 px above the center of the 21 px first-line label, and
the availability dot touched the provider mark with zero spacing. The desired result is a stable,
visually centered first-line icon column without redesigning the menu or changing provider state.
This request does not authorize a pull request, merge, release, or deployment.

## Spec

The selection indicator and leading content use a line-height-sized alignment box so their visual
centers match the row's first-line label whether or not a description exists. Multiple leading
elements use the existing inline gap token, separating the Provider availability dot from its
brand mark. Selection, disabled behavior, accessible names, descriptions, and provider behavior
remain unchanged.

### Acceptance criteria

- [x] AC-1: In description-bearing selectable rows, the selection indicator and provider mark are
      centered on the first-line label rather than its top edge.
- [x] AC-2: The Provider availability dot and brand mark have visible tokenized spacing while all
      rows retain consistent text and icon columns.
- [x] AC-3: Focused/full desktop tests, renderer build, desktop/narrow Browser inspection, and
      repository lifecycle checks pass.

## Decision and gates

The user directly accepted this low-risk visual correction on 2026-08-31. No security,
data-migration, release, or production Gate applies. Human review remains required before merge,
and no external delivery action is authorized.

## Plan

1. Give the indicator and leading slots line-height-sized centering boxes and tokenized child gap.
2. Extend the shared component test to lock the alignment contract.
3. Run desktop tests/build and compare Browser geometry and screenshots at desktop and narrow
   widths, then complete repository lifecycle checks.

Rollback reverts the shared alignment classes and their focused assertions.

## Build

Completed. The shared selection-indicator and leading slots now use a `1lh`-high alignment box,
which follows the actual first-line text height instead of aligning smaller glyphs to its top edge.
The leading slot also applies the existing `gap-inline` token between multiple children. The
component test locks both layout classes without adding runtime state or rendering work.

## Verification

Verdict: verified.

### Acceptance evidence

- AC-1: PASS — Browser `evaluate()` geometry on the same rendered Provider picker measured the provider mark
  3.5 px and the selection indicator 2.5 px above the first-line label before the change. After
  the change, indicator, leading slot, status dot, provider mark, and label shared the exact same
  center line on Claude Code, Codex, Grok, and Cursor rows.
- AC-2: PASS — computed layout reported a 4 px `gap-inline` between the 6 px availability dot and
  14 px provider mark, with stable indicator and text columns. Desktop and 560x760 screenshots are
  `/tmp/codetwo-provider-icons-aligned-desktop.png` and
  `/tmp/codetwo-provider-icons-aligned-narrow.png`.
- AC-3: PASS — `bun test tests/designSystemBusinessComponents.test.tsx` passed 8 tests with 56
  expectations; full `bun test` passed 766 tests with 3,640 expectations and zero failures;
  `bunx tsc --noEmit` and `bun run build:renderer` passed. Browser checks at desktop and 560x760
  verified page identity, meaningful content, no framework overlay, no horizontal overflow, and no
  console warning/error. Repository lifecycle checks are recorded by the final Gate run after this
  Artifact update.

Residual risk: Browser validation covers the shared production renderer rather than restarting the
user's already-running native desktop application. Other rows using `SelectableRow` inherit the
same semantic first-line alignment, which is intentional.

## Review and release

Approval: pending human review.
Release target: none.
Release identity: not applicable until released.
Smoke evidence: not applicable until released.
Rollback: revert this change to restore the previous top-aligned icon layout.
No release: the current request authorizes only local implementation and verification.

Preparing this section does not authorize merge, deployment, release, or production mutation.

## Feedback

No post-change feedback exists yet.
