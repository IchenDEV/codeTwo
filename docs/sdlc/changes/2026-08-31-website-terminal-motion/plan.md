---
id: "2026-08-31-website-terminal-motion"
stage: plan
schema: 3
status: accepted
owner: ZCode
created: 2026-08-31
based_on: spec.md
risk: low
scope: website/, docs/sdlc/changes/2026-08-31-website-terminal-motion, docs/sdlc/changes/2026-08-31-website-dual-theme
approved_by: "[chenli]"
approved_at: "2026-08-31"
---

# Plan: Terminal landing scroll motion (Apple-style)

## Files and ownership

website/, docs/sdlc/changes/2026-08-31-website-terminal-motion, docs/sdlc/changes/2026-08-31-website-dual-theme

## Order of work

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

## Test-first proof

See legacy Verification section.

## Visual or integration proof

See legacy Verification section.

## Risks and mitigations

See legacy Decision and gates.

## Rollback

See legacy Review and release.

## Deviations

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

## Decision

User `chenli` directly approved Intent and implementation through the current request on
2026-08-31 ("方案一 并增加动画 终端动画 类似苹果的页面滚动变化"), which also resolves the
pending skin decision tracked by change 2026-08-31-website-dual-theme. ZCode owns implementation
and verification. The user's standing GitHub Pages deployment authorization from the original
request covers the merge and deploy gate. No separate security, data, or migration gate applies.
No product release is requested.
