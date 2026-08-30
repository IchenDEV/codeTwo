---
id: change-2026-08-31-website-ui-detail-polish
kind: change
schema: 2
status: verified
risk: low
owner: ZCode
approvers: [chenli]
approved_at: 2026-08-31
created: 2026-08-31
updated: 2026-08-31
source: Direct user request in the current ZCode session on 2026-08-31 — refine landing UI details using a supplied reference screenshot (the Utter landing page, a dark terminal-style site with green accents)
inputs: The deployed Terminal landing page (custom.css, motion.css, light.css, both index.md files) and the supplied reference screenshot
outputs: Blinking block cursor on the hero headline, monospace hero body copy, muted nav links with a bordered locale chip, green-text GitHub CTA, and green-tinted primary buttons with a 6px radius — in dark and light modes, both languages
scope: website/, docs/sdlc/changes/2026-08-31-website-ui-detail-polish
next_trigger: User reviews the polished landing on the live site
verification_mode: owner
verified_by: ZCode
verified_at: 2026-08-31
---

# Landing UI detail polish (reference: Utter landing)

## Intent

The user supplied a reference screenshot (the Utter landing page — same dark terminal genre as
C2's site) and asked to refine the C2 landing's UI details against it. The reference's signature
details: a blinking block cursor after the headline, monospace body copy, muted lowercase-feel
navigation with a bordered locale chip, a green-text header CTA, and softly tinted primary
buttons.

Desired outcome: adopt those details on the C2 landing without changing its structure, content,
palette identity, motion system, or accessibility — the page should feel more finished, not
different.

Affected system: landing page styles and two small markup additions (cursor span). Docs pages,
deployment, and application code are out of scope.

## Spec

- Hero headline gains a blinking green block cursor after the terminal period (CSS rectangle
  sized in `ch`, reusing the existing `codetwo-cursor` keyframes), on both languages; static and
  invisible-in-end-state under reduced motion is acceptable, and the reduced-motion block keeps
  it solid to avoid a vanished glyph.
- Hero body paragraph switches from sans to the mono stack (17px, line-height 1.7, max-width
  700px); section paragraphs stay sans for readability.
- Desktop nav links render in `--home-muted` and turn green on hover (existing hover rule);
  the nav gap tightens from 54px to 36px and font size from 16px to 15px; the locale link
  (中文/English) becomes a bordered chip like the reference; the GitHub CTA text turns green with
  a green-tinted hover background.
- Primary buttons gain a subtle green-tinted background (rgb green 9% dark / 10% light, hover
  15%/14%) and the shared button radius moves 4px → 6px; secondary buttons keep the hairline
  outline.
- Light mode gets equivalent values (accent #157a2c tints) via `light.css`; the dark palette
  edits stay in `custom.css`.
- No new dependencies, fonts, or external requests. Reduced-motion guards untouched except the
  cursor-solid rule.
- Failure paths: purely presentational; worst case is a cosmetic regression caught in rendered
  review. Rollback is a git revert.

### Acceptance criteria

- [x] AC-1: `cd website && bun install --frozen-lockfile && bun run docs:build` completes
  successfully.
- [x] AC-2: Rendered screenshots prove the five details in dark mode (blinking cursor present in
  DOM and styled, mono hero paragraph, muted nav + locale chip + green CTA, tinted 6px primary
  buttons) with no layout breakage at 1440x900 and 390x844.
- [x] AC-3: Rendered screenshots prove the equivalent light-mode rendering (tinted buttons, chip,
  cursor) with readable contrast.
- [x] AC-4: `bun script/verify/sdlc.ts` passes, the change merges to main, the Pages deploy run
  succeeds, and the live site serves the polished build.
- [x] AC-5: The cursor animation respects reduced motion (static rule present; page content
  unaffected).

## Decision and gates

User `chenli` directly approved Intent and implementation through the current request on
2026-08-31 (reference screenshot + "参考这个优化ui 细节"). ZCode owns implementation and
verification. The user's standing GitHub Pages deployment authorization covers merge and deploy.
No security, data, or migration gate applies. No product release is requested.

## Plan

1. Create this Artifact in `executing` before implementation.
2. Append the detail-polish CSS block to `custom.css`; add light-mode equivalents to
   `light.css`; add the reduced-motion cursor rule to `motion.css`.
3. Add the cursor span to both hero headlines.
4. Build and verify rendered dark/light/mobile states.
5. Update this Artifact with evidence, run the SDLC check, commit, PR, merge, confirm deploy.

Affected modules: `website/index.md`, `website/zh/index.md`, `website/.vitepress/theme/`. Main
risk is a nav/contrast regression in either mode; mitigated by rendered screenshots in both
modes. Rollback is a normal source revert.

## Build

- Appended the detail-polish block to `custom.css`: `.hero-cursor` blinking green block (reusing
  the `codetwo-cursor` keyframes), the mono hero paragraph (17px/1.7, max-width 700px), the
  quieter nav (gap 36px, 15px links in `--home-muted`, bordered locale chip, green-text CTA with
  green-tinted hover), and green-tinted primary buttons with a 6px shared radius.
- Added light-mode equivalents to `light.css` (accent #157a2c tints at 10%/14% and an 8% CTA
  hover) and a reduced-motion rule to `motion.css` keeping the cursor solid when animation is
  disabled.
- Added the `hero-cursor` span (aria-hidden) after the terminal period in both hero headlines.
- No changes to palette identity, layout structure, motion timings, or docs pages.

## Verification

Verdict: verified.

Rendered inspection against the production build served by `vitepress preview`, real browser at
1440x900 and 390x844, dark and light:

- Computed-style checks in dark mode: cursor element present with `animation-name:
  codetwo-cursor`; hero paragraph uses the mono stack; nav links compute to `--home-muted`
  (rgb(169,175,169)); locale chip has a 1px border; CTA text is green; primary button computes
  6px radius and rgba(89,239,105,0.09) background.
- Light mode after toggling: primary button rgba(21,122,44,0.1), CTA text rgb(21,122,44) — the
  light equivalents hold.
- Rendered screenshots show the blinking cursor visible after "agent." in both modes (and in its
  hidden blink phase on the mobile second frame), mono body copy, muted nav with the bordered
  中文 chip, and tinted buttons; mobile 390x844 has no horizontal overflow.
- Reduced-motion: `motion.css` sets `.hero-cursor { animation: none }` so the cursor rests solid
  instead of vanishing (code-inspected; the environment cannot emulate the media query).

### Acceptance evidence

- AC-1: PASS — `cd website && bun install --frozen-lockfile && bun run docs:build` completed
  ("build complete in 1.42s").
- AC-2: PASS — `bun run docs:preview` served the build for inspection; rendered dark screenshots
  plus computed-style readouts:
  [polish-dark-hero](evidence/polish-dark-hero.png) (cursor, mono copy, muted nav, chip, green
  CTA, tinted buttons); mobile
  [polish-mobile-hero](evidence/polish-mobile-hero.png) with `scrollWidth == clientWidth`.
- AC-3: PASS — `home-light` toggled via the header switch in the rendered browser; light-mode
  screenshots:
  [polish-light-hero](evidence/polish-light-hero.png) with computed rgba(21,122,44,0.1) button
  and dark-green CTA.
- AC-4: PASS — [PR #201](https://github.com/IchenDEV/codeTwo/pull/201) merged to main; the
  "Deploy docs to GitHub Pages" run 33335173790 completed successfully; `curl
  https://blogs.idevlab.dev/codeTwo/` returned HTTP 200 with the `hero-cursor` markup present and
  the served stylesheet containing the `hero-cursor` polish rules.
- AC-5: PASS — the reduced-motion block sets `.hero-cursor { animation: none }` and the page
  content (headline text, period) renders identically without the cursor animation.

Residual risk: the blinking cursor is decorative motion; under reduced motion it rests solid
rather than animating, which is the intended terminal look. The `ch`-sized cursor assumes the
monospace headline font — it inherits the h1 stack, so it stays proportional in both languages.

## Review and release

Approval: the user authorized GitHub Pages deployment in the original request; PR merge on
2026-08-31 happens under that standing authorization.
Release target: none — the deliverable is the website, continuously deployed to GitHub Pages by
the existing `pages.yml` workflow.
Release identity: not applicable.
Smoke evidence: after deploy run 33335173790 succeeded, the live site at
https://blogs.idevlab.dev/codeTwo/ returned HTTP 200 and serves the polished build (hero-cursor
markup and stylesheet rules present).
Rollback: revert the polish commit on main and let the Pages workflow redeploy.
No release: no product release is intended; the deployed website is the final artifact.

## Feedback

No feedback exists yet; the user's review of the polished landing on the live site will be
recorded here.
