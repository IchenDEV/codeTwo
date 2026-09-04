---
id: "2026-08-29-composer-surface-geometry"
stage: verification
schema: 3
status: passed
owner: codex
created: 2026-08-29
based_on: plan.md
commit: ""
verification_mode: owner
verified_by: "codex"
verified_at: "2026-08-29"
release_target: none
release_identity: ""
---

# Verification: Keep the composer surface aligned with its editor

## Automated checks

- `bun test tests/composerGeometryContract.test.ts`: 3 passed, 0 failed, 24 assertions.
- `bun run build:renderer`: passed TypeScript, Vite production build, source design check, and
  built-CSS design check; 0 new design violations and 35 semantic selectors generated.
- Browser-rendered checks at 811x998 and 1280x800 in both light and dark appearance kept the compact
  radius at 24px. With `q`, the editor bounds remained within the 203px card. A 12-line draft grew
  the card to 282px and kept its 191px scrollport inside the card while exposing 419px of scroll
  content.
- Expanding changed `data-composer-mode` to `document`; collapsing restored `compact`; the `q`
  draft survived both transitions.
- Safari WebKit accessibility readback confirmed the same prompt accepted `q` and preserved it
  across expand and collapse. Safari's web-content screenshot capture returned a blank protected
  surface, so exact visual geometry comes from the four Browser screenshots and computed styles.
- `bun script/verify/sdlc.ts` and `git diff --check`: passed. The existing C2 Core process and its
  data directory were not restarted or shared during validation.

Verdict: verified.

### Acceptance evidence

- AC-1: PASS — recorded Browser bounding boxes at default and 12-line states kept editor and controls inside the compact card. Evidence: `Verification record above`.
- AC-2: PASS — computed styles at 811px and 1280px retained the semantic `24px` compact radius.
- AC-3: PASS — the recorded expand/collapse interaction preserved the `q` draft in both directions.
- AC-4: PASS — `bun test tests/composerGeometryContract.test.ts`, `bun run build:renderer`, `bun script/verify/sdlc.ts`, console inspection, and `git diff --check` passed.

Residual risk: Safari protected-surface screenshot capture was unavailable, so visual geometry
relies on the recorded Browser screenshots, accessibility readback, and computed styles.

## Behavioral evidence

- `bun test tests/composerGeometryContract.test.ts`: 3 passed, 0 failed, 24 assertions.
- `bun run build:renderer`: passed TypeScript, Vite production build, source design check, and
  built-CSS design check; 0 new design violations and 35 semantic selectors generated.
- Browser-rendered checks at 811x998 and 1280x800 in both light and dark appearance kept the compact
  radius at 24px. With `q`, the editor bounds remained within the 203px card. A 12-line draft grew
  the card to 282px and kept its 191px scrollport inside the card while exposing 419px of scroll
  content.
- Expanding changed `data-composer-mode` to `document`; collapsing restored `compact`; the `q`
  draft survived both transitions.
- Safari WebKit accessibility readback confirmed the same prompt accepted `q` and preserved it
  across expand and collapse. Safari's web-content screenshot capture returned a blank protected
  surface, so exact visual geometry comes from the four Browser screenshots and computed styles.
- `bun script/verify/sdlc.ts` and `git diff --check`: passed. The existing C2 Core process and its
  data directory were not restarted or shared during validation.

Verdict: verified.

### Acceptance evidence

- AC-1: PASS — recorded Browser bounding boxes at default and 12-line states kept editor and controls inside the compact card. Evidence: `Verification record above`.
- AC-2: PASS — computed styles at 811px and 1280px retained the semantic `24px` compact radius.
- AC-3: PASS — the recorded expand/collapse interaction preserved the `q` draft in both directions.
- AC-4: PASS — `bun test tests/composerGeometryContract.test.ts`, `bun run build:renderer`, `bun script/verify/sdlc.ts`, console inspection, and `git diff --check` passed.

Residual risk: Safari protected-surface screenshot capture was unavailable, so visual geometry
relies on the recorded Browser screenshots, accessibility readback, and computed styles.

## Visual evidence

See bundle evidence/ when present.

## Security and privacy evidence

Not separately recorded unless present in legacy Verification.

## Deviations and residual risk

Residual risk: Safari protected-surface screenshot capture was unavailable, so visual geometry

## Verdict

Verdict: verified..

## Review and release

No PR, merge, or release requested. Human product review remains the next lifecycle trigger.

## Feedback

The user's follow-up radius annotations were implemented separately through the shared semantic
radius contract in `change-2026-08-29-semantic-radius-floor`.
