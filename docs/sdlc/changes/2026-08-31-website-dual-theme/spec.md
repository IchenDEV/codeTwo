---
id: "2026-08-31-website-dual-theme"
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

# Spec: Website dual-theme preview (Terminal + Modern)

## Requirements

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
2026-08-31 ("帮我给这个项目自做一个官网，并部署到 GitHub Pages 上去" and "前两种都尝试一下").
ZCode owns implementation and verification. The user authorized deployment to GitHub Pages as
part of the original request; the existing `pages.yml` pipeline on main is the deployment gate.
No separate security, data, or migration gate applies — this is a presentation-only website
change. Publication of a product release is not requested and remains unapproved.

## Acceptance criteria

- [x] AC-1: `cd website && bun install --frozen-lockfile && bun run docs:build` completes
  successfully.
- [x] AC-2: Rendered screenshots of the built site prove both skins show the complete landing
  content (hero, workflow, providers, architecture, open source, footer) at desktop and mobile
  widths, in English and Chinese, with no clipped or overlapping content.
- [x] AC-3: Browser interaction proves the toggle switches skins, the choice persists across a
  reload, and the default (cleared storage) is the Terminal skin.
- [x] AC-4: The SDLC contract check (`bun script/verify/sdlc.ts`) passes and
  `.github/workflows/pages.yml` is unchanged.
- [x] AC-5: After merge to main, the "Deploy docs to GitHub Pages" run succeeds and both skins are
  reachable on the live site.

## Decision

User `chenli` directly approved Intent and implementation through the current request on
2026-08-31 ("帮我给这个项目自做一个官网，并部署到 GitHub Pages 上去" and "前两种都尝试一下").
ZCode owns implementation and verification. The user authorized deployment to GitHub Pages as
part of the original request; the existing `pages.yml` pipeline on main is the deployment gate.
No separate security, data, or migration gate applies — this is a presentation-only website
change. Publication of a product release is not requested and remains unapproved.
