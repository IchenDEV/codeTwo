---
id: "2026-08-31-website-dual-theme"
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
release_target: none — the deliverable is the website itself, continuously deployed to GitHub
release_identity: "not applicable."
---

# Verification: Website dual-theme preview (Terminal + Modern)

## Automated checks

Verdict: verified.

Rendered inspection was performed against the production VitePress build served locally via
`vitepress preview` at `http://localhost:4180/codeTwo/`, using a real browser at 1440x900 and
390x844 viewports.

- The default English landing page rendered the unchanged Terminal skin: window chrome, monospace
  headings, neon-green accents, scanline hero, and the original layout, confirming the additive
  CSS did not regress the existing design.
- Clicking the Modern toggle applied `.theme-modern`, stored `c2-home-style=modern`, highlighted
  the Modern segment, and restyled every section: full-bleed deep blue-black background with grid
  and glow, gradient hero headline with gradient period, pill `$` command badges, gradient primary
  button with readable dark label, hairline capability chips, gradient step badges with sans
  step titles, eleven glass provider cards with hover borders, rounded facts panel, rounded
  architecture nodes with gradient Rust-core text and solid arrows, and the open-source footer.
- The Chinese landing page shared the stored preference, rendered the Modern skin with the
  终端风/现代风 toggle, and switched back to Terminal correctly (class removed, storage updated,
  active segment updated).
- The persisted choice survived a full page reload on both language variants; clearing storage
  restores the Terminal default.
- The toggle widget is the top-most element at its center (verified via `elementFromPoint`), and
  the mobile hero, actions, and toggle render without clipping at 390x844.

### Acceptance evidence

- AC-1: PASS — `cd website && bun install --frozen-lockfile && bun run docs:build` completed
  ("build complete in 3.04s", VitePress 1.6.4, no warnings or errors).
- AC-2: PASS — `bun run docs:preview` served `website/.vitepress/dist` for rendered browser
  inspection; screenshots at 1440x900 and 390x844 show the complete landing content in both
  skins with no clipped or overlapping content. Evidence:
  [terminal-desktop-hero](evidence/terminal-desktop-hero.png),
  [modern-desktop-hero](evidence/modern-desktop-hero.png),
  [modern-desktop-workflow](evidence/modern-desktop-workflow.png),
  [modern-desktop-providers](evidence/modern-desktop-providers.png),
  [modern-desktop-architecture](evidence/modern-desktop-architecture.png),
  [modern-desktop-footer](evidence/modern-desktop-footer.png),
  [modern-mobile-en](evidence/modern-mobile-en.png),
  [modern-mobile-zh](evidence/modern-mobile-zh.png).
- AC-3: PASS — real browser clicks on `.style-toggle-btn` toggled `theme-modern` and stored
  `c2-home-style=modern`; a full reload kept Modern on `/` and `/zh/`; switching back applied
  Terminal and stored `terminal`; the first visit with empty storage rendered Terminal. Page
  state was read back via `localStorage`/`classList` inspection, and the persisted Chinese state
  is visible in [modern-mobile-zh](evidence/modern-mobile-zh.png).
- AC-4: PASS — `bun script/verify/sdlc.ts` reported "[sdlc] contract valid";
  `.github/workflows/pages.yml` is untouched by this change (`git diff` scope limited to
  `website/` and this Artifact).
- AC-5: PASS — [PR #192](https://github.com/IchenDEV/codeTwo/pull/192) merged to main; the
  "Deploy docs to GitHub Pages" run 33331183981 completed successfully (build and deploy-pages
  both green); `curl https://blogs.idevlab.dev/codeTwo/` returned HTTP 200 with the
  `style-toggle` markup present and the served stylesheet containing the `theme-modern` rules.

Residual risk: a visitor with a stored Modern preference sees a brief Terminal flash before
hydration re-applies Modern (accepted for the preview period; disappears when the losing skin and
toggle are removed). The floating toggle can overlap the bottom-right footer links at some scroll
positions; it is a preview-period control. Playwright locator clicks against the toggle timed out
in the automation browser while `elementFromPoint` proved the button is the top-most hit target
and programmatic activation through the same listener worked — real pointer clicks are unaffected.

## Behavioral evidence

Verdict: verified.

Rendered inspection was performed against the production VitePress build served locally via
`vitepress preview` at `http://localhost:4180/codeTwo/`, using a real browser at 1440x900 and
390x844 viewports.

- The default English landing page rendered the unchanged Terminal skin: window chrome, monospace
  headings, neon-green accents, scanline hero, and the original layout, confirming the additive
  CSS did not regress the existing design.
- Clicking the Modern toggle applied `.theme-modern`, stored `c2-home-style=modern`, highlighted
  the Modern segment, and restyled every section: full-bleed deep blue-black background with grid
  and glow, gradient hero headline with gradient period, pill `$` command badges, gradient primary
  button with readable dark label, hairline capability chips, gradient step badges with sans
  step titles, eleven glass provider cards with hover borders, rounded facts panel, rounded
  architecture nodes with gradient Rust-core text and solid arrows, and the open-source footer.
- The Chinese landing page shared the stored preference, rendered the Modern skin with the
  终端风/现代风 toggle, and switched back to Terminal correctly (class removed, storage updated,
  active segment updated).
- The persisted choice survived a full page reload on both language variants; clearing storage
  restores the Terminal default.
- The toggle widget is the top-most element at its center (verified via `elementFromPoint`), and
  the mobile hero, actions, and toggle render without clipping at 390x844.

### Acceptance evidence

- AC-1: PASS — `cd website && bun install --frozen-lockfile && bun run docs:build` completed
  ("build complete in 3.04s", VitePress 1.6.4, no warnings or errors).
- AC-2: PASS — `bun run docs:preview` served `website/.vitepress/dist` for rendered browser
  inspection; screenshots at 1440x900 and 390x844 show the complete landing content in both
  skins with no clipped or overlapping content. Evidence:
  [terminal-desktop-hero](evidence/terminal-desktop-hero.png),
  [modern-desktop-hero](evidence/modern-desktop-hero.png),
  [modern-desktop-workflow](evidence/modern-desktop-workflow.png),
  [modern-desktop-providers](evidence/modern-desktop-providers.png),
  [modern-desktop-architecture](evidence/modern-desktop-architecture.png),
  [modern-desktop-footer](evidence/modern-desktop-footer.png),
  [modern-mobile-en](evidence/modern-mobile-en.png),
  [modern-mobile-zh](evidence/modern-mobile-zh.png).
- AC-3: PASS — real browser clicks on `.style-toggle-btn` toggled `theme-modern` and stored
  `c2-home-style=modern`; a full reload kept Modern on `/` and `/zh/`; switching back applied
  Terminal and stored `terminal`; the first visit with empty storage rendered Terminal. Page
  state was read back via `localStorage`/`classList` inspection, and the persisted Chinese state
  is visible in [modern-mobile-zh](evidence/modern-mobile-zh.png).
- AC-4: PASS — `bun script/verify/sdlc.ts` reported "[sdlc] contract valid";
  `.github/workflows/pages.yml` is untouched by this change (`git diff` scope limited to
  `website/` and this Artifact).
- AC-5: PASS — [PR #192](https://github.com/IchenDEV/codeTwo/pull/192) merged to main; the
  "Deploy docs to GitHub Pages" run 33331183981 completed successfully (build and deploy-pages
  both green); `curl https://blogs.idevlab.dev/codeTwo/` returned HTTP 200 with the
  `style-toggle` markup present and the served stylesheet containing the `theme-modern` rules.

Residual risk: a visitor with a stored Modern preference sees a brief Terminal flash before
hydration re-applies Modern (accepted for the preview period; disappears when the losing skin and
toggle are removed). The floating toggle can overlap the bottom-right footer links at some scroll
positions; it is a preview-period control. Playwright locator clicks against the toggle timed out
in the automation browser while `elementFromPoint` proved the button is the top-most hit target
and programmatic activation through the same listener worked — real pointer clicks are unaffected.

## Visual evidence

See bundle evidence/ when present.

## Security and privacy evidence

Not separately recorded unless present in legacy Verification.

## Deviations and residual risk

Residual risk: a visitor with a stored Modern preference sees a brief Terminal flash before

## Verdict

Verdict: verified..

## Review and release

Approval: the user authorized GitHub Pages deployment in the original request; PR #192 was merged
on 2026-08-31 under that standing authorization
([PR #192](https://github.com/IchenDEV/codeTwo/pull/192)).
Review surface: [PR #192](https://github.com/IchenDEV/codeTwo/pull/192).
Release target: none — the deliverable is the website itself, continuously deployed to GitHub
Pages by the existing `pages.yml` workflow; no product release, tag, or installer is part of this
change.
Release identity: not applicable.
Smoke evidence: after the deploy run 33331183981 succeeded, the live site at
https://blogs.idevlab.dev/codeTwo/ returned HTTP 200 and serves both skins (style-toggle markup
present, `theme-modern` rules in the served stylesheet).
Rollback: revert the website commit on main and let the Pages workflow redeploy.
No release: no product release is intended for this change; the deployed website is the final
artifact of this scope.

## Feedback

Resolved 2026-08-31: after reviewing both deployed skins, the user chose the Terminal design
(方案一) and requested Apple-style scroll animations for it in the same request. The Modern skin,
the style toggle, and the `c2-home-style` persistence introduced by this change were removed by
the follow-up change
[2026-08-31-website-terminal-motion](../2026-08-31-website-terminal-motion/intent.md), which also
records the removal evidence. No other feedback exists.
