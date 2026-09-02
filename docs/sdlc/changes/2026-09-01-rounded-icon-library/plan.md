---
id: "2026-09-01-rounded-icon-library"
stage: plan
schema: 3
status: accepted
owner: codex
created: 2026-09-01
based_on: spec.md
risk: medium
scope: apps/desktop/components.json, apps/desktop/src/App.tsx, apps/desktop/src/bridge.ts, apps/desktop/src/components/ui/icons.tsx, apps/desktop/src/components/ui/icons.test.tsx, apps/desktop/src/editor/Editor.tsx, apps/desktop/src/editor/FileMenu.tsx, apps/desktop/src/editor/issueBlock.tsx, apps/desktop/src/editor/slotCard.tsx, apps/desktop/src/environment/EnvironmentPopover.tsx, apps/desktop/src/git/GitDockContent.tsx, apps/desktop/src/git/GitSyncStatus.tsx, apps/desktop/src/git/GitSyncStatus.test.tsx, apps/desktop/src/git/SourceControl.tsx, apps/desktop/src/i18n/strings.ts, apps/desktop/src/projects/ProjectIcon.tsx, apps/desktop/src/remote/Remote.tsx, apps/desktop/src/session/visualization.ts, apps/desktop/src/skillInline.tsx, apps/desktop/tests/uiStack.test.ts, apps/desktop/tests/visualization.test.ts, apps/desktop/package.json, apps/desktop/bun.lock, crates/core/src/market.rs, crates/core/src/skill.rs, crates/core/schemas/agent-scenes/1.0.0/examples/research.scene.json, crates/core/schemas/agent-scenes/1.0.0/examples/develop.scene.json, crates/core/schemas/agent-scenes/1.0.0/examples/test.scene.json, crates/core/schemas/agent-scenes/1.0.0/examples/fix.scene.json, crates/core/schemas/agent-scenes/1.0.0/examples/acceptance.scene.json, crates/core/schemas/agent-scenes/1.0.0/examples/rnd-lifecycle.pipeline.json, crates/core/tests/scene_conformance.rs, docs/design/system.md, docs/sdlc/changes/2026-09-01-rounded-icon-library/change.md
approved_by: "[user]"
approved_at: "2026-09-01"
---

# Plan: Adopt a rounder desktop icon family

## Files and ownership

apps/desktop/components.json, apps/desktop/src/App.tsx, apps/desktop/src/bridge.ts, apps/desktop/src/components/ui/icons.tsx, apps/desktop/src/components/ui/icons.test.tsx, apps/desktop/src/editor/Editor.tsx, apps/desktop/src/editor/FileMenu.tsx, apps/desktop/src/editor/issueBlock.tsx, apps/desktop/src/editor/slotCard.tsx, apps/desktop/src/environment/EnvironmentPopover.tsx, apps/desktop/src/git/GitDockContent.tsx, apps/desktop/src/git/GitSyncStatus.tsx, apps/desktop/src/git/GitSyncStatus.test.tsx, apps/desktop/src/git/SourceControl.tsx, apps/desktop/src/i18n/strings.ts, apps/desktop/src/projects/ProjectIcon.tsx, apps/desktop/src/remote/Remote.tsx, apps/desktop/src/session/visualization.ts, apps/desktop/src/skillInline.tsx, apps/desktop/tests/uiStack.test.ts, apps/desktop/tests/visualization.test.ts, apps/desktop/package.json, apps/desktop/bun.lock, crates/core/src/market.rs, crates/core/src/skill.rs, crates/core/schemas/agent-scenes/1.0.0/examples/research.scene.json, crates/core/schemas/agent-scenes/1.0.0/examples/develop.scene.json, crates/core/schemas/agent-scenes/1.0.0/examples/test.scene.json, crates/core/schemas/agent-scenes/1.0.0/examples/fix.scene.json, crates/core/schemas/agent-scenes/1.0.0/examples/acceptance.scene.json, crates/core/schemas/agent-scenes/1.0.0/examples/rnd-lifecycle.pipeline.json, crates/core/tests/scene_conformance.rs, docs/design/system.md, docs/sdlc/changes/2026-09-01-rounded-icon-library/change.md

## Order of work

1. Replace the Hugeicons-backed adapter with individually imported Phosphor components while
   retaining the adapter's existing export names and React contract.
2. Add a focused adapter test, update the dependency lock and design-system rule, and prove all
   existing call sites still type-check.
3. Run desktop lint, tests, renderer build, repository lifecycle checks, and light/dark/narrow
   rendered review; correct only icon-related regressions.

## Test-first proof

See legacy Verification section.

## Visual or integration proof

See legacy Verification section.

## Risks and mitigations

See legacy Decision and gates.

## Rollback

See legacy Review and release.

## Deviations

The desktop now exposes 165 semantic icon exports through the shared Phosphor adapter, using
concrete module imports and one regular-weight, `currentColor` wrapper. All generic interface
bypasses found in desktop source were migrated through that adapter: close controls, copied state,
Git ahead/behind state, saved-skill fallbacks, slot placeholders, and artifact prefixes. The
redundant filter glyph embedded in the static rich-transcript fixture was deleted instead of
introducing a second non-React icon pipeline.

The continued pass removed the ineffective `strokeWidth` compatibility, gave action-oriented
exports distinct Phosphor concepts, changed shadcn generation to `phosphor`, and centralized the
three Git synchronization renderers behind one localized, screen-reader-labelled component.
Built-in browser fallbacks, live Core skills, market entries, and the six canonical Scene fixtures
now omit emoji icon metadata so the renderer's shared Phosphor defaults are authoritative.

Provider marks, charts, QR content, keyboard labels, numeric operators, and authored extension
icons remain intentionally outside the generic application glyph family.

## Decision

The user approved Intent and implementation through the direct request on 2026-09-01. Phosphor was
selected over Tabler and Lucide because its rounded silhouettes and family-wide weights better fit
the requested direction while retaining React tree-shaking and MIT licensing. The implementation
preserves familiar icon concepts in line with the macOS HIG Icons and SF Symbols guidance.

No security, data, provider, merge, release, deployment, or production Gate is granted. Final
visual taste remains a human review Gate after the rendered evidence is available.
