---
id: "2026-08-31-website-landing-light-dark"
stage: intent
schema: 3
status: accepted
owner: ZCode
created: 2026-08-31
source: Direct user request in the current ZCode session on 2026-08-31 — support light/dark on the website ("支持light / dark")
risk: low
approved_by: "[chenli]"
approved_at: "2026-08-31"
---

# Intent: Landing page light/dark themes

## Problem

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

## Proposed outcome

The C2 landing page is dark-only. The user asked to support light and dark modes. The docs pages

## Affected users and systems

Migrated from legacy change.md.

## Constraints

User `chenli` directly approved Intent and implementation through the current request on
2026-08-31 ("支持light / dark"). ZCode owns implementation and verification. The user's standing
GitHub Pages deployment authorization covers the merge and deploy gate. No separate security,
data, or migration gate applies. No product release is requested.

## Out of scope

Not recorded in the legacy single-file Artifact.

## Success signals

See Spec acceptance criteria.

## Open questions

None recorded in migration.

## Decision

User `chenli` directly approved Intent and implementation through the current request on
2026-08-31 ("支持light / dark"). ZCode owns implementation and verification. The user's standing
GitHub Pages deployment authorization covers the merge and deploy gate. No separate security,
data, or migration gate applies. No product release is requested.
