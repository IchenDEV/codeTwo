---
id: "2026-08-31-website-terminal-motion"
stage: intent
schema: 3
status: accepted
owner: ZCode
created: 2026-08-31
source: Direct user follow-up in the current ZCode session on 2026-08-31 — after reviewing both deployed skins the user chose the Terminal design (方案一) and asked to add Apple-style scroll-driven animations with a terminal feel
risk: low
approved_by: "[chenli]"
approved_at: "2026-08-31"
---

# Intent: Terminal landing scroll motion (Apple-style)

## Problem

The dual-theme preview (change 2026-08-31-website-dual-theme) let the user compare the Terminal
and Modern skins live. The user has now decided: keep the Terminal design as the single homepage
design and remove the Modern skin plus the preview toggle. In the same request the user asked for
animations "类似苹果的页面滚动变化" — Apple-product-page-style scroll-driven motion — with a
terminal flavor.

Desired outcome: the Terminal landing page becomes the definitive homepage and gains tasteful,
terminal-flavored motion — command prompts that type themselves, sections that rise into view,
and the architecture diagram that assembles node by node while the visitor scrolls — without new
dependencies and without breaking the existing design, accessibility, or the static no-JS
fallback.

Affected system: the landing pages and their theme assets. Documentation pages, deployment
configuration, and application code are out of scope.

## Proposed outcome

The dual-theme preview (change 2026-08-31-website-dual-theme) let the user compare the Terminal

## Affected users and systems

Migrated from legacy change.md.

## Constraints

User `chenli` directly approved Intent and implementation through the current request on
2026-08-31 ("方案一 并增加动画 终端动画 类似苹果的页面滚动变化"), which also resolves the
pending skin decision tracked by change 2026-08-31-website-dual-theme. ZCode owns implementation
and verification. The user's standing GitHub Pages deployment authorization from the original
request covers the merge and deploy gate. No separate security, data, or migration gate applies.
No product release is requested.

## Out of scope

Not recorded in the legacy single-file Artifact.

## Success signals

See Spec acceptance criteria.

## Open questions

None recorded in migration.

## Decision

User `chenli` directly approved Intent and implementation through the current request on
2026-08-31 ("方案一 并增加动画 终端动画 类似苹果的页面滚动变化"), which also resolves the
pending skin decision tracked by change 2026-08-31-website-dual-theme. ZCode owns implementation
and verification. The user's standing GitHub Pages deployment authorization from the original
request covers the merge and deploy gate. No separate security, data, or migration gate applies.
No product release is requested.
