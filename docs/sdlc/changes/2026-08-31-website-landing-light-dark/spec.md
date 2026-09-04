---
id: "2026-08-31-website-landing-light-dark"
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

# Spec: Landing page light/dark themes

## Requirements

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
2026-08-31 ("支持light / dark"). ZCode owns implementation and verification. The user's standing
GitHub Pages deployment authorization covers the merge and deploy gate. No separate security,
data, or migration gate applies. No product release is requested.

## Acceptance criteria

- [x] AC-1: `cd website && bun install --frozen-lockfile && bun run docs:build` completes
  successfully.
- [x] AC-2: With no stored choice and a dark system preference, the landing renders exactly the
  existing dark design (rendered screenshots; base dark CSS untouched — `git diff` shows no
  palette edits in custom.css).
- [x] AC-3: With `home-light` active, both landing languages render the complete light design —
  hero, workflow, providers, architecture, open source, footer — at desktop and mobile widths
  with readable (AA) text and no dark remnants.
- [x] AC-4: Rendered browser interaction proves the toggle switches modes, persists across
  reload via `vitepress-theme-appearance`, updates the `theme-color` meta and `aria-pressed`,
  defaults from the system preference with empty storage, and that docs pages are unaffected by
  the `home-light` class.
- [x] AC-5: `bun script/verify/sdlc.ts` passes, the change merges to main, the "Deploy docs to
  GitHub Pages" run succeeds, and the live site serves both modes.

## Decision

User `chenli` directly approved Intent and implementation through the current request on
2026-08-31 ("支持light / dark"). ZCode owns implementation and verification. The user's standing
GitHub Pages deployment authorization covers the merge and deploy gate. No separate security,
data, or migration gate applies. No product release is requested.
