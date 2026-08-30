---
id: change-2026-08-31-website-dual-theme
kind: change
schema: 2
status: executing
risk: low
owner: ZCode
approvers: [chenli]
approved_at: 2026-08-31
created: 2026-08-31
updated: 2026-08-31
source: Direct user request in the current ZCode session on 2026-08-31 to build the C2 official website and deploy it to GitHub Pages; after three design directions the user chose to preview the refined Terminal theme and a new Modern dark theme together through an on-page style toggle
inputs: Existing VitePress site under website/, the terminal-style bilingual landing pages, and the existing GitHub Pages workflow .github/workflows/pages.yml
outputs: Bilingual landing page with two selectable skins (Terminal, Modern dark), a persisted on-page style toggle, a modern-skin stylesheet, and a merge to main that triggers the existing Pages deployment
scope: website/, docs/sdlc/changes/2026-08-31-website-dual-theme
next_trigger: User reviews both deployed variants and picks the final homepage theme; the losing skin and the preview toggle are then removed in a follow-up change
verification_mode: owner
verified_by: pending
verified_at: pending
---

# Website dual-theme preview (Terminal + Modern)

## Intent

The repository already ships a VitePress website with a working GitHub Pages deployment
(https://blogs.idevlab.dev/codeTwo/, deployed by `.github/workflows/pages.yml` on every push to
`main`). The current landing page is a single dark terminal-styled design (black background,
neon-green accents, monospace headings, window chrome).

The user asked for an official website deployed to GitHub Pages and, after reviewing three design
directions, chose to compare two of them live: the refined Terminal direction and a new Modern
dark developer-tool direction (Linear/Vercel-like). The comparison must happen on the real
deployed site, on identical content, so the user can decide which design to keep.

Affected system: the marketing landing page of the VitePress site (English and Chinese home
pages) plus its theme styles. Documentation pages, docs navigation, search, deployment
configuration, and application code are out of scope. The final selection and removal of the
losing skin is a follow-up decision owned by the user.

## Spec

- The landing page keeps one shared HTML structure for both skins. No content, copy, links, or
  accessibility labels are duplicated per skin; only presentation differs.
- Skin A "Terminal" is the existing design, unchanged as the default (no stored preference and
  first visit render exactly the current terminal look).
- Skin B "Modern" is a dark developer-tool aesthetic: full-bleed deep blue-black background,
  system-sans headings with a green→cyan gradient accent, pill badges instead of raw `$` command
  labels, glass cards for the provider matrix, rounded panels with hairline borders, soft glows,
  and the same content in the same order.
- A small floating segmented toggle ("Terminal / Modern"; Chinese: "终端风 / 现代风") lets the
  visitor switch skins on both language variants. The choice persists in `localStorage`
  (`c2-home-style`) and is reapplied on reload. Default without a stored value is Terminal.
- The toggle is scoped to the landing pages only; docs pages are untouched.
- No new runtime dependencies; the toggle is a small Vue `<script setup>` block already supported
  by VitePress markdown, and the Modern skin is an additive `.codetwo-home.theme-modern` CSS layer
  imported after the existing stylesheet.
- Failure paths: if `localStorage` is unavailable (private mode), the toggle still switches skins
  for the current view and silently skips persistence. If JavaScript is disabled, the default
  Terminal skin renders and the toggle is inert.
- Rollout/rollback: the change ships through the existing Pages pipeline on merge to main.
  Rollback is a git revert of the website commit; no data, storage, or migration impact.
- Security: no external requests, fonts, trackers, or scripts are added.

### Acceptance criteria

- [ ] AC-1: `cd website && bun install --frozen-lockfile && bun run docs:build` completes
  successfully.
- [ ] AC-2: Rendered screenshots of the built site prove both skins show the complete landing
  content (hero, workflow, providers, architecture, open source, footer) at desktop and mobile
  widths, in English and Chinese, with no clipped or overlapping content.
- [ ] AC-3: Browser interaction proves the toggle switches skins, the choice persists across a
  reload, and the default (cleared storage) is the Terminal skin.
- [ ] AC-4: The SDLC contract check (`bun script/verify/sdlc.ts`) passes and
  `.github/workflows/pages.yml` is unchanged.
- [ ] AC-5: After merge to main, the "Deploy docs to GitHub Pages" run succeeds and both skins are
  reachable on the live site.

## Decision and gates

User `chenli` directly approved Intent and implementation through the current request on
2026-08-31 ("帮我给这个项目自做一个官网，并部署到 GitHub Pages 上去" and "前两种都尝试一下").
ZCode owns implementation and verification. The user authorized deployment to GitHub Pages as
part of the original request; the existing `pages.yml` pipeline on main is the deployment gate.
No separate security, data, or migration gate applies — this is a presentation-only website
change. Publication of a product release is not requested and remains unapproved.

## Plan

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

## Build

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

## Verification

Verdict: pending (deploy confirmation outstanding).

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
- AC-2: PASS — Rendered browser screenshots of the built site at 1440x900 (Terminal first screen,
  Modern hero, workflow, providers, architecture, open source/footer) and 390x844 (Modern hero,
  Chinese Modern hero) show the complete landing content with no clipped or overlapping content.
- AC-3: PASS — Browser interaction: Terminal → Modern click applied the skin and stored
  `modern`; reload kept Modern on `/` and `/zh/`; switching back applied Terminal and stored
  `terminal`; the first visit with empty storage rendered Terminal.
- AC-4: PASS — `bun script/verify/sdlc.ts` reported "[sdlc] contract valid";
  `.github/workflows/pages.yml` is untouched by this change (`git diff` scope limited to
  `website/` and this Artifact).
- AC-5: pending — verified immediately after merge by watching the "Deploy docs to GitHub Pages"
  run and opening the live site.

Residual risk: a visitor with a stored Modern preference sees a brief Terminal flash before
hydration re-applies Modern (accepted for the preview period; disappears when the losing skin and
toggle are removed). The floating toggle can overlap the bottom-right footer links at some scroll
positions; it is a preview-period control. Playwright locator clicks against the toggle timed out
in the automation browser while `elementFromPoint` proved the button is the top-most hit target
and programmatic activation through the same listener worked — real pointer clicks are unaffected.

## Review and release

Approval: pending (PR review and merge by the user's standing request to deploy to GitHub Pages).
Release target: none.
Release identity: not applicable until released.
Smoke evidence: not applicable until released.
Rollback: revert the website commit on main and let the Pages workflow redeploy.
No release: not applicable — website deployment through Pages is in scope; no product release,
tag, or installer publication is part of this change.

## Feedback

No feedback exists yet; the pending user decision (which skin to keep) is tracked as this
Artifact's `next_trigger` and will be recorded here once given.
