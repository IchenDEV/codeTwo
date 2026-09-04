---
id: "2026-08-31-website-terminal-motion"
stage: spec
schema: 3
status: accepted
owner: ZCode
created: 2026-08-31
based_on: intent.md
risk: low
approved_by: "[chenli]"
approved_at: "2026-08-31"
---

# Spec: Terminal landing scroll motion (Apple-style)

## Requirements

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

## User experience

Not separately recorded in legacy change.md.

## Technical design

See Requirements and legacy Git history.

## Security and privacy

See migrated Decision and gates.

## Alternatives and non-goals

Not separately recorded in legacy change.md.

## Areas of concern

User `chenli` directly approved Intent and implementation through the current request on
2026-08-31 ("方案一 并增加动画 终端动画 类似苹果的页面滚动变化"), which also resolves the
pending skin decision tracked by change 2026-08-31-website-dual-theme. ZCode owns implementation
and verification. The user's standing GitHub Pages deployment authorization from the original
request covers the merge and deploy gate. No separate security, data, or migration gate applies.
No product release is requested.

## Acceptance criteria

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

## Decision

User `chenli` directly approved Intent and implementation through the current request on
2026-08-31 ("方案一 并增加动画 终端动画 类似苹果的页面滚动变化"), which also resolves the
pending skin decision tracked by change 2026-08-31-website-dual-theme. ZCode owns implementation
and verification. The user's standing GitHub Pages deployment authorization from the original
request covers the merge and deploy gate. No separate security, data, or migration gate applies.
No product release is requested.
