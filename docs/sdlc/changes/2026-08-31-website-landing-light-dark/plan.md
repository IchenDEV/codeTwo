---
id: "2026-08-31-website-landing-light-dark"
stage: plan
schema: 3
status: accepted
owner: ZCode
created: 2026-08-31
based_on: spec.md
risk: low
scope: website/, docs/sdlc/changes/2026-08-31-website-landing-light-dark
approved_by: "[chenli]"
approved_at: "2026-08-31"
---

# Plan: Landing page light/dark themes

## Files and ownership

website/, docs/sdlc/changes/2026-08-31-website-landing-light-dark

## Order of work

1. Create this Artifact in `executing` before implementation.
2. Add the pre-paint inline script to `website/.vitepress/config.mts`.
3. Add `website/.vitepress/theme/light.css` (light palette overrides) and
   `website/.vitepress/theme/appearance.ts` (toggle wiring); import the stylesheet from the theme
   entry; append the toggle button styles to `custom.css`.
4. Add the toggle button markup to both landing pages (desktop nav and mobile menu) and call the
   appearance module from each page's `<script setup>`.
5. Build locally; verify dark is unchanged, light renders fully in both languages, the toggle
   persists, and the meta updates.
6. Update this Artifact with evidence, run the SDLC contract check, commit, PR, merge, and
   confirm the live deployment.

Affected modules: `website/index.md`, `website/zh/index.md`, `website/.vitepress/`. Main risk is
a missed hardcoded dark color in light mode (mitigated by a full-page light screenshot sweep in
both languages) and a mode flash on load (mitigated by the pre-paint head script). Rollback is a
normal source revert.

## Test-first proof

See legacy Verification section.

## Visual or integration proof

See legacy Verification section.

## Risks and mitigations

See legacy Decision and gates.

## Rollback

See legacy Review and release.

## Deviations

- Added the pre-paint inline script to `website/.vitepress/config.mts`: it adds `home-light` to
  `<html>` before first paint when `vitepress-theme-appearance` is "light", or when unset/"auto"
  and `prefers-color-scheme: light` matches.
- Added `website/.vitepress/theme/light.css`: the paper-terminal palette under `html.home-light`
  (frame #ccd2c7, page #f1f3ec, ink #1a241b, accent #157a2c), covering window chrome, header,
  softened scanlines, buttons and hover states, secondary-button borders, screenshot shadows,
  provider index labels, architecture node fills, footer, selection colors, and a logo swap to a
  new ink-stroke `website/public/logo-ink.svg` (the default logo strokes are tuned for dark
  backgrounds and vanish on paper).
- Added `website/.vitepress/theme/appearance.ts`, wired from both landing pages' `<script
  setup>`: header toggle clicks flip `home-light`, persist "light"/"dark" into VitePress's
  appearance key, update the `theme-color` meta (`#f1f3ec` / `#030504`), and set `aria-pressed`.
- Added the toggle button (sun icon in dark, moon in light, localized labels) to the desktop nav
  and the mobile menu of both landing pages, with base styles appended to `custom.css`.
- The dark palette in `custom.css` was not edited; the base logo files are unchanged.

## Decision

User `chenli` directly approved Intent and implementation through the current request on
2026-08-31 ("支持light / dark"). ZCode owns implementation and verification. The user's standing
GitHub Pages deployment authorization covers the merge and deploy gate. No separate security,
data, or migration gate applies. No product release is requested.
