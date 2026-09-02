---
id: "2026-08-31-website-landing-light-dark"
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

# Verification: Landing page light/dark themes

## Automated checks

Verdict: verified.

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
- AC-2: PASS — `bun run docs:preview` served the build; with stored "auto" and a dark system
  preference the landing rendered the unchanged dark design plus the header toggle; evidence:
  [dark-default-desktop](evidence/dark-default-desktop.png); `git diff` shows no palette edits in
  the dark rules of `custom.css` (append-only toggle styles).
- AC-3: PASS — with `home-light` active the English page rendered the complete light design at
  1440x900 and 390x844 and the Chinese page applied the light variables; evidence:
  [light-desktop-hero](evidence/light-desktop-hero.png),
  [light-desktop-providers](evidence/light-desktop-providers.png),
  [light-desktop-architecture](evidence/light-desktop-architecture.png),
  [light-desktop-footer](evidence/light-desktop-footer.png),
  [light-mobile-hero](evidence/light-mobile-hero.png).
- AC-4: PASS — `.theme-toggle` clicks plus `localStorage`/`classList`/`getComputedStyle`
  readouts in the rendered browser: toggle click flipped the class, stored
  `vitepress-theme-appearance=light`, updated the `theme-color` meta to `#f1f3ec` and
  `aria-pressed` to "true"; a reload rendered light pre-paint (`home-light` on `<html>` at
  domcontentloaded); empty storage with a dark system rendered dark; `/guide/getting-started`
  rendered the standard docs light theme with no `home-light` leakage.
- AC-5: PASS — [PR #199](https://github.com/IchenDEV/codeTwo/pull/199) merged to main; the
  "Deploy docs to GitHub Pages" run 33334093798 completed successfully; `curl
  https://blogs.idevlab.dev/codeTwo/` returned HTTP 200 with the `theme-toggle` markup and the
  pre-paint `home-light` script present, the served stylesheet containing the `home-light`
  palette, and `logo-ink.svg` served with HTTP 200.

Residual risk: visitors who disable JavaScript always get the dark landing (the toggle is inert);
the system-preference default requires the head script, so it also depends on JS. The light scan
lines are decorative and softened but still present in light mode by design. `content: url()`
logo swapping relies on evergreen-browser support (Chrome/Safari/Firefox current); an
unsupporting browser would show the dark-tuned logo on paper.

## Behavioral evidence

Verdict: verified.

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
- AC-2: PASS — `bun run docs:preview` served the build; with stored "auto" and a dark system
  preference the landing rendered the unchanged dark design plus the header toggle; evidence:
  [dark-default-desktop](evidence/dark-default-desktop.png); `git diff` shows no palette edits in
  the dark rules of `custom.css` (append-only toggle styles).
- AC-3: PASS — with `home-light` active the English page rendered the complete light design at
  1440x900 and 390x844 and the Chinese page applied the light variables; evidence:
  [light-desktop-hero](evidence/light-desktop-hero.png),
  [light-desktop-providers](evidence/light-desktop-providers.png),
  [light-desktop-architecture](evidence/light-desktop-architecture.png),
  [light-desktop-footer](evidence/light-desktop-footer.png),
  [light-mobile-hero](evidence/light-mobile-hero.png).
- AC-4: PASS — `.theme-toggle` clicks plus `localStorage`/`classList`/`getComputedStyle`
  readouts in the rendered browser: toggle click flipped the class, stored
  `vitepress-theme-appearance=light`, updated the `theme-color` meta to `#f1f3ec` and
  `aria-pressed` to "true"; a reload rendered light pre-paint (`home-light` on `<html>` at
  domcontentloaded); empty storage with a dark system rendered dark; `/guide/getting-started`
  rendered the standard docs light theme with no `home-light` leakage.
- AC-5: PASS — [PR #199](https://github.com/IchenDEV/codeTwo/pull/199) merged to main; the
  "Deploy docs to GitHub Pages" run 33334093798 completed successfully; `curl
  https://blogs.idevlab.dev/codeTwo/` returned HTTP 200 with the `theme-toggle` markup and the
  pre-paint `home-light` script present, the served stylesheet containing the `home-light`
  palette, and `logo-ink.svg` served with HTTP 200.

Residual risk: visitors who disable JavaScript always get the dark landing (the toggle is inert);
the system-preference default requires the head script, so it also depends on JS. The light scan
lines are decorative and softened but still present in light mode by design. `content: url()`
logo swapping relies on evergreen-browser support (Chrome/Safari/Firefox current); an
unsupporting browser would show the dark-tuned logo on paper.

## Visual evidence

See bundle evidence/ when present.

## Security and privacy evidence

Not separately recorded unless present in legacy Verification.

## Deviations and residual risk

Residual risk: visitors who disable JavaScript always get the dark landing (the toggle is inert);

## Verdict

Verdict: verified..

## Review and release

Approval: the user authorized GitHub Pages deployment in the original request; PR #199 was
merged on 2026-08-31 under that standing authorization
([PR #199](https://github.com/IchenDEV/codeTwo/pull/199)).
Review surface: [PR #199](https://github.com/IchenDEV/codeTwo/pull/199).
Release target: none — the deliverable is the website, continuously deployed to GitHub Pages by
the existing `pages.yml` workflow.
Release identity: not applicable.
Smoke evidence: after deploy run 33334093798 succeeded, the live site at
https://blogs.idevlab.dev/codeTwo/ returned HTTP 200 and serves both color schemes (toggle
markup, `home-light` pre-paint script and palette, ink logo variant all present).
Rollback: revert the light/dark commit on main and let the Pages workflow redeploy.
No release: no product release is intended; the deployed website is the final artifact.

## Feedback

No feedback exists yet; the user's review of the light theme on the live site will be recorded
here.
