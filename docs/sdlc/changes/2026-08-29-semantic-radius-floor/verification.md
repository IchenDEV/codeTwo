---
id: "2026-08-29-semantic-radius-floor"
stage: verification
schema: 3
status: passed
owner: codex
created: 2026-08-29
based_on: plan.md
commit: ""
verification_mode: fresh-context
verified_by: "Sol independent review"
verified_at: "2026-08-29"
release_target: none
release_identity: ""
---

# Verification: Raise the semantic radius floor

## Automated checks

- Sol's minimal independent review ran `bun test tests/composerGeometryContract.test.ts` with 3
  passes, then `bun test tests/designSystem.test.ts -t "radii|radius"` with 2 passes and 12
  assertions. `git diff --check` also passed.
- At 811x998 in both light and dark appearance, computed corners were Add action 12px, Run 12px,
  Scene 12px, Open `12/0/0/12`, Open More `0/12/12/0`, Project health 16px, Project checkout 16px,
  and Composer 24px. The previously unannotated Split right control also moved from 4px to 12px.
- At 1280x800 in both light and dark appearance, the audited visible controls had no non-zero
  corner below 12px and the typed editor stayed within the Composer card.
- `bun run build:renderer`: passed TypeScript, Vite production build, source design check, and
  built-CSS design check; 0 new design violations and 35 semantic selectors generated.
- `bun script/verify/sdlc.ts` and `git diff --check`: passed.

Verdict: verified.

### Acceptance evidence

- AC-1: PASS — `bun test tests/designSystem.test.ts -t "radii|radius"` verified the 12px semantic floor.
- AC-2: PASS — recorded 811x998 computed styles measured Add, Run, and Scene controls at `12px`.
- AC-3: PASS — the same inspection measured split Open corners as `12/0/0/12` and `0/12/12/0`.
- AC-4: PASS — recorded computed styles measured Project health and checkout modules at `16px`.
- AC-5: PASS — `bun test tests/composerGeometryContract.test.ts` and rendered inspection retained the 24px Composer and contained editor.
- AC-6: PASS — recorded light/dark screenshots covered 811x998 and 1280x800 viewports. Evidence: `Verification record above`.
- AC-7: PASS — the two focused test commands, `bun run build:renderer`, `bun script/verify/sdlc.ts`, and `git diff --check` passed.

Residual risk: visual evidence sampled the recorded viewport and appearance matrix rather than
every platform font/rasterization combination.

## Behavioral evidence

- Sol's minimal independent review ran `bun test tests/composerGeometryContract.test.ts` with 3
  passes, then `bun test tests/designSystem.test.ts -t "radii|radius"` with 2 passes and 12
  assertions. `git diff --check` also passed.
- At 811x998 in both light and dark appearance, computed corners were Add action 12px, Run 12px,
  Scene 12px, Open `12/0/0/12`, Open More `0/12/12/0`, Project health 16px, Project checkout 16px,
  and Composer 24px. The previously unannotated Split right control also moved from 4px to 12px.
- At 1280x800 in both light and dark appearance, the audited visible controls had no non-zero
  corner below 12px and the typed editor stayed within the Composer card.
- `bun run build:renderer`: passed TypeScript, Vite production build, source design check, and
  built-CSS design check; 0 new design violations and 35 semantic selectors generated.
- `bun script/verify/sdlc.ts` and `git diff --check`: passed.

Verdict: verified.

### Acceptance evidence

- AC-1: PASS — `bun test tests/designSystem.test.ts -t "radii|radius"` verified the 12px semantic floor.
- AC-2: PASS — recorded 811x998 computed styles measured Add, Run, and Scene controls at `12px`.
- AC-3: PASS — the same inspection measured split Open corners as `12/0/0/12` and `0/12/12/0`.
- AC-4: PASS — recorded computed styles measured Project health and checkout modules at `16px`.
- AC-5: PASS — `bun test tests/composerGeometryContract.test.ts` and rendered inspection retained the 24px Composer and contained editor.
- AC-6: PASS — recorded light/dark screenshots covered 811x998 and 1280x800 viewports. Evidence: `Verification record above`.
- AC-7: PASS — the two focused test commands, `bun run build:renderer`, `bun script/verify/sdlc.ts`, and `git diff --check` passed.

Residual risk: visual evidence sampled the recorded viewport and appearance matrix rather than
every platform font/rasterization combination.

## Visual evidence

See bundle evidence/ when present.

## Security and privacy evidence

Not separately recorded unless present in legacy Verification.

## Deviations and residual risk

Residual risk: visual evidence sampled the recorded viewport and appearance matrix rather than

## Verdict

Verdict: verified..

## Review and release

No PR, merge, or release requested. Human product review remains the next lifecycle trigger.

## Feedback

The exact Browser annotations are the accepted geometry source; no viewport-only overrides or
preview attributes were copied into production code.
