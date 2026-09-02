---
id: "2026-08-31-website-dual-theme"
stage: intent
schema: 3
status: accepted
owner: ZCode
created: 2026-08-31
source: Direct user request in the current ZCode session on 2026-08-31 to build the C2 official website and deploy it to GitHub Pages; after three design directions the user chose to preview the refined Terminal theme and a new Modern dark theme together through an on-page style toggle
risk: low
approved_by: "[chenli]"
approved_at: "2026-08-31"
---

# Intent: Website dual-theme preview (Terminal + Modern)

## Problem

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

## Proposed outcome

The repository already ships a VitePress website with a working GitHub Pages deployment

## Affected users and systems

Migrated from legacy change.md.

## Constraints

User `chenli` directly approved Intent and implementation through the current request on
2026-08-31 ("帮我给这个项目自做一个官网，并部署到 GitHub Pages 上去" and "前两种都尝试一下").
ZCode owns implementation and verification. The user authorized deployment to GitHub Pages as
part of the original request; the existing `pages.yml` pipeline on main is the deployment gate.
No separate security, data, or migration gate applies — this is a presentation-only website
change. Publication of a product release is not requested and remains unapproved.

## Out of scope

Not recorded in the legacy single-file Artifact.

## Success signals

See Spec acceptance criteria.

## Open questions

None recorded in migration.

## Decision

User `chenli` directly approved Intent and implementation through the current request on
2026-08-31 ("帮我给这个项目自做一个官网，并部署到 GitHub Pages 上去" and "前两种都尝试一下").
ZCode owns implementation and verification. The user authorized deployment to GitHub Pages as
part of the original request; the existing `pages.yml` pipeline on main is the deployment gate.
No separate security, data, or migration gate applies — this is a presentation-only website
change. Publication of a product release is not requested and remains unapproved.
