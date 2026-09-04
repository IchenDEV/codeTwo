---
id: "2026-08-31-website-ui-detail-polish"
stage: verification
schema: 3
status: passed
owner: ZCode
created: 2026-08-31
based_on: plan.md
commit: ""
verification_mode: owner
verified_by: "ZCode"
verified_at: "2026-08-31"
release_target: none — the deliverable is the website, continuously deployed to GitHub Pages by
release_identity: "not applicable."
---

# Verification: Landing UI detail polish (reference: Utter landing)

## Automated checks

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

## Behavioral evidence

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

## Visual evidence

See bundle evidence/ when present.

## Security and privacy evidence

Not separately recorded unless present in legacy Verification.

## Deviations and residual risk

Residual risk: the blinking cursor is decorative motion; under reduced motion it rests solid

## Verdict

Verdict: verified..

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
