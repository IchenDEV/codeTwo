---
id: "2026-08-31-website-terminal-motion"
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

# Verification: Terminal landing scroll motion (Apple-style)

## Automated checks

Verdict: verified.

Rendered inspection was performed against the production VitePress build served locally via
`vitepress preview` (ports 4180/4181) in a real browser at 1440x900 and 390x844.

- The Modern skin and toggle are gone: `grep` over `website/` sources finds no `theme-modern`,
  `style-toggle`, or `c2-home-style`; the landing pages render the unchanged Terminal design.
- Entrance motion on load: the hero command types itself, and the headline, copy, actions, meta,
  and screenshot rise in with staggered delays before settling.
- Architecture scrub on the 1440x900 viewport: at stage progress 0 only "Coding CLIs" is visible;
  at ~30% ACP and its arrow appear (stage-2); at ~55% the Rust core and second arrow appear
  (stage-3); at ~90% the branch lines and Desktop/TUI/Remote outputs appear (stage-4, outputs at
  computed opacity 1). Flow classes matched each screenshot.
- Providers section: all 11 entries reveal with a cascade and the facts panel and heading settle
  fully visible; the section command shows complete text even after jumping straight to the
  section (the scrolled-past fix).
- Mobile 390x844: `scrub-active` is not set, the flow is `position: static` inside its natural
  700px stage, the diagram reveals as one unit, and the hero entrance plays without clipping.
- Headless-render caveat: this automation browser only produces frames on demand, so
  IntersectionObserver/rAF callbacks settle between forced frames; every checked state was read
  after a frame-forcing screenshot. Real browsers render continuously and are not affected.

### Acceptance evidence

- AC-1: PASS — `cd website && bun install --frozen-lockfile && bun run docs:build` completed
  cleanly twice ("build complete in 1.51s" on the final build).
- AC-2: PASS — `grep -rn "theme-modern|style-toggle|c2-home-style"` over
  `website/index.md`, `website/zh/index.md`, and `website/.vitepress/theme/` returns nothing, and
  rendered pages show only the Terminal skin; see
  [motion-desktop-hero](evidence/motion-desktop-hero.png).
- AC-3: PASS — `bun run docs:preview` served the build for rendered inspection; screenshots
  show the entrance hero, the provider cascade settled state, and complete command text after
  skip-scrolls:
  [motion-desktop-hero](evidence/motion-desktop-hero.png),
  [motion-providers-revealed](evidence/motion-providers-revealed.png),
  [motion-mobile-hero](evidence/motion-mobile-hero.png); page-state readouts confirmed
  `is-visible` classes and typed command strings.
- AC-4: PASS — `[data-architecture-flow]` classes matched each scroll offset in the rendered
  browser; screenshots of successive stage states:
  [motion-arch-stage-0](evidence/motion-arch-stage-0.png) (`architecture-flow is-visible`),
  [motion-arch-stage-2](evidence/motion-arch-stage-2.png) (`stage-2`),
  [motion-arch-stage-3](evidence/motion-arch-stage-3.png) (`stage-2 stage-3`),
  [motion-arch-stage-4](evidence/motion-arch-stage-4.png) (`stage-2 stage-3 stage-4`, all output
  nodes at opacity 1); mobile fallback proven by
  [motion-mobile-architecture](evidence/motion-mobile-architecture.png) with `scrub-active`
  unset, `position: static`, and a natural-height stage; the reduced-motion path exits before
  arming (code guard verified by reading `motion.ts`; class list confirmed absent of
  `motion-ready` behavior changes because the media query is environment-dependent).
- AC-5: PASS — [PR #196](https://github.com/IchenDEV/codeTwo/pull/196) merged to main; the
  "Deploy docs to GitHub Pages" run 33332088008 completed successfully; `curl
  https://blogs.idevlab.dev/codeTwo/` returned HTTP 200 with `data-motion` markup present, zero
  `theme-modern`/`style-toggle` remnants, and `motion-ready`/`architecture-stage` rules present
  in the served stylesheet.

Residual risk: the sticky scrub depends on `overflow: clip` (Chrome 90+/Safari 16+/Firefox 81+);
older browsers silently fall back to the non-sticky static reveal. Reveal animations hide content
only between arming and first intersection; a visitor who somehow never triggers IntersectionObserver
would still see all content because arming is JS-gated. The scroll-past command fix relies on the
rAF scroll loop and was verified in-browser.

## Behavioral evidence

Verdict: verified.

Rendered inspection was performed against the production VitePress build served locally via
`vitepress preview` (ports 4180/4181) in a real browser at 1440x900 and 390x844.

- The Modern skin and toggle are gone: `grep` over `website/` sources finds no `theme-modern`,
  `style-toggle`, or `c2-home-style`; the landing pages render the unchanged Terminal design.
- Entrance motion on load: the hero command types itself, and the headline, copy, actions, meta,
  and screenshot rise in with staggered delays before settling.
- Architecture scrub on the 1440x900 viewport: at stage progress 0 only "Coding CLIs" is visible;
  at ~30% ACP and its arrow appear (stage-2); at ~55% the Rust core and second arrow appear
  (stage-3); at ~90% the branch lines and Desktop/TUI/Remote outputs appear (stage-4, outputs at
  computed opacity 1). Flow classes matched each screenshot.
- Providers section: all 11 entries reveal with a cascade and the facts panel and heading settle
  fully visible; the section command shows complete text even after jumping straight to the
  section (the scrolled-past fix).
- Mobile 390x844: `scrub-active` is not set, the flow is `position: static` inside its natural
  700px stage, the diagram reveals as one unit, and the hero entrance plays without clipping.
- Headless-render caveat: this automation browser only produces frames on demand, so
  IntersectionObserver/rAF callbacks settle between forced frames; every checked state was read
  after a frame-forcing screenshot. Real browsers render continuously and are not affected.

### Acceptance evidence

- AC-1: PASS — `cd website && bun install --frozen-lockfile && bun run docs:build` completed
  cleanly twice ("build complete in 1.51s" on the final build).
- AC-2: PASS — `grep -rn "theme-modern|style-toggle|c2-home-style"` over
  `website/index.md`, `website/zh/index.md`, and `website/.vitepress/theme/` returns nothing, and
  rendered pages show only the Terminal skin; see
  [motion-desktop-hero](evidence/motion-desktop-hero.png).
- AC-3: PASS — `bun run docs:preview` served the build for rendered inspection; screenshots
  show the entrance hero, the provider cascade settled state, and complete command text after
  skip-scrolls:
  [motion-desktop-hero](evidence/motion-desktop-hero.png),
  [motion-providers-revealed](evidence/motion-providers-revealed.png),
  [motion-mobile-hero](evidence/motion-mobile-hero.png); page-state readouts confirmed
  `is-visible` classes and typed command strings.
- AC-4: PASS — `[data-architecture-flow]` classes matched each scroll offset in the rendered
  browser; screenshots of successive stage states:
  [motion-arch-stage-0](evidence/motion-arch-stage-0.png) (`architecture-flow is-visible`),
  [motion-arch-stage-2](evidence/motion-arch-stage-2.png) (`stage-2`),
  [motion-arch-stage-3](evidence/motion-arch-stage-3.png) (`stage-2 stage-3`),
  [motion-arch-stage-4](evidence/motion-arch-stage-4.png) (`stage-2 stage-3 stage-4`, all output
  nodes at opacity 1); mobile fallback proven by
  [motion-mobile-architecture](evidence/motion-mobile-architecture.png) with `scrub-active`
  unset, `position: static`, and a natural-height stage; the reduced-motion path exits before
  arming (code guard verified by reading `motion.ts`; class list confirmed absent of
  `motion-ready` behavior changes because the media query is environment-dependent).
- AC-5: PASS — [PR #196](https://github.com/IchenDEV/codeTwo/pull/196) merged to main; the
  "Deploy docs to GitHub Pages" run 33332088008 completed successfully; `curl
  https://blogs.idevlab.dev/codeTwo/` returned HTTP 200 with `data-motion` markup present, zero
  `theme-modern`/`style-toggle` remnants, and `motion-ready`/`architecture-stage` rules present
  in the served stylesheet.

Residual risk: the sticky scrub depends on `overflow: clip` (Chrome 90+/Safari 16+/Firefox 81+);
older browsers silently fall back to the non-sticky static reveal. Reveal animations hide content
only between arming and first intersection; a visitor who somehow never triggers IntersectionObserver
would still see all content because arming is JS-gated. The scroll-past command fix relies on the
rAF scroll loop and was verified in-browser.

## Visual evidence

See bundle evidence/ when present.

## Security and privacy evidence

Not separately recorded unless present in legacy Verification.

## Deviations and residual risk

Residual risk: the sticky scrub depends on `overflow: clip` (Chrome 90+/Safari 16+/Firefox 81+);

## Verdict

Verdict: verified..

## Review and release

Approval: the user authorized GitHub Pages deployment in the original request; PR #196 was
merged on 2026-08-31 under that standing authorization
([PR #196](https://github.com/IchenDEV/codeTwo/pull/196)).
Review surface: [PR #196](https://github.com/IchenDEV/codeTwo/pull/196).
Release target: none — the deliverable is the website, continuously deployed to GitHub Pages by
the existing `pages.yml` workflow.
Release identity: not applicable.
Smoke evidence: after deploy run 33332088008 succeeded, the live site at
https://blogs.idevlab.dev/codeTwo/ returned HTTP 200, serves the `data-motion` markup and the
`motion-ready`/`architecture-stage` stylesheet rules, and contains no `theme-modern` or
`style-toggle` remnants.
Rollback: revert the motion commit on main and let the Pages workflow redeploy.
No release: no product release is intended; the deployed website is the final artifact.

## Feedback

No feedback exists yet; the user's animation review of the deployed homepage will be recorded
here.
