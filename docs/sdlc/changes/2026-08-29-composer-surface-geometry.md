---
id: change-2026-08-29-composer-surface-geometry
kind: change
status: verified
owner: codex
created: 2026-08-29
updated: 2026-08-29
next_trigger: human review accepts the rendered interaction and release risk
---

# Keep the composer surface aligned with its editor

## Intent

The user reported the new-task composer from a live macOS window with its typed text outside the
painted input surface and followed up that the surface corner radius had grown into an oversized
pill. The desired outcome is a stable Mac-sized card whose background, focus treatment, editor, and controls
share one geometry at every supported height. This change is limited to the main prompt composer;
the small send and stop button effects are not part of the defect.

## Spec

The compact composer must use the existing semantic composer radius and paint its background,
shadow, and focus ring on the same DOM card that contains the editor and controls. Expanding or
collapsing the document must not leave a decorative silhouette behind. The expanded document
continues to use the workspace surface without card chrome.

### Acceptance criteria

- [x] In compact mode, typed text, controls, background, and focus treatment remain inside the same
      card at the default and a tall-content state; verify with rendered bounding boxes and screenshots.
- [x] The compact card keeps the semantic 24px composer radius instead of scaling the radius with
      height; verify from computed style at desktop and narrow widths.
- [x] Expanding and collapsing preserves the draft and does not leave a stale surface; verify by
      typing, toggling both ways, and reading the draft after each transition.
- [x] The focused regression test, renderer build, SDLC check, and relevant console check pass.

## Decision and gates

Intent and UX acceptance are supplied directly by the user's 2026-08-29 screenshot and follow-up
message. No permission to publish, merge, or release is implied.

## Plan

Remove the separately observed liquid silhouette from the main composer, restore the existing
card-owned semantic background, shadow, and focus treatment, and update the geometry contract. Keep liquid motion
on the isolated circular actions. Validate with the narrowest relevant automated checks and a
real rendered interaction loop. Rollback is the inverse source change.

## Build

The compact Composer now paints its semantic card background, shadow, and focus treatment on the
same DOM card that contains BlockNote and its controls. The separate liquid SVG backdrop was
removed from the main input while the isolated circular action effects remain. The geometry
contract rejects reintroducing that second surface.

## Verification

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
- `python3 script/check_sdlc.py` and `git diff --check`: passed. The existing C2 Core process and its
  data directory were not restarted or shared during validation.

## Review and release

No PR, merge, or release requested. Human product review remains the next lifecycle trigger.

## Feedback

The user's follow-up radius annotations were implemented separately through the shared semantic
radius contract in `change-2026-08-29-semantic-radius-floor`.
