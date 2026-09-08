---
name: codetwo-develop
description: Implement, validate, or prepare a CodeTwo repository change for review.
---

# CodeTwo development

Use the affected area's rules and only the reference sections relevant to the requested change:

- Scope, acceptance, authorization, risk-based checks, PR handoff and feedback: [workflow](references/workflow.md).
- Toolchain, local launch, other hosts and check commands: [development](references/development.md).
- Current runtime contracts and pending designs: [documentation map](../../../docs/README.md).

Use Ponytail at default full before selecting an approach, as required by the repository's global
instructions. Finish authorized implementation and relevant verification; reuse matching evidence.
Keep templates here and generated change records in `docs/sdlc/changes/` through `./script/devflow`.
Packaging and runtime operations use the specialized Skills linked by the workflow.

Before handoff, apply the shared [cleanup contract](references/workflow.md#cleanup-and-handoff) and record what was removed or retained, including when work fails or stops.
