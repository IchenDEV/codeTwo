---
id: 2026-09-16-unify-settings-page-rhythm
schema: 5
stage: intent
status: accepted
owner: chenli
created: 2026-09-16
source: user
risk: medium
approved_by: chenli
approved_at: 2026-09-16
approval_source: "Direct request: 开始按照顺序打勾修复, following 还有页面风格和排版不统一（特别设置里面的页面） and the agreed repair order whose first item is the settings-page cohort."
next_trigger: chenli reviews the verified work.
---

# Intent: Unify the settings page rhythm

## Intent

The user reports that page style and typography are inconsistent, especially inside Settings. A code
survey confirms measurable divergence inside one shell:

- two content measures: `.settings-page` 48rem versus `.settings-profile-page` and
  `.settings-worktrees-page` at 64rem;
- three page-title blocks: shared `Page`/`PageHeader` in most tabs, a hand-rolled
  `text-page font-semibold tracking-tight` `h1` in `usage/Usage.tsx`, and the Profile identity `h1`;
- four section-heading treatments: shared `SettingsSection` 14/600, an 18px
  `.appearance-settings-heading`, a 14px local worktree `h2`, and raw Memory `h2`/`h3` whose only
  style is file-local CSS at 12/600;
- three grouped-row planes: `--ds-color-surface` for pets and appearance, `--ds-color-fill-quiet`
  for the worktree policy card and the memory policy column;
- one 28px button height spelled three ways (`sm`, `xs`, `compact`) with different padding and type.

Outcome: one settings anatomy — one measure, one page-title block, one section-heading role, one
grouped-row plane, one 28px button treatment — so any settings tab reads as the same product without
per-page inspection.

Constraints: visual and structural only. No behavior, data, copy, navigation, token value, radius,
color, elevation, or motion change. Keep every `aria-labelledby` relationship and heading id. Keep
the Profile identity hero (avatar, name, handle, bio, share) as that tab's header: it is a designed
identity block, not a form header, and it already uses the shared page-title typography.

Non-goals: the remaining design-consistency program (governance registry, status-language
convergence, action budget, motion and focus follow-ups) stays in its own records. The dense `xs`
button variant and the broader spacing-vocabulary cleanup are not decided here.

## Non-goals

No settings behavior or copy change, no new shared component, no token or appearance-palette change,
and no removal of the `xs` button size in this change.
