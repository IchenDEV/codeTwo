---
id: 2026-09-16-unify-settings-page-rhythm
schema: 5
stage: spec
status: accepted
owner: chenli
created: 2026-09-16
based_on: intent.md
---

# Spec: Unify the settings page rhythm

## Design

1. **One measure.** Every tab renders inside `.settings-page` (48rem), matching
   `apps/desktop/layout-spec.json` `content.settings.maxWidth`. Delete `.settings-profile-page` and
   `.settings-worktrees-page` and their `SettingsPage.tsx` conditionals. The Profile stat grid and
   activity grid already have container-query fallbacks, so the narrower measure reflows instead of
   overflowing.
2. **One page-title block.** Tabs use `Page`/`PageHeader`. `usage/Usage.tsx` renders `PageHeader`
   with its controls as `actions`, replacing the local `h1` + description block. Profile keeps its
   identity hero, whose `h1` already consumes the shared page-title role, and is recorded here as the
   one intentional variation rather than silently rebuilt.
3. **One section-heading role.** Settings sections use the shared `SettingsSection` (title 14/600,
   optional description, optional actions, 12px content inset) or the shared `GroupHeading` where the
   container already owns the spacing, and both shared headings carry the same 14px/600 treatment —
   `SettingsSection`'s 500-weight title was the outlier against `GroupHeading` and `PageHeader`.
   Appearance's six sections and Memory's policy columns and
   detail sections convert; `.appearance-settings-heading`, `.appearance-section`,
   `.appearance-section-header`, `.appearance-section-actions`, `.appearance-section-hint`,
   `.memory-policy-column h2`, and `.memory-detail-section h3` are removed. `GroupHeading` gains an
   optional `className` so an already-spaced container can suppress its default top spacing.
   The obsolete `.appearance-section-header`/`.appearance-section-actions` container-query overrides
   go with them; `SettingsSection` already wraps its own header and actions.
4. **One grouped-row plane.** Grouped setting rows use the documented card plane
   `--ds-color-surface`: `.worktree-policy-card` and `.memory-policy-column + .memory-policy-column`
   stop using `--ds-color-fill-quiet`, matching `.pet-setting-group` and `.appearance-setting-group`.
   Result and status banners keep their own treatment and are out of scope.
5. **One 28px button treatment.** `sm` becomes an alias of `compact` in `buttonVariants` (same
   height, padding, gap, and typography), so the 60+ existing `size="sm"` call sites stop rendering a
   second 28px look. `xs` remains the dense 12px variant and is untouched.

## Acceptance criteria

- [x] AC-1: Every settings tab renders inside one 48rem measure; no `.settings-profile-page`,
  `.settings-worktrees-page`, or per-tab width override remains.
- [x] AC-2: Appearance renders through the shared section anatomy; the removed `appearance-*`
  section/heading rules are gone, every `appearance-*` heading id still labels its region, and
  `SettingsSection` and `GroupHeading` render one 14px/600 heading treatment.
- [x] AC-3: Memory section headings render the shared 14/600 role; the local 12/600 `h2`/`h3` rules
  are gone.
- [x] AC-4: Usage renders title and description through `PageHeader`; no hand-rolled page-title `h1`
  remains in `usage/Usage.tsx`.
- [x] AC-5: Worktree and Memory grouped rows sit on the surface plane; no `fill-quiet` grouped-row
  card remains in settings.
- [x] AC-6: `size="sm"` and `size="compact"` resolve to the same 28px button classes.
- [x] AC-7: Desktop lint, type, tests, and renderer build pass, and a rendered settings capture in
  light and dark shows one measure and one heading rhythm.
