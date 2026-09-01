---
id: change-2026-09-01-rounded-icon-library
kind: change
schema: 2
status: verified
risk: medium
owner: codex
approvers: [user]
approved_at: 2026-09-01
created: 2026-09-01
updated: 2026-09-01
source: direct user requests on 2026-09-01 to replace the strange-looking icon set with a rounder library, switch every generic desktop interface icon, continue the migration, and remove fallback icons
inputs: apps/desktop/src/components/ui/icons.tsx, apps/desktop/package.json, docs/design/system.md, Apple HIG Icons and SF Symbols guidance
outputs: one rounder application icon family behind the existing icon adapter, removal of generic interface glyph bypasses, dependency cleanup, adapter tests, and rendered review evidence
scope: apps/desktop/components.json, apps/desktop/src/App.tsx, apps/desktop/src/bridge.ts, apps/desktop/src/components/ui/icons.tsx, apps/desktop/src/components/ui/icons.test.tsx, apps/desktop/src/editor/Editor.tsx, apps/desktop/src/editor/FileMenu.tsx, apps/desktop/src/editor/issueBlock.tsx, apps/desktop/src/editor/slotCard.tsx, apps/desktop/src/environment/EnvironmentPopover.tsx, apps/desktop/src/git/GitDockContent.tsx, apps/desktop/src/git/GitSyncStatus.tsx, apps/desktop/src/git/GitSyncStatus.test.tsx, apps/desktop/src/git/SourceControl.tsx, apps/desktop/src/i18n/strings.ts, apps/desktop/src/projects/ProjectIcon.tsx, apps/desktop/src/remote/Remote.tsx, apps/desktop/src/session/visualization.ts, apps/desktop/src/skillInline.tsx, apps/desktop/tests/uiStack.test.ts, apps/desktop/tests/visualization.test.ts, apps/desktop/package.json, apps/desktop/bun.lock, crates/core/src/market.rs, crates/core/src/skill.rs, crates/core/schemas/agent-scenes/1.0.0/examples/research.scene.json, crates/core/schemas/agent-scenes/1.0.0/examples/develop.scene.json, crates/core/schemas/agent-scenes/1.0.0/examples/test.scene.json, crates/core/schemas/agent-scenes/1.0.0/examples/fix.scene.json, crates/core/schemas/agent-scenes/1.0.0/examples/acceptance.scene.json, crates/core/schemas/agent-scenes/1.0.0/examples/rnd-lifecycle.pipeline.json, crates/core/tests/scene_conformance.rs, docs/design/system.md, docs/sdlc/changes/2026-09-01-rounded-icon-library/change.md
next_trigger: human visual review, merge, or release request
verification_mode: owner
verified_by: codex
verified_at: 2026-09-01
---

# Adopt a rounder desktop icon family

## Intent

The desktop currently renders product glyphs through Hugeicons. The user reports that this visual
language feels strange and asked for a rounder icon library. The affected surface is the desktop
renderer: navigation, toolbars, menus, status, settings, and other shared controls all consume the
central icon adapter.

The desired outcome is a softer, more coherent icon family with clear macOS-sized silhouettes,
without changing feature behavior, provider marks, data, protocols, window geometry, or the app
icon. Existing call sites should retain their stable semantic imports so the migration stays
narrow and reversible.

## Spec

Use Phosphor Icons behind `components/ui/icons.tsx`, with its regular weight as the application
default and `currentColor` inheritance preserved. Import concrete icon modules rather than the
package barrel so development and production transforms do not eagerly process the whole family.
Map each existing public adapter export to the closest Phosphor concept, preserve ref forwarding,
class names, accessibility properties, and inline sizing. Remove the ineffective legacy
`strokeWidth` compatibility instead of advertising a root SVG attribute that cannot change
Phosphor's filled regular-weight paths.

Remove both Hugeicons dependencies after all adapter mappings compile. Provider and product brand
marks remain outside the generic glyph family. Built-in skill, market, and Scene metadata must not
ship fallback emoji; the renderer supplies its Phosphor defaults when no external authored icon is
present. Record Phosphor in both the design-system rules and shadcn generator configuration.
Rollback is the dependency, metadata, and adapter portion of this change.

### Acceptance criteria

- [x] AC-1: Every existing icon-adapter export renders a Phosphor SVG with regular weight,
  `currentColor`, forwarded refs, caller classes, and accessible SVG props; action-oriented exports
  do not collapse to their unmodified base concept. Verify with the focused adapter test and TypeScript.
- [x] AC-2: Hugeicons is absent from desktop source, manifest, lockfile, and generator configuration
  while the renderer lint, test suite, and production build pass.
- [x] AC-3: The shared design-system preview shows recognizable, visually consistent icons at 12,
  14, and 16 px in light, dark, and narrow rendered states; verify with captured window evidence.
- [x] AC-4: Repository documentation, lifecycle, and worktree checks pass with the icon-family
  contract and this Artifact in scope.
- [x] AC-5: Generic desktop interface icons no longer bypass the shared Phosphor adapter through
  hard-coded SVG paths or standalone symbol characters. Provider marks, charts, QR content,
  keyboard labels, authored external content, and numeric operators remain intentionally exempt.
  Built-in skill, market, and Scene sources carry no fallback emoji, and Git synchronization
  indicators retain explicit ahead/behind semantics for assistive technology.

## Decision and gates

The user approved Intent and implementation through the direct request on 2026-09-01. Phosphor was
selected over Tabler and Lucide because its rounded silhouettes and family-wide weights better fit
the requested direction while retaining React tree-shaking and MIT licensing. The implementation
preserves familiar icon concepts in line with the macOS HIG Icons and SF Symbols guidance.

No security, data, provider, merge, release, deployment, or production Gate is granted. Final
visual taste remains a human review Gate after the rendered evidence is available.

## Plan

1. Replace the Hugeicons-backed adapter with individually imported Phosphor components while
   retaining the adapter's existing export names and React contract.
2. Add a focused adapter test, update the dependency lock and design-system rule, and prove all
   existing call sites still type-check.
3. Run desktop lint, tests, renderer build, repository lifecycle checks, and light/dark/narrow
   rendered review; correct only icon-related regressions.

## Build

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

## Verification

Verdict: verified.

### Acceptance evidence

- AC-1: PASS — `bun test src/components/ui/icons.test.tsx src/git/GitSyncStatus.test.tsx
  tests/uiStack.test.ts tests/visualization.test.ts` completed with 17 passing tests and 1,059
  expectations; the adapter tests cover all 165 exports, distinct action concepts, forwarded refs,
  regular weight, and `currentColor`; `bunx tsc --noEmit` passed.
- AC-2: PASS — source and lockfile searches find no Hugeicons dependency or import; `bun run lint`
  passed; after rebasing onto the current `origin/main`, full `bun test` completed with 816 passing
  tests, 4,867 expectations, and zero failures across 141 files; `bun run build:renderer` passed.
  The shadcn project report resolves `iconLibrary` to `phosphor`.
- AC-3: PASS — `bunx vite --host 127.0.0.1 --port 1423` served the local renderer for real-browser
  inspection at 1280px in light and dark themes and at 900px in the Components view. All 17 visible
  SVGs used the Phosphor `0 0 256 256` view box, the 12, 14, and 16px samples retained their bounds,
  both widths reported `scrollWidth == innerWidth`, and the page had no Vite error overlay or
  browser console warning/error.
- AC-4: PASS — `bun script/verify/docs.ts`, `bun script/verify/sdlc.ts`,
  `bun script/verify/sdlc.ts --worktree`, and `git diff --check` passed.
- AC-5: PASS — `tests/uiStack.test.ts` enforces that only the shared adapter imports Phosphor, no
  Hugeicons imports or built-in emoji fallback metadata exist, and raw SVG ownership is limited to
  `ProviderIcon`, `ChartBlock`, and `Usage`. `GitSyncStatus.test.tsx` verifies localized ahead/behind
  semantics while its SVGs remain hidden from assistive technology. `cargo test -p codetwo-core`
  passed the complete Core suite, including the new built-in icon and Scene conformance assertions.

Residual risk: semantic icon selection still has a subjective visual-taste component and awaits
the human review Gate. Packaged Windows rendering was not exercised. Authored extension icons are
preserved by design and can therefore differ visually from the application family.

## Review and release

Approval: pending human visual review.
Release target: none.
Release identity: not applicable until released.
Smoke evidence: not applicable until released.
Rollback: restore the previous Hugeicons dependencies and `apps/desktop/src/components/ui/icons.tsx`, then rerun the desktop gates.
No release: this scoped change prepares a local implementation and review surface only; merge and release were not requested.

Preparing this section does not authorize merge, deployment, release, or production mutation.

## Feedback

The user's visual review of the rendered icon family is the next feedback boundary.
