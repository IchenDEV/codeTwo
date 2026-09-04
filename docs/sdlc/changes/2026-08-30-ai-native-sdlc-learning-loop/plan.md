---
id: "2026-08-30-ai-native-sdlc-learning-loop"
stage: plan
schema: 3
status: accepted
owner: repository maintainers
created: 2026-08-30
based_on: spec.md
risk: low
scope: .agent-learning/ai-native-sdlc, docs/sdlc
approved_by: "userthe 2026-08-30 implementation request"
approved_at: "2026-08-30"
---

# Plan: Install the AI-native SDLC improvement loop

## Files and ownership

.agent-learning/ai-native-sdlc, docs/sdlc

## Order of work

1. Inspect the installed base skill, its directly referenced resources, repository feedback
   sources, and existing verification harness.
2. Initialize one project-scoped learning directory with the upstream improver script.
3. Calibrate the generated configuration to CodeTwo's existing Bun/TypeScript checks without
   changing the base skill.
4. Exercise empty triage and idempotent initialization, then run the repository lifecycle checks.

## Test-first proof

See legacy Verification section.

## Visual or integration proof

See legacy Verification section.

## Risks and mitigations

See legacy Decision and gates.

## Rollback

See legacy Review and release.

## Deviations

The upstream `init_loop.py` created `.agent-learning/ai-native-sdlc/` with a versioned pointer to
the installed `ai-native-sdlc` base skill, append-only feedback and decision logs, and isolated
proposal and Eval directories. The generated configuration remains `proposal-only`, retains the
upstream conservative thresholds and proposal-size limits, and names CodeTwo's existing focused
test and live lifecycle checker as verification commands. Empty directories contain only
`.gitkeep` so the boundary survives a clone. No base-skill instructions or product runtime behavior
changed.

## Decision

The current user request accepts this Intent and the installation constraints. Any future proposal
must identify its feedback, candidate diff, targeted/adjacent/regression evidence, tradeoffs, and
rollback. Applying that proposal remains a separate human Gate requiring approval of the specific
proposal or exact diff. Merge, release, deployment, external integrations, and recurring
automation are not authorized.
