---
id: "2026-09-02-add-webui-favicon"
stage: plan
schema: 3
status: accepted
owner: codex
created: 2026-09-02
based_on: spec.md
risk: low
scope: apps/desktop/index.html, docs/sdlc/changes/2026-09-02-add-webui-favicon
approved_by: "userthe direct 2026-09-02 screenshot feedback"
approved_at: "2026-09-02"
---

# Plan: Add the C2 icon to the Web UI browser tab

## Files and ownership

apps/desktop/index.html, docs/sdlc/changes/2026-09-02-add-webui-favicon

## Order of work

1. Reference the existing C2 SVG icon from the shared main HTML entry.
2. Build the real Web bundle and verify the emitted icon URL is served successfully.
3. Reload the live CLI Web UI, inspect the icon declaration, and run repository lifecycle Gates.

Rollback removes the favicon declaration. There is no data or protocol rollback.

## Test-first proof

See legacy Verification section.

## Visual or integration proof

See legacy Verification section.

## Risks and mitigations

See legacy Decision and gates.

## Rollback

See legacy Review and release.

## Deviations

The shared main HTML entry now declares `assets/icon.svg` as an SVG favicon. Vite resolves that
existing source into its normal hashed Web asset, so the CLI server and desktop bundle keep the
same relative-asset contract. No new icon file, component, dependency, or runtime branch was added.

## Decision

The user's direct screenshot feedback accepts this low-risk visual correction. Ponytail selected
one HTML metadata declaration at the shared entry and the existing app icon; no duplicated favicon,
new dependency, Web-only component, or configuration surface is justified.

Human review remains required before merge. Merge, release, deployment, and publication are not
authorized.
