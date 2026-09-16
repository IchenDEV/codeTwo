---
id: 2026-09-16-unify-settings-page-rhythm
schema: 5
stage: plan
status: accepted
owner: chenli
created: 2026-09-16
based_on: spec.md
scope: apps/desktop/src/settings/SettingsPage.tsx, apps/desktop/src/settings/settings-page.css, apps/desktop/src/settings/SettingsPrimitives.tsx, apps/desktop/src/settings/AppearanceSettings.tsx, apps/desktop/src/settings/appearance-settings.css, apps/desktop/src/settings/MemorySettings.tsx, apps/desktop/src/settings/memory-settings.css, apps/desktop/src/usage/Usage.tsx, apps/desktop/src/components/ui/button.tsx, apps/desktop/src/components/business/settings-section.tsx, apps/desktop/tests/settingsRhythmContract.test.ts, apps/desktop/tests/settingsLayoutContract.test.ts, apps/desktop/tests/appearanceSettings.test.tsx, docs/sdlc/changes/2026-09-16-unify-settings-page-rhythm
---

# Plan: Unify the settings page rhythm

## Plan

1. `apps/desktop/src/settings/SettingsPage.tsx` and `settings-page.css` — drop the per-tab width
   conditionals and the two 64rem rules so every tab uses `.settings-page` (48rem). (AC-1)
2. `apps/desktop/src/settings/AppearanceSettings.tsx` and `appearance-settings.css` — convert the six
   `.appearance-section` blocks to `SettingsSection`, moving section actions into its `actions` prop
   and the hint into `description`; delete the superseded heading/section/hint rules and their
   container-query overrides. (AC-2)
3. `apps/desktop/src/settings/SettingsPrimitives.tsx` — let `GroupHeading` accept an optional
   `className` for containers that already own their top spacing.
4. `apps/desktop/src/settings/MemorySettings.tsx` and `memory-settings.css` — render the four Memory
   section headings through `GroupHeading`; delete the local 12/600 `h2`/`h3` rules. (AC-3)
5. `apps/desktop/src/usage/Usage.tsx` — replace the local page-title block with `PageHeader`, keeping
   the existing bottom spacing holder. (AC-4)
6. `settings-page.css` and `memory-settings.css` — `worktree-policy-card` and the memory policy
   column move from `fill-quiet` to the `surface` card plane. (AC-5)
7. `apps/desktop/src/components/ui/button.tsx` — make `size: "sm"` byte-identical to `size:
   "compact"`. (AC-6)
8. `apps/desktop/src/components/business/settings-section.tsx` — the shared section title moves from
   Tailwind's 500 `font-medium` to the 600 weight that `GroupHeading` and `PageHeader` already use,
   so the settings heading role has one treatment. (AC-2, found during rendered verification)
9. `apps/desktop/tests/settingsRhythmContract.test.ts` — source-contract test in the
   `composerGeometryContract.test.ts` style: asserts the removed classes/rules stay gone, the shared
   anatomy and heading weight are used, and `sm`/`compact` stay identical.
   `tests/settingsLayoutContract.test.ts` and `tests/appearanceSettings.test.tsx` encode the
   superseded divergences and move to the unified contract in the same change.

Checks by risk and affected behavior:

- Desktop: `bun run lint`, `bunx tsc --noEmit`, `bun test`, `bun run build:renderer` from
  `apps/desktop`. The existing `tests/appearanceSettings.test.tsx` mounts the real Appearance
  component, so the conversion is exercised by the suite.
- Rendered UI (AC-1, AC-2, AC-3, AC-4, AC-7): the desktop renderer was served with
  `bun run dev:renderer --port 1420` (task-owned, no Core, the user's instance untouched) and driven
  through the agent's collaborative browser: the UI Lab settings scenario for the shared section
  anatomy, and the real empty-shell app for every settings tab's measure and heading role. If a
  surface cannot render in this environment, the gap is recorded as residual risk instead of being
  claimed.
- Repository: `bun script/verify/sdlc.ts --worktree` before handoff.

Temporary resources: the task-owned renderer log root
`.codex/run/2026-09-16-unify-settings-page-rhythm/` and the Vite dev server on port 1420, plus the
repository's ignored `apps/desktop/dist/` renderer output and bun cache. The dev server is stopped
and the log removed before handoff; screenshots retained as Verification evidence.

Rollback: `git revert` of the single commit; every edit is visual or structural markup with no data,
protocol, or persistence surface.
