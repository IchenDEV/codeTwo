---
id: "2026-08-30-ai-native-sdlc-learning-loop"
stage: spec
schema: 3
status: accepted
owner: repository maintainers
created: 2026-08-30
based_on: intent.md
risk: low
approved_by: "userthe 2026-08-30 implementation request"
approved_at: "2026-08-30"
---

# Spec: Install the AI-native SDLC improvement loop

## Requirements

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

## User experience

Not separately recorded in legacy change.md.

## Technical design

See Requirements and legacy Git history.

## Security and privacy

See migrated Decision and gates.

## Alternatives and non-goals

Not separately recorded in legacy change.md.

## Areas of concern

The current user request accepts this Intent and the installation constraints. Any future proposal
must identify its feedback, candidate diff, targeted/adjacent/regression evidence, tradeoffs, and
rollback. Applying that proposal remains a separate human Gate requiring approval of the specific
proposal or exact diff. Merge, release, deployment, external integrations, and recurring
automation are not authorized.

## Acceptance criteria

- [x] AC-1: The learning directory initializes without overwriting existing records and contains the
  proposal-only configuration, append-only logs, proposal directory, and Eval directory.
- [x] AC-2: Empty feedback can be summarized deterministically without producing an eligible proposal.
- [x] AC-3: Re-running initialization preserves the configuration and logs.
- [x] AC-4: The focused lifecycle test, live SDLC checker, and diff check pass.

## Decision

The current user request accepts this Intent and the installation constraints. Any future proposal
must identify its feedback, candidate diff, targeted/adjacent/regression evidence, tradeoffs, and
rollback. Applying that proposal remains a separate human Gate requiring approval of the specific
proposal or exact diff. Merge, release, deployment, external integrations, and recurring
automation are not authorized.
