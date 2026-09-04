---
id: "2026-08-31-replace-sidebar-drag-with-dnd-kit"
stage: verification
schema: 3
status: passed
owner: codex
created: 2026-08-31
based_on: plan.md
commit: ""
verification_mode: owner
verified_by: "codex"
verified_at: "2026-09-01"
release_target: none
release_identity: "not applicable until released."
---

# Verification: Replace sidebar drag handling with dnd-kit

## Automated checks

Verdict: verified

Review-feedback corrections are included in this verdict.

### Acceptance evidence

- AC-1: PASS — `Browser physical pointer drag` used a paced Chromium pointer path in the isolated rendered desktop shell
  changed the root Project order from `codeTwo, open-mole, MacOS` to
  `open-mole, MacOS, codeTwo`; dnd-kit finalized the source at index 2 instead of retaining its
  stale hover index. See the [dark baseline](evidence/pr-review-dark.png) and
  [post-drag state](evidence/drag-result-dark.png).
- AC-2: PASS — physical pointer dragging moved `codeTwo` into the empty `Work` Section, and a
  separate drag moved `open-mole` from `Work` back to the root Project list. After the final
  sortable-row registration correction, an actual keyboard gesture (`Enter`, `ArrowUp`, `Enter`)
  also moved `codeTwo` into the empty `Work` Section.
- AC-3: PASS — `bun test tests/sessionRailRendered.test.tsx` verifies that Section, Project, and
  Task rows expose dedicated dnd-kit keyboard handles and no native `[draggable=true]` elements.
  `bun test tests/sidebarDnd.test.ts` additionally verifies that nonempty Task containers stay
  below Task-row priority and that null or incompatible drag targets clear the last destination.
  The broader destination suites verify finalized index mapping plus Section, Project, and Task
  decoding, including encoded paths. Existing typed domain move suites pass.
- AC-4: PASS — the final `bun test` passed 809 tests and 3,841 expectations; `bunx tsc --noEmit`
  and `bun run build` also passed. The isolated rendered pass covered same-list
  pointer sorting, empty-Section keyboard placement, the [narrow shell](evidence/pr-review-narrow-dark.png),
  and the final visual state without starting a second Core process.

The initial native-HTML5 baseline emitted `pointerdown` but not `dragstart`. During replacement,
the first library pass exposed two integration defects: optimistic same-list sorting reported the
source row as the final target, and Project/Task empty drop zones shared an ID. The final adapter
uses sortable destination metadata and kind-qualified drop-zone IDs; both failure paths were
retested after correction. The later review regressions were first reproduced by focused failing
tests, then passed after container-priority and stale-target normalization were corrected.

Residual risk: the user's live Core-backed profile was deliberately not opened because another
process owns it. Pointer and keyboard gestures were exercised in the isolated Chromium renderer;
the unchanged Core persistence operations are covered by domain tests rather than a second live
Core instance.

## Behavioral evidence

Verdict: verified

Review-feedback corrections are included in this verdict.

### Acceptance evidence

- AC-1: PASS — `Browser physical pointer drag` used a paced Chromium pointer path in the isolated rendered desktop shell
  changed the root Project order from `codeTwo, open-mole, MacOS` to
  `open-mole, MacOS, codeTwo`; dnd-kit finalized the source at index 2 instead of retaining its
  stale hover index. See the [dark baseline](evidence/pr-review-dark.png) and
  [post-drag state](evidence/drag-result-dark.png).
- AC-2: PASS — physical pointer dragging moved `codeTwo` into the empty `Work` Section, and a
  separate drag moved `open-mole` from `Work` back to the root Project list. After the final
  sortable-row registration correction, an actual keyboard gesture (`Enter`, `ArrowUp`, `Enter`)
  also moved `codeTwo` into the empty `Work` Section.
- AC-3: PASS — `bun test tests/sessionRailRendered.test.tsx` verifies that Section, Project, and
  Task rows expose dedicated dnd-kit keyboard handles and no native `[draggable=true]` elements.
  `bun test tests/sidebarDnd.test.ts` additionally verifies that nonempty Task containers stay
  below Task-row priority and that null or incompatible drag targets clear the last destination.
  The broader destination suites verify finalized index mapping plus Section, Project, and Task
  decoding, including encoded paths. Existing typed domain move suites pass.
- AC-4: PASS — the final `bun test` passed 809 tests and 3,841 expectations; `bunx tsc --noEmit`
  and `bun run build` also passed. The isolated rendered pass covered same-list
  pointer sorting, empty-Section keyboard placement, the [narrow shell](evidence/pr-review-narrow-dark.png),
  and the final visual state without starting a second Core process.

The initial native-HTML5 baseline emitted `pointerdown` but not `dragstart`. During replacement,
the first library pass exposed two integration defects: optimistic same-list sorting reported the
source row as the final target, and Project/Task empty drop zones shared an ID. The final adapter
uses sortable destination metadata and kind-qualified drop-zone IDs; both failure paths were
retested after correction. The later review regressions were first reproduced by focused failing
tests, then passed after container-priority and stale-target normalization were corrected.

Residual risk: the user's live Core-backed profile was deliberately not opened because another
process owns it. Pointer and keyboard gestures were exercised in the isolated Chromium renderer;
the unchanged Core persistence operations are covered by domain tests rather than a second live
Core instance.

## Visual evidence

See bundle evidence/ when present.

## Security and privacy evidence

Not separately recorded unless present in legacy Verification.

## Deviations and residual risk

Residual risk: the user's live Core-backed profile was deliberately not opened because another

## Verdict

Verdict: verified.

## Review and release

Approval: [PR #208](https://github.com/IchenDEV/codeTwo/pull/208) created by user authorization;
merge pending human review.
Release target: none.
Release identity: not applicable until released.
Smoke evidence: not applicable until released.
Rollback: revert this change bundle to restore the prior drag interaction.
No release: PR creation is authorized; merge, deployment, and release remain unauthorized.

Preparing this section does not authorize merge, deployment, release, or production mutation.

## Feedback

The screenshot and request are the direct defect feedback for this change. PR review later found
that nonempty Project/Section container zones could outrank nested Task rows and that leaving all
valid targets retained the last hover destination. The user explicitly requested both corrections.
