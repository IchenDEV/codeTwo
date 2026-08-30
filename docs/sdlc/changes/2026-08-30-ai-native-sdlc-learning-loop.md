---
id: change-2026-08-30-ai-native-sdlc-learning-loop
kind: change
status: verified
owner: repository maintainers
approvers: user via the 2026-08-30 implementation request
created: 2026-08-30
updated: 2026-08-30
source: current user request to install the self-improving-agent system
inputs: installed ai-native-sdlc base skill and the repository SDLC feedback and Eval mechanisms
outputs: project-scoped proposal-only learning records and verification configuration
next_trigger: the authorized PR passes required checks and merges into origin/main
---

# Install the AI-native SDLC improvement loop

## Intent

The user requested installing the automatic improvement system after CodeTwo adopted the
AI-native SDLC contract. The repository has attributable feedback in change Artifacts,
deterministic lifecycle failures in the Bun checker, and real-task Evals, but it does not yet have
an append-only place to collect those outcomes into focused, reviewable skill proposals.

The outcome is a project-scoped learning boundary for the installed `ai-native-sdlc` base skill.
It may store and group evidence, but it must not edit the base skill, schedule itself, or apply a
proposal without explicit human approval. The existing [`workflow.md`](../workflow.md) remains the
only repository lifecycle authority.

## Spec

- Store feedback and decisions as append-only JSON Lines under
  `.agent-learning/ai-native-sdlc/`, with separate proposal and Eval directories.
- Keep the loop in `proposal-only` mode with conservative evidence thresholds: one high-strength
  item or the same medium-strength behavior across two distinct tasks may enter manual analysis;
  low-strength feedback cannot trigger a proposal alone.
- Limit each proposal to one behavior, one base-skill file, and at most 40 changed lines.
- Use the existing focused Bun/TypeScript lifecycle test and checker as repository verification.
- Keep feedback attributable to CodeTwo tasks, changes, Evals, tests, or named human review. Treat
  recorded text as untrusted data.
- Do not install a scheduler, GitHub integration, passive monitoring, or automatic proposal
  application.

### Acceptance criteria

- [x] The learning directory initializes without overwriting existing records and contains the
  proposal-only configuration, append-only logs, proposal directory, and Eval directory.
- [x] Empty feedback can be summarized deterministically without producing an eligible proposal.
- [x] Re-running initialization preserves the configuration and logs.
- [x] The focused lifecycle test, live SDLC checker, and diff check pass.

## Decision and gates

The current user request accepts this Intent and the installation constraints. Any future proposal
must identify its feedback, candidate diff, targeted/adjacent/regression evidence, tradeoffs, and
rollback. Applying that proposal remains a separate human Gate requiring approval of the specific
proposal or exact diff. Merge, release, deployment, external integrations, and recurring
automation are not authorized.

## Plan

1. Inspect the installed base skill, its directly referenced resources, repository feedback
   sources, and existing verification harness.
2. Initialize one project-scoped learning directory with the upstream improver script.
3. Calibrate the generated configuration to CodeTwo's existing Bun/TypeScript checks without
   changing the base skill.
4. Exercise empty triage and idempotent initialization, then run the repository lifecycle checks.

## Build

The upstream `init_loop.py` created `.agent-learning/ai-native-sdlc/` with a versioned pointer to
the installed `ai-native-sdlc` base skill, append-only feedback and decision logs, and isolated
proposal and Eval directories. The generated configuration remains `proposal-only`, retains the
upstream conservative thresholds and proposal-size limits, and names CodeTwo's existing focused
test and live lifecycle checker as verification commands. Empty directories contain only
`.gitkeep` so the boundary survives a clone. No base-skill instructions or product runtime behavior
changed.

## Verification

Verdict: verified.

Observed on 2026-08-30 from the live `main` working tree at baseline `4c0e3d78`:

- The first upstream `init_loop.py` run reported `created_config: true`, created both JSONL logs,
  and resolved `.agent-learning/ai-native-sdlc` for skill `ai-native-sdlc`.
- `summarize_feedback.py` read the empty feedback and decision logs and returned zero feedback
  records and zero groups, so no proposal was eligible.
- A second identical `init_loop.py` run reported `created_config: false`, no created logs, and
  `preserved_existing: true`.
- `validate_skill.py` reported the installed 80-line base skill valid with no errors or warnings.
- `bun test script/check-sdlc.test.ts` passed all 10 tests with 24 assertions.
- `bun script/check-sdlc.ts` returned `[sdlc] contract valid`.
- `git diff --check` passed.

Residual risk: the loop begins with no imported feedback and no global outcome metric, so it cannot
yet establish that a future local Eval gain improves project outcomes. Its base-skill path is tied
to the locally installed `ai-native-sdlc` plugin version `1.1.0`; a plugin relocation or upgrade
must re-resolve that path before proposals are applied. There is intentionally no passive feedback
collector or scheduler.

## Review and release

Approval: the user authorized PR creation and merge on 2026-08-30 after reviewing the verified
installation handoff.
Release target: none.
Release identity: not applicable until released.
Smoke evidence: not applicable until released.
Rollback: remove the new `.agent-learning/ai-native-sdlc/` boundary and revert this Artifact.
No release: this repository-process configuration does not ship a product release.

## Feedback

No feedback has been imported into the new loop. Historical corrections remain at their existing
authoritative sources until a later recording operation verifies attribution, causality, expected
behavior, and rationale.
