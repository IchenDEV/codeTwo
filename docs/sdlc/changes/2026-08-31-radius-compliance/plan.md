---
id: "2026-08-31-radius-compliance"
stage: plan
schema: 3
status: accepted
owner: codex
created: 2026-08-31
based_on: spec.md
risk: medium
scope: apps/desktop, .github/workflows/desktop-design-system.yml, docs/design/system.md
approved_by: "[user]"
approved_at: "2026-08-31"
---

# Plan: Enforce the product radius scale everywhere

## Files and ownership

apps/desktop, .github/workflows/desktop-design-system.yml, docs/design/system.md

## Order of work

1. Clarify the 0/12/16/24 contract in tokens and design documentation, then remove obsolete radius
   compatibility aliases.
2. Migrate renderer components, standalone embedded surfaces, CSS fallbacks, and panel geometry to
   semantic radius roles while preserving unrelated worktree edits.
3. Tighten source enforcement and focused tests, regenerate the design-debt baseline, and prove the
   rendered result in light, dark, standard, and narrow states.

Rollback restores the affected semantic classes, token aliases, lint rules, and focused tests
from their eventual repository diff; no stored data or external state is changed.

## Test-first proof

See legacy Verification section.

## Visual or integration proof

See legacy Verification section.

## Risks and mitigations

See legacy Decision and gates.

## Rollback

See legacy Review and release.

## Deviations

- All maintained renderer call sites now use semantic radius utilities or local semantic variables.
  Bare and size-named Tailwind radius utilities, direct arbitrary radius token utilities, and
  non-circular full-round tracks, switches, badges, capsules, and progress bars were removed.
- Joined dock selection indicators use square edges; true circular dots and square icon controls
  retain full-round geometry. Quick Chat and ordinary panels use 16px, their controls use 12px,
  and the Composer remains the sole 24px content surface.
- Obsolete 4px/8px radius foundations, legacy Tailwind compatibility aliases, and the radius
  allowlist entry were removed. Canvas, visualization, and annotation islands now carry exact
  12px control and 16px module fallbacks.
- The design-system scanner now reads embedded CSS declarations, rejects unknown radius variables,
  legacy utilities, and non-square `rounded-full`, while allowing only documented semantic roles,
  structural zero, and true 50% circles. Focused tests protect those failure modes.
- Rebasing onto the latest `origin/main` brought in a Feishu section toggle that still used bare
  `rounded`; the same semantic migration changed it to `rounded-control` before PR verification.

## Decision

The user's direct implementation request accepts Intent and the visible radius hierarchy. The
repository's existing semantic token system and current UI documentation are the design source of
truth. Human review remained the next Gate after verification. The user accepted that Gate and
authorized PR creation and merge on 2026-08-31. Release, deployment, and production mutation remain
unauthorized.
