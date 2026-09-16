---
id: 2026-09-16-align-design-contracts
schema: 5
stage: intent
status: accepted
owner: chenli
created: 2026-09-16
source: user
risk: medium
approved_by: chenli
approved_at: 2026-09-16
approval_source: "Direct request: 进行治理, after the audit list of governance findings in this session."
next_trigger: chenli reviews the verified work.
---

# Intent: Align the design contracts with the code

## Intent

The governance item of the agreed repair order: make the design system's machine-readable contracts
describe what the code actually does, register the shared module the doc omits, and give the loading
contract real callers.

Findings, re-verified against the live checkout:

1. `apps/desktop/layout-spec.json` disagrees with the token sheet on three vertical-rhythm numbers
   (`titlebarHeight` 48 versus the 46px `--ds-titlebar-height`, `normalControlHeight` 28 versus the
   32px `--ds-control-normal`, `fieldControlHeight` 32 versus the 36px `--ds-control-field`) and the
   stale titlebar value also appears under `shell`. Nothing fails when the two drift apart: the file
   is read only by tests.
2. `apps/desktop/src/settings/SettingsPrimitives.tsx` is the settings-scoped shared layer (Page, Row,
   ProjectRow, GroupHeading) used by six settings pages, but `docs/design/system.md` never registers
   it and the `PageHeader` caller list omits every settings page, so the doc's component map and the
   code disagree.
3. `LoadFeedback` — the doc's owner for content-blocking loading and recoverable failures — has no
   product caller; only the development preview renders it. `github/PullRequestsPage.tsx` hand-rolls
   the identical shape four times (list and detail, loading and failure).
4. Correction to this session's earlier audit: `ControlChip` is **not** a dead contract — the
   composer and `SceneChip` import it (aliased as `Chip`), with nine call sites. The earlier claim
   came from grepping the literal `<ControlChip` tag; the record for that audit is superseded here.

Outcome: the layout spec and the token sheet agree and a test fails if they drift again; the design
doc registers the settings-scoped layer and names its real callers; the pull-request workspace uses
the shared `LoadFeedback` for all four of its blocking states.

Constraints: no visual redesign of the loading and failure states (the shared component's treatment
is the target), no change to layout-spec's already-correct numbers, and no move or rename of the
settings module in this change — only its registration.

Non-goals: the remaining governance items from the audit (status-language convergence, action
budget, motion and focus work, the `xs` variant, legacy aliases, off-scale icons) stay in their own
records.

## Non-goals

No new component, no behavior change beyond routing the four existing blocking states through the
shared component, and no rewrite of the design doc's enforcement section.
