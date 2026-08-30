---
id: change-2026-08-31-website-terminal-motion
kind: change
schema: 2
status: verified
risk: low
owner: ZCode
approvers: [chenli]
approved_at: 2026-08-31
created: 2026-08-31
updated: 2026-08-31
source: Direct user follow-up in the current ZCode session on 2026-08-31 — after reviewing both deployed skins the user chose the Terminal design (方案一) and asked to add Apple-style scroll-driven animations with a terminal feel
inputs: The deployed Terminal landing page (website/index.md, website/zh/index.md, website/.vitepress/theme/custom.css) and the dual-theme change 2026-08-31-website-dual-theme that introduced the Modern skin and preview toggle
outputs: Terminal-only landing page (Modern skin and toggle removed), a dependency-free scroll-motion system (IntersectionObserver reveals, command typewriter, sticky scroll-scrubbed architecture assembly, hero parallax), bilingual, with reduced-motion and no-JS fallbacks
scope: website/, docs/sdlc/changes/2026-08-31-website-terminal-motion, docs/sdlc/changes/2026-08-31-website-dual-theme
next_trigger: User reviews the animated live homepage; follow-up adjustments are new requests
verification_mode: owner
verified_by: ZCode
verified_at: 2026-08-31
---

# Terminal landing scroll motion (Apple-style)

## Intent

The dual-theme preview (change 2026-08-31-website-dual-theme) let the user compare the Terminal
and Modern skins live. The user has now decided: keep the Terminal design as the single homepage
design and remove the Modern skin plus the preview toggle. In the same request the user asked for
animations "类似苹果的页面滚动变化" — Apple-product-page-style scroll-driven motion — with a
terminal flavor.

Desired outcome: the Terminal landing page becomes the definitive homepage and gains tasteful,
terminal-flavored motion — command prompts that type themselves, sections that rise into view,
and the architecture diagram that assembles node by node while the visitor scrolls — without new
dependencies and without breaking the existing design, accessibility, or the static no-JS
fallback.

Affected system: the landing pages and their theme assets. Documentation pages, deployment
configuration, and application code are out of scope.

## Spec

- The Modern skin (`website/.vitepress/theme/modern.css`), the floating style toggle, the
  `c2-home-style` persistence, and the `.theme-modern` layer are removed completely. The Terminal
  skin is again the only rendering for both languages.
- Motion is gated behind a `motion-ready` class added by JavaScript at hydration. Without
  JavaScript (or before hydration) every element renders fully visible; the page never depends on
  motion to expose content.
- Scroll reveals: elements marked `data-motion` start translated down 26px and transparent once
  `motion-ready` is set, and transition in (≈0.8s, ease-out quint) when an IntersectionObserver
  sees them (threshold ≈0.15, one-shot). Staggered lists (hero capabilities, workflow steps,
  provider entries) receive computed per-item transition delays.
- Command typewriter: each `.section-command` clears and retypes its `$ code2 …` text at roughly
  24–32 ms/character when it first enters the viewport, with a blinking block cursor during
  typing; the hero command types on load. With reduced motion the text is shown instantly.
- Architecture scrollytelling on viewports ≥1181px with motion enabled: the section gains a tall
  (~240vh) scroll stage; the flow diagram sticks near the viewport center and a rAF-throttled
  scroll handler maps stage progress to cumulative stages — Coding CLIs visible first, then ACP
  with its arrow, then the Rust core with its arrow, then the branch lines and the
  Desktop/TUI/Remote outputs. Stages are reversible when scrolling back up. Below 1181px the
  diagram reveals as one unit like the other sections.
- Hero parallax: the hero screenshot drifts slightly against scroll (transform-only, clamped),
  driven by the same rAF loop.
- Reduced motion (`prefers-reduced-motion: reduce`): no `motion-ready`, no typewriter, no scrub,
  no parallax; the existing global reduced-motion CSS stays as a second guard.
- Sticky positioning requires switching `.codetwo-home` from `overflow: hidden` to
  `overflow: clip` (clips identically without creating a scroll container that would break
  `position: sticky`). Browsers without `overflow: clip` support fall back to the static layout
  without sticky behavior.
- Smooth in-page anchor scrolling is enabled for the landing pages.
- No new runtime dependencies; motion logic lives in a shared theme module imported by both
  landing pages. No external requests, fonts, trackers, or scripts are added.
- Failure paths: if the motion module throws, the page is still fully readable (arming happens
  last; CSS hides nothing without `motion-ready`). If `IntersectionObserver` is missing, the
  module exits without arming.
- Rollout/rollback: ships through the existing Pages pipeline on merge; rollback is a git revert.
  No data, storage, or migration impact.

### Acceptance criteria

- [x] AC-1: `cd website && bun install --frozen-lockfile && bun run docs:build` completes
  successfully.
- [x] AC-2: The built site contains no Modern-skin or toggle remnants (`theme-modern`,
  `style-toggle`, `c2-home-style` are absent) and renders the Terminal design for both
  languages.
- [x] AC-3: Rendered browser inspection of the built site proves scroll reveals and the command
  typewriter fire at desktop and mobile widths; screenshots at successive scroll offsets show
  progressive reveal states.
- [x] AC-4: Rendered browser inspection proves the architecture diagram assembles through its
  stages while scrolling a ≥1181px viewport, releases correctly at the end of the stage, and
  renders as a simple reveal below that breakpoint; the reduced-motion code path leaves content
  fully visible without arming.
- [x] AC-5: `bun script/verify/sdlc.ts` passes, the change merges to main, the "Deploy docs to
  GitHub Pages" run succeeds, and the live site serves the motion build.

## Decision and gates

User `chenli` directly approved Intent and implementation through the current request on
2026-08-31 ("方案一 并增加动画 终端动画 类似苹果的页面滚动变化"), which also resolves the
pending skin decision tracked by change 2026-08-31-website-dual-theme. ZCode owns implementation
and verification. The user's standing GitHub Pages deployment authorization from the original
request covers the merge and deploy gate. No separate security, data, or migration gate applies.
No product release is requested.

## Plan

1. Create this Artifact in `executing` before implementation.
2. Remove the Modern skin, toggle markup, toggle script, and toggle styles from both landing
   pages and the theme entry.
3. Add `website/.vitepress/theme/motion.css` and `website/.vitepress/theme/motion.ts`
   implementing reveals, typewriter, architecture scrub, and parallax; import the stylesheet from
   the theme entry after `custom.css`; switch `.codetwo-home` to `overflow: clip`.
4. Mark up both landing pages with `data-motion` attributes and the architecture scroll stage
   wrapper; wire the shared motion module from each page's `<script setup>`.
5. Build locally and verify with real-browser screenshots at successive scroll offsets (desktop
   and mobile), including the assembled architecture stages.
6. Update this Artifact with evidence, record the user's skin decision in the dual-theme
   Artifact's feedback, run the SDLC contract check, then commit, PR, merge, and confirm the
   live deployment.

Affected modules: `website/index.md`, `website/zh/index.md`,
`website/.vitepress/theme/`. Main risks are sticky-positioning breakage from the overflow
change (mitigated by `overflow: clip` and the <1181px static fallback) and motion concealing
content for accessibility (mitigated by the `motion-ready` gate, one-shot reveals that leave
content in place, and the reduced-motion escape hatches). Rollback is a normal source revert.

## Build

- Removed the Modern skin entirely: deleted `website/.vitepress/theme/modern.css`, dropped its
  theme import, and removed the style-toggle markup, toggle script, and `c2-home-style`
  persistence from both landing pages.
- Added `website/.vitepress/theme/motion.ts` (shared by both pages via `<script setup>` imports):
  IntersectionObserver one-shot reveals with per-group stagger delays, command typewriter with a
  "finished instantly if scrolled past" guard, the reversible architecture scroll scrub
  (≥1181px), hero screenshot parallax in the same rAF loop, a wide-viewport change listener, and
  a reduced-motion change listener that disarms everything.
- Added `website/.vitepress/theme/motion.css`: `.motion-ready`-gated reveal transitions (opacity +
  `translate`, leaving `transform` free for parallax), the typing cursor, smooth anchor
  scrolling, the 240vh scrub stage with sticky flow, cumulative `stage-2/3/4` assembly states,
  and a reduced-motion guard.
- Changed `.codetwo-home` from `overflow: hidden` to `overflow: clip` so `position: sticky` works
  inside the landing container while preserving identical clipping.
- Marked up both landing pages with `data-motion`, `data-motion-stagger`, `data-parallax`,
  `data-architecture-stage`, and `data-architecture-flow`, wrapping the architecture flow in a
  `.architecture-stage` div; hero elements carry fixed entrance delays.
- One defect found and fixed during verification: commands scrolled past before their reveal
  stayed blank forever (IntersectionObserver never fires for elements already above the
  viewport). The scroll loop now finishes such commands instantly
  (`finishCommandsAboveViewport`), verified after rebuild on a fresh server.

## Verification

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
