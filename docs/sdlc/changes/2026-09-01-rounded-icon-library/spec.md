---
id: "2026-09-01-rounded-icon-library"
stage: spec
schema: 3
status: accepted
owner: codex
created: 2026-09-01
based_on: intent.md
risk: medium
approved_by: "[user]"
approved_at: "2026-09-01"
---

# Spec: Adopt a rounder desktop icon family

## Requirements

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

## User experience

Not separately recorded in legacy change.md.

## Technical design

See Requirements and legacy Git history.

## Security and privacy

See migrated Decision and gates.

## Alternatives and non-goals

Not separately recorded in legacy change.md.

## Areas of concern

The user approved Intent and implementation through the direct request on 2026-09-01. Phosphor was
selected over Tabler and Lucide because its rounded silhouettes and family-wide weights better fit
the requested direction while retaining React tree-shaking and MIT licensing. The implementation
preserves familiar icon concepts in line with the macOS HIG Icons and SF Symbols guidance.

No security, data, provider, merge, release, deployment, or production Gate is granted. Final
visual taste remains a human review Gate after the rendered evidence is available.

## Acceptance criteria

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

## Decision

The user approved Intent and implementation through the direct request on 2026-09-01. Phosphor was
selected over Tabler and Lucide because its rounded silhouettes and family-wide weights better fit
the requested direction while retaining React tree-shaking and MIT licensing. The implementation
preserves familiar icon concepts in line with the macOS HIG Icons and SF Symbols guidance.

No security, data, provider, merge, release, deployment, or production Gate is granted. Final
visual taste remains a human review Gate after the rendered evidence is available.
