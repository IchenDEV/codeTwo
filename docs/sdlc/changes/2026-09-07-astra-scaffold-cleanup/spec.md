---
id: "2026-09-07-astra-scaffold-cleanup"
stage: spec
schema: 3
status: accepted
owner: codex
created: "2026-09-07"
based_on: intent.md
risk: "low"
approved_by: "Chen Li"
approved_at: 2026-09-07
---

# Spec: Astra Scaffold Cleanup

## Requirements

Narrow Sites and lifecycle-skill triggers, extract the profile contract, and unify handoff checks while preserving production and live-instance safety boundaries.

## User experience

Generic web work must not select Sites solely because hosting.json exists. Unrelated repository tasks receive a short pointer instead of profile implementation detail.

## Technical design

Change only the Sites trigger sentence. Move the profile contract from AGENTS.md into a catalogued reference document. Align verification and lifecycle-skill triggers across AGENTS.md and both workflow guides.

## Security and privacy

Keep Sites project-id and credential rules, explicit ACP/MCP approval even in Full Access, launch ownership checks, and the full OS-lock and isolation acceptance contract.

## Alternatives and non-goals

No new runtime classifier, changed checker implementation, additional skills, or model-specific scaffolding.

## Areas of concern

Prompt wording expresses intended routing but requires a future model task evaluation to measure actual selection rates.

## Acceptance criteria

- [x] AC-1: Sites selection requires explicit OpenAI Sites intent or work on the project identified by hosting.json; the remaining safety text is unchanged.
- [x] AC-2: The complete profile implementation and acceptance contract is preserved in a catalogued document, with launch safeguards and a contextual pointer in AGENTS.md.
- [x] AC-3: Repository-change handoff uses docs and SDLC --worktree; Gate/devflow tests are triggered by relevant changes or active Evals; read-only audits do not require these runs.
- [x] AC-4: Lifecycle-skill triggers are domain-specific and prefer an installed copy; Ponytail and all approval boundaries remain unchanged.

## Decision

Accepted under Chen Li’s 2026-09-07 instruction “除`ponytail` 立即处理”, approving findings 2–5 and their concrete proposed edits.
