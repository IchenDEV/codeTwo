---
id: "2026-08-31-remove-liquid-gooey"
stage: plan
schema: 3
status: accepted
owner: codex
created: 2026-08-31
based_on: spec.md
risk: medium
scope: apps/desktop/bun.lock, apps/desktop/package.json, apps/desktop/src/components/ui/tabs.tsx, apps/desktop/src/session/Composer.tsx, apps/desktop/src/session/SideChatPanel.tsx, apps/desktop/src/sidebar/SessionRail.tsx, apps/desktop/src/styles.css, apps/desktop/tests/composerGeometryContract.test.ts, apps/desktop/tests/desktopPerformanceContract.test.ts, docs/sdlc/changes/2026-08-30-quiet-session-rail-items/change.md, docs/sdlc/changes/2026-08-31-remove-liquid-gooey
approved_by: "[user]"
approved_at: "2026-08-31"
---

# Plan: Remove the liquid interaction renderer

## Files and ownership

apps/desktop/bun.lock, apps/desktop/package.json, apps/desktop/src/components/ui/tabs.tsx, apps/desktop/src/session/Composer.tsx, apps/desktop/src/session/SideChatPanel.tsx, apps/desktop/src/sidebar/SessionRail.tsx, apps/desktop/src/styles.css, apps/desktop/tests/composerGeometryContract.test.ts, apps/desktop/tests/desktopPerformanceContract.test.ts, docs/sdlc/changes/2026-08-30-quiet-session-rail-items/change.md, docs/sdlc/changes/2026-08-31-remove-liquid-gooey

## Order of work

1. Add a deletion contract and reproduce its failure against the current dependency and wrappers.
2. Delete the package and all liquid-specific code, then restore selected states with native CSS.
3. Run focused and full automated verification plus a production renderer build.
4. Verify the affected surfaces in dark, light, and narrow rendered states and record the verdict.

## Test-first proof

See legacy Verification section.

## Visual or integration proof

See legacy Verification section.

## Risks and mitigations

See legacy Decision and gates.

## Rollback

See legacy Review and release.

## Deviations

Removed `liquid-gooey` from the desktop manifest and lockfile. Deleted the shared liquid indicator,
its mutation and resize observers, layout measurements, SVG filter path, availability flag, and
selection wrapper from the Tabs primitive. Tabs now paint default and toolbar fills directly from
their active state and use a transform-only pseudo-element for the line variant.

The session list is now a plain container and the active row owns its tokenized background without
checking observer availability. Composer run and stop buttons render directly through the existing
Button and Tooltip primitives; the liquid action wrapper, plugin attributes, custom reduced-motion
listener, transparent-button overrides, and compatibility flag are gone.

Added a deletion contract covering the manifest, lockfile, three runtime surfaces, and the removed
observer/layout-measurement implementation. Updated the existing composer geometry contract to
assert the direct-button implementation.

## Decision

The user's implementation request approves Intent and deletion. Existing Base UI state attributes,
C2 color tokens, and CSS transitions are sufficient; no replacement animation dependency is
approved. Merge, release, deployment, and termination of a live C2 process remain separate human
Gates.
