---
id: "2026-08-31-website-dual-theme"
stage: plan
schema: 3
status: accepted
owner: ZCode
created: 2026-08-31
based_on: spec.md
risk: low
scope: website/, docs/sdlc/changes/2026-08-31-website-dual-theme
approved_by: "[chenli]"
approved_at: "2026-08-31"
---

# Plan: Website dual-theme preview (Terminal + Modern)

## Files and ownership

website/, docs/sdlc/changes/2026-08-31-website-dual-theme

## Order of work

1. Create this Artifact and move it to `executing` before implementation.
2. Add the style toggle markup and `<script setup>` logic to both landing pages (en/zh).
3. Add `website/.vitepress/theme/modern.css` implementing the Modern skin as additive overrides
   plus the shared toggle styles; import it from the theme entry after `custom.css`.
4. Build the site locally and inspect rendered screenshots of both skins at desktop and mobile
   widths; fix visual defects found.
5. Update this Artifact with evidence, run `bun script/check-sdlc.ts`, commit, push, open and
   merge the PR, then confirm the Pages run and the live site.

Affected modules: `website/index.md`, `website/zh/index.md`, `website/.vitepress/theme/`. Main
risk is visual regression of the existing Terminal skin (mitigated by additive-only CSS and
rendered comparison) and a first-paint flash when a stored Modern preference is reapplied after
hydration (accepted for the preview period). Rollback is reverting the website commit.

## Test-first proof

See legacy Verification section.

## Visual or integration proof

See legacy Verification section.

## Risks and mitigations

See legacy Decision and gates.

## Rollback

See legacy Review and release.

## Deviations

- Added a `<script setup>` block to `website/index.md` and `website/zh/index.md` that wires the
  floating style toggle, applies the stored or default skin, and persists the choice in
  `localStorage` under `c2-home-style` with best-effort error handling.
- Added the toggle markup ("Terminal / Modern"; Chinese "终端风 / 现代风") to both landing pages.
- Added `website/.vitepress/theme/modern.css`: additive `.codetwo-home.theme-modern` overrides
  (palette, full-bleed frame, sans headings with gradient accents, pill command badges, gradient
  primary button, glass provider cards, rounded architecture nodes, solid hairlines) plus the
  shared `.style-toggle` styles. Imported from the theme entry after `custom.css`. The existing
  Terminal stylesheet is unchanged.
- No changes to docs pages, navigation, deployment workflow, or dependencies.

## Decision

User `chenli` directly approved Intent and implementation through the current request on
2026-08-31 ("帮我给这个项目自做一个官网，并部署到 GitHub Pages 上去" and "前两种都尝试一下").
ZCode owns implementation and verification. The user authorized deployment to GitHub Pages as
part of the original request; the existing `pages.yml` pipeline on main is the deployment gate.
No separate security, data, or migration gate applies — this is a presentation-only website
change. Publication of a product release is not requested and remains unapproved.
