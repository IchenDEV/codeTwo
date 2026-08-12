# Product roadmap — accepted changes

Status: **R1–R12 implemented 2026-08-12** on `feat/scenes-v1` (accepted 2026-08-11). The Agent
Scenes standard lives at `docs/scenes.md` + `crates/core/schemas/agent-scenes/1.0.0/`; the
implementation design records are `docs/design/scenes-impl-core.md` and
`docs/design/scenes-impl-frontend.md`. R13/R14 (office scene packs, distribution) remain open.
Item ids (`R1`…) are for cross-referencing in PRs.

Implementation notes vs. this document (accepted deviations): R2's slot proposal and R11's brief
structuring ship as core heuristics (no model call) with lossless degradation; R7 pricing is a
conservative built-in prefix table (unknown models show tokens only); scene `enter` hooks fire via
`SceneRuntime::scene_activated`, wired when scene application lands runtime-side.

The four pain points this roadmap answers:

- **PP1** — the composer forces short, underspecified task descriptions.
- **PP2** — users retype the same prompts (PR submission, cleanup passes, …).
- **PP3** — information disclosure and layout: state is buried in the linear transcript.
- **PP4** — no scenario system: skills/permissions/models must be reassembled by hand per kind of
  work; no scheduling or event layer.

## P0

### R1 — Parameterized macro cards (PP2)
Fill-in UI for `Macro` skills. Selecting a Macro in the `/` picker inserts an inline card whose
`{{slot}}`s render as Tab-navigable typed fields (text / select / file), instead of leaving raw
`{{slot}}` text in the document.
- Engine exists: `crates/core/src/skill.rs` (`Macro { template, slots }`, `substitute`).
- New: slot metadata (kind/label/options/default) on the Macro payload — align with the `brief.slots`
  vocabulary in the scene schema; a BlockNote inline card in `apps/desktop/src/skillInline.tsx`;
  compile path unchanged.

### R2 — "Create template from history" (PP2)
Any previously sent prompt → context action "Save as template": the model proposes which spans
become slots; user confirms; saved as a Macro skill in the library. Entry points: transcript turn
menu (`session/TurnCard.tsx`) and command palette.

### R3 — Scene runtime + scene chip (PP4)
Implement Agent Scenes 1.0.0 per `docs/scenes.md`: loader (`crates/core/src/scene.rs`, modeled on
`SkillLibrary::load_dir` + harness-style precedence), soft/full-apply binding matrix, escalation
rule, and the composer scene chip collapsing the posture chips
(`session/Composer.tsx:771-915`), with Shift+Tab cycling (extend `crates/core/src/keymap.rs`).
Ship the five builtin scenes + `rnd-lifecycle` from `examples/` as compiled-in defaults.

## P1

### R4 — Plan as an editable document (PP1)
Agent-produced plans flow back into a BlockNote document the user edits and re-runs, instead of
living only in the TurnCard Plan detail. Plan documents are artifacts (scene artifact kind `plan`),
persist in the artifact store, can be saved into the worktree, and are referenceable from new
sessions the way session mentions are (`skillInline.tsx` sessionMention pattern).

### R5 — Task-brief templates in docMode (PP1)
The scene `brief` (template + typed slots + `clarify: multi_choice`) rendered on empty composer
documents, per the UI contract in `docs/scenes.md`. Depends on R1's slot-field component and R3.

### R6 — Cross-session mission control (PP3)
A sessions overview answering "what needs me": per-session status (running / waiting on
permission / needs review), diff stat, scene/stage, one click into review. Grow it from
`sidebar/SessionRail.tsx`'s running markers; review lands in `git/SourceControl.tsx`.

### R7 — Persistent cost/context statusline (PP3)
Always-visible session cost, burn rate, and context occupancy with green/yellow/red thresholds.
Data already exists (`session/contextWindow.ts`, `crates/core/src/usage.rs`); this is surfacing,
not plumbing.

## P2

### R8 — Hooks/event layer (PP4)
The scene hook events (`enter`, `turn_end`, `artifact_produced`, `exit_criteria_met`,
`tests_failed`, `schedule`) raised from the engine event stream (`crates/core/src/event.rs`,
`engine.rs` tool-call classification), with the allowlist actions, debounce, and off-by-default
scheduling defined in the standard. This is what makes scene suggestions and pipelines live.

### R9 — Pipeline stage-track view (PP3, PP4)
Sessions participating in a pipeline render a horizontal stage track (done / current / loop
counts); each stage expands to its artifacts and transcript span. Large UI change — deliberately
after R3/R8 stabilize.

### R10 — Dock follows the agent (PP3)
While the agent runs tests, the Dock (`dock/Dock.tsx`) auto-switches to the terminal surface;
while it edits, the files surface highlights the touched file. Drive it from the same
classification `session/agentActivity.ts` already does heuristically. User surface choice always
wins over auto-follow.

### R11 — Voice → structured brief (PP1)
Upgrade `voice/VoiceButton.tsx` from transcription to structuring: hold-to-talk, the model sorts
the spoken stream into the active scene's brief sections (goal / acceptance criteria / scope)
rather than emitting verbatim text. Identified as an industry-wide gap; pairs with R5.

### R12 — Delegation model for issues (PP4, office bridge)
"Delegate this issue to a scene": the GitHub issue import (`issues.rs`, composer insert) becomes a
delegation — user stays assignee, the delegation and its produced artifacts (PR, report) attach
back to the issue, visible as an activity trail. This is the accountability pattern (Linear-style)
that later extends to non-code work items.

## P3

### R13 — Office scene packs pilot (strategy)
Three packs built on R3–R9 with existing users: incident retrospective, release notes, tech design
review. Semi-technical scenarios with natural structure/artifacts/stages — the lowest-friction
bridge from IDE toward office work. Packaging only; the scene format is already domain-neutral.

### R14 — Scene pack distribution (strategy)
Scenes/pipelines as plugin components (schema-validated, pure data — the hub pipeline in
`crates/core/src/plugin.rs` already models component counts), plus SKILL.md export for
skill-only hosts as specified in `docs/scenes.md` §Interop.

## Dependencies at a glance

```
R1 ─┬─→ R2
    └─→ R5 ←─ R3 ─→ R8 ─→ R9
              R3 ─→ R12      R13 ←─ R3,R8,R9
R4, R6, R7, R10, R11 independent of each other; R11 pairs with R5; R14 after R3.
```
