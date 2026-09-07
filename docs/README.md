# CodeTwo documentation

This directory holds versioned product contracts, design decisions, change evidence, and history.
Product introduction and entry points live in the [root README](../README.md); published user guides
live in [`website/`](../website/guide/getting-started.md).

| What you need | Entry |
| --- | --- |
| Runtime ownership, memory, Scenes 1.0, and plugin contracts | [Technical reference](reference/README.md) |
| Current UI rules and explicitly pending product designs | [Design](design/README.md) |
| Architecture decisions and rationale | [Decision index](adr/README.md) |
| Requirements, acceptance, implementation scope, and verification | [Change records](sdlc/changes/) |
| Regression evidence from real changes and Incidents | [Lifecycle Eval](sdlc/evals/ai-native-sdlc-gates.md) |
| Dated investigations, completed plans, and old visual evidence | [Archive](archive/README.md) |
| Images used in published documentation | [Screenshots](screenshots/README.md) |

Development and review procedures belong to the [development Skill](../.agents/skills/codetwo-develop/SKILL.md),
packaging and publication to the [release Skill](../.agents/skills/codetwo-release/SKILL.md), and runtime
recovery and remote nodes to the [operations Skill](../.agents/skills/codetwo-operations/SKILL.md).
Each owns its references and templates. Read only the section relevant to the current task.

Keep each fact in one owning document. Current contracts describe implemented behavior; pending
designs and archived material do not override them. The [catalog](catalog.json) classifies every
`docs/` file; historical stage templates and compatibility pointers are non-current material.
`bun script/verify/docs.ts` checks local links in docs, project Skills, and repository entry points,
plus catalog coverage and referenced images. The [workflow](../.agents/skills/codetwo-develop/references/workflow.md)
owns change scope, authorization, and the rest of the lifecycle.
