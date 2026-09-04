---
id: "2026-08-31-website-ui-detail-polish"
stage: plan
schema: 3
status: accepted
owner: ZCode
created: 2026-08-31
based_on: spec.md
risk: low
scope: website/, docs/sdlc/changes/2026-08-31-website-ui-detail-polish
approved_by: "[chenli]"
approved_at: "2026-08-31"
---

# Plan: Landing UI detail polish (reference: Utter landing)

## Files and ownership

website/, docs/sdlc/changes/2026-08-31-website-ui-detail-polish

## Order of work

1. Create this Artifact in `executing` before implementation.
2. Append the detail-polish CSS block to `custom.css`; add light-mode equivalents to
   `light.css`; add the reduced-motion cursor rule to `motion.css`.
3. Add the cursor span to both hero headlines.
4. Build and verify rendered dark/light/mobile states.
5. Update this Artifact with evidence, run the SDLC check, commit, PR, merge, confirm deploy.

Affected modules: `website/index.md`, `website/zh/index.md`, `website/.vitepress/theme/`. Main
risk is a nav/contrast regression in either mode; mitigated by rendered screenshots in both
modes. Rollback is a normal source revert.

## Test-first proof

See legacy Verification section.

## Visual or integration proof

See legacy Verification section.

## Risks and mitigations

See legacy Decision and gates.

## Rollback

See legacy Review and release.

## Deviations

- Appended the detail-polish block to `custom.css`: `.hero-cursor` blinking green block (reusing
  the `codetwo-cursor` keyframes), the mono hero paragraph (17px/1.7, max-width 700px), the
  quieter nav (gap 36px, 15px links in `--home-muted`, bordered locale chip, green-text CTA with
  green-tinted hover), and green-tinted primary buttons with a 6px shared radius.
- Added light-mode equivalents to `light.css` (accent #157a2c tints at 10%/14% and an 8% CTA
  hover) and a reduced-motion rule to `motion.css` keeping the cursor solid when animation is
  disabled.
- Added the `hero-cursor` span (aria-hidden) after the terminal period in both hero headlines.
- No changes to palette identity, layout structure, motion timings, or docs pages.

## Decision

User `chenli` directly approved Intent and implementation through the current request on
2026-08-31 (reference screenshot + "参考这个优化ui 细节"). ZCode owns implementation and
verification. The user's standing GitHub Pages deployment authorization covers merge and deploy.
No security, data, or migration gate applies. No product release is requested.
