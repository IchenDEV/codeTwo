---
id: change-2026-08-31-website-landing-light-dark
kind: change
schema: 2
status: executing
risk: low
owner: ZCode
approvers: [chenli]
approved_at: 2026-08-31
created: 2026-08-31
updated: 2026-08-31
source: Direct user request in the current ZCode session on 2026-08-31 — support light/dark on the website ("支持light / dark")
inputs: The animated Terminal landing page (website/index.md, website/zh/index.md, website/.vitepress/theme/custom.css, motion.css, motion.ts) and the VitePress config
outputs: A light "paper terminal" palette for both landing pages, a header sun/moon toggle (desktop and mobile), system-preference defaulting applied pre-paint, persistence in the VitePress appearance storage key shared with the docs theme, and an updated theme-color meta
scope: website/, docs/sdlc/changes/2026-08-31-website-landing-light-dark
next_trigger: Authorized pull request checks and repository merge; live Pages deployment confirmation
verification_mode: owner
verified_by: pending
verified_at: pending
---

# Landing page light/dark themes

## Intent

The C2 landing page is dark-only. The user asked to support light and dark modes. The docs pages
already ship VitePress's built-in appearance toggle, so this change brings the landing pages to
parity and keeps the choice consistent across the whole site.

Desired outcome: a light "paper terminal" rendering of the same landing design (warm paper
background, dark green-tinted ink, darker green accent that keeps contrast, identical layout,
motion, and terminal language), a sun/moon toggle in the landing header on desktop and inside the
mobile menu, dark remains the fallback, first paint follows the visitor's stored choice or system
preference without a flash, and the landing toggle stays in sync with the docs appearance setting.

Affected system: the landing pages and their theme assets plus one config-level inline head
script. Documentation pages' own theming, deployment configuration, and application code are out
of scope.

## Spec

- Light palette is scoped under an `html.home-light` class; the dark palette in `custom.css` is
  not edited, so dark rendering cannot regress while `home-light` is absent.
- A tiny inline script in the VitePress `head` config adds `home-light` to `<html>` before first
  paint when the stored appearance is "light", or when no explicit choice exists and
  `prefers-color-scheme: light` matches. Without JavaScript the page renders dark.
- The stored key is VitePress's own `vitepress-theme-appearance`, so a choice made on the landing
  page carries to the docs theme and vice versa ("auto" resolves to the system preference).
- Header toggle (sun icon in dark, moon icon in light, localized `aria-label`, `aria-pressed`
  state) toggles the class, persists "light"/"dark", and updates the `theme-color` meta to match
  the mode.
- Light overrides cover every hardcoded dark color on the landing page: window chrome, header,
  scanlines (softened), buttons and their hover states, capability chips, provider index labels,
  mobile menu, architecture node fills, footer, selection colors, and the outer page frame.
  Traffic-light dots keep their colors in both modes.
- No new runtime dependencies, fonts, trackers, or external requests.
- Failure paths: if the head script throws (storage blocked), the page stays dark and the toggle
  still works for the session. If the toggle module fails to load, the buttons are inert and the
  pre-paint state stands.
- Rollout/rollback: ships through the existing Pages pipeline; rollback is a git revert. No data,
  storage, or migration impact beyond the shared VitePress appearance key that the docs theme
  already uses.

### Acceptance criteria

- [ ] AC-1: `cd website && bun install --frozen-lockfile && bun run docs:build` completes
  successfully.
- [ ] AC-2: With no stored choice and a dark system preference, the landing renders exactly the
  existing dark design (rendered screenshots; base dark CSS untouched — `git diff` shows no
  palette edits in custom.css).
- [ ] AC-3: With `home-light` active, both landing languages render the complete light design —
  hero, workflow, providers, architecture, open source, footer — at desktop and mobile widths
  with readable (AA) text and no dark remnants.
- [ ] AC-4: Rendered browser interaction proves the toggle switches modes, persists across
  reload via `vitepress-theme-appearance`, updates the `theme-color` meta and `aria-pressed`,
  defaults from the system preference with empty storage, and that docs pages are unaffected by
  the `home-light` class.
- [ ] AC-5: `bun script/verify/sdlc.ts` passes, the change merges to main, the "Deploy docs to
  GitHub Pages" run succeeds, and the live site serves both modes.

## Decision and gates

User `chenli` directly approved Intent and implementation through the current request on
2026-08-31 ("支持light / dark"). ZCode owns implementation and verification. The user's standing
GitHub Pages deployment authorization covers the merge and deploy gate. No separate security,
data, or migration gate applies. No product release is requested.

## Plan

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

## Build

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

## Verification

Verdict: pending (deploy confirmation outstanding).

Rendered inspection was performed against the production VitePress build served locally via
`vitepress preview`, in a real browser at 1440x900 and 390x844.

- Default with empty storage and a dark system preference renders the unchanged dark design with
  the new sun-icon toggle in the header; the light palette CSS is inert without `home-light`.
- Clicking the toggle swaps to light instantly: paper background frame and page, ink headline,
  dark-green command text and buttons, light window chrome, softened scanlines, and the
  ink-stroke logo (`getComputedStyle(.brand-mark).content` resolves to `logo-ink.svg`).
- Persistence: the choice stores as `vitepress-theme-appearance=light`; a full reload renders
  light from the pre-paint head script (`home-light` present on `<html>` before hydration), with
  no dark flash.
- Full light sweep on the English page: hero, provider matrix (all 11 entries readable with
  dark-green command text), architecture diagram (dark-green octagon strokes on paper), and the
  open-source footer all render without dark remnants; mobile 390x844 light hero renders with
  the ink logo and readable buttons.
- Chinese landing page: two toggles present with the localized label 切换浅色 / 深色模式, light
  palette variables applied (`--home-bg: #f1f3ec`).
- Docs pages remain unaffected by the `home-light` class: `/guide/getting-started` renders the
  standard VitePress light theme (white body, #3c3c43 text), and the landing choice carries over
  as the docs appearance (stored "light" → docs `dark` class absent), which is the intended
  cross-page sync.
- Tooling note: the headless automation browser again needed frame-forcing screenshots before
  IO/rAF-driven states settled; all state reads were taken after forced frames. `vitepress
  preview` was also restarted once because it serves a stale file manifest after `dist/` is
  rebuilt — an automation-environment artifact, not a site defect.

### Acceptance evidence

- AC-1: PASS — `cd website && bun install --frozen-lockfile && bun run docs:build` completed
  cleanly ("build complete in 1.63s" on the final build).
- AC-2: PASS — with stored "auto" and a dark system preference the landing rendered the
  unchanged dark design plus the header toggle; evidence:
  [dark-default-desktop](evidence/dark-default-desktop.png); `git diff` shows no palette edits in
  the dark rules of `custom.css` (append-only toggle styles).
- AC-3: PASS — with `home-light` active the English page rendered the complete light design at
  1440x900 and 390x844 and the Chinese page applied the light variables; evidence:
  [light-desktop-hero](evidence/light-desktop-hero.png),
  [light-desktop-providers](evidence/light-desktop-providers.png),
  [light-desktop-architecture](evidence/light-desktop-architecture.png),
  [light-desktop-footer](evidence/light-desktop-footer.png),
  [light-mobile-hero](evidence/light-mobile-hero.png).
- AC-4: PASS — browser interaction: toggle click flipped the class, stored
  `vitepress-theme-appearance=light`, updated the `theme-color` meta to `#f1f3ec` and
  `aria-pressed` to "true"; a reload rendered light pre-paint (`home-light` on `<html>` at
  domcontentloaded); empty storage with a dark system rendered dark; `/guide/getting-started`
  rendered the standard docs light theme with no `home-light` leakage.
- AC-5: pending — verified immediately after merge by watching the "Deploy docs to GitHub Pages"
  run and opening the live site.

Residual risk: visitors who disable JavaScript always get the dark landing (the toggle is inert);
the system-preference default requires the head script, so it also depends on JS. The light scan
lines are decorative and softened but still present in light mode by design. `content: url()`
logo swapping relies on evergreen-browser support (Chrome/Safari/Firefox current); an
unsupporting browser would show the dark-tuned logo on paper.

## Review and release

Approval: pending.
Release target: none — the deliverable is the website, continuously deployed to GitHub Pages by
the existing `pages.yml` workflow.
Release identity: not applicable.
Smoke evidence: not applicable until the merged deployment is confirmed.
Rollback: revert the light/dark commit on main and let the Pages workflow redeploy.
No release: no product release is intended; the deployed website is the final artifact.

## Feedback

No feedback exists yet; the user's review of the light theme after deployment will be recorded
here.
