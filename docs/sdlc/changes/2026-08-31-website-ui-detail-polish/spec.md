---
id: "2026-08-31-website-ui-detail-polish"
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

# Spec: Landing UI detail polish (reference: Utter landing)

## Requirements

- Hero headline gains a blinking green block cursor after the terminal period (CSS rectangle
  sized in `ch`, reusing the existing `codetwo-cursor` keyframes), on both languages; static and
  invisible-in-end-state under reduced motion is acceptable, and the reduced-motion block keeps
  it solid to avoid a vanished glyph.
- Hero body paragraph switches from sans to the mono stack (17px, line-height 1.7, max-width
  700px); section paragraphs stay sans for readability.
- Desktop nav links render in `--home-muted` and turn green on hover (existing hover rule);
  the nav gap tightens from 54px to 36px and font size from 16px to 15px; the locale link
  (中文/English) becomes a bordered chip like the reference; the GitHub CTA text turns green with
  a green-tinted hover background.
- Primary buttons gain a subtle green-tinted background (rgb green 9% dark / 10% light, hover
  15%/14%) and the shared button radius moves 4px → 6px; secondary buttons keep the hairline
  outline.
- Light mode gets equivalent values (accent #157a2c tints) via `light.css`; the dark palette
  edits stay in `custom.css`.
- No new dependencies, fonts, or external requests. Reduced-motion guards untouched except the
  cursor-solid rule.
- Failure paths: purely presentational; worst case is a cosmetic regression caught in rendered
  review. Rollback is a git revert.

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
2026-08-31 (reference screenshot + "参考这个优化ui 细节"). ZCode owns implementation and
verification. The user's standing GitHub Pages deployment authorization covers merge and deploy.
No security, data, or migration gate applies. No product release is requested.

## Acceptance criteria

- [x] AC-1: `cd website && bun install --frozen-lockfile && bun run docs:build` completes
  successfully.
- [x] AC-2: Rendered screenshots prove the five details in dark mode (blinking cursor present in
  DOM and styled, mono hero paragraph, muted nav + locale chip + green CTA, tinted 6px primary
  buttons) with no layout breakage at 1440x900 and 390x844.
- [x] AC-3: Rendered screenshots prove the equivalent light-mode rendering (tinted buttons, chip,
  cursor) with readable contrast.
- [x] AC-4: `bun script/verify/sdlc.ts` passes, the change merges to main, the Pages deploy run
  succeeds, and the live site serves the polished build.
- [x] AC-5: The cursor animation respects reduced motion (static rule present; page content
  unaffected).

## Decision

User `chenli` directly approved Intent and implementation through the current request on
2026-08-31 (reference screenshot + "参考这个优化ui 细节"). ZCode owns implementation and
verification. The user's standing GitHub Pages deployment authorization covers merge and deploy.
No security, data, or migration gate applies. No product release is requested.
