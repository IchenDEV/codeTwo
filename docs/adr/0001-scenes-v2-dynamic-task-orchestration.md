---
status: accepted
---

# Replace scene pipelines with dynamic task orchestration

Related records: [canonical language](../../CONTEXT.md),
[product specification](../design/scenes-v2.md), and
[implementation plan](../design/scenes-v2-implementation-plan.md).

CodeTwo will replace Agent Scenes 1.0 with a breaking Scenes 2.0 model. A Scene is a stable domain
work environment; a Task owns a dynamic Result Contract and revisioned Work Items; and every Skill
used by Scenes 2.0 is a real installed, project-provided, or task-generated Agent Skill. CodeTwo
will not ship fixed Pipelines, workflow templates, agent templates, or Scene-owned model and
permission presets.

We chose this over extending the existing stage-and-Pipeline model because broader development,
testing, operations, UX, data, content, and office work cannot share one prescribed sequence.
Concrete methods such as code review and meeting summarization belong in Agent Skills, while the
Orchestrator must be free to add, replace, retry, or remove Work Items from current evidence.

Scenes 2.0 has no runtime compatibility layer and performs no data migration. Existing Scenes 1.0
files and historical data remain untouched on disk but are ignored by the 2.0 runtime. During
development, old and new code may coexist behind an internal cutover gate so every commit remains
buildable; the released 2.0 runtime must contain only the new path.

Execution is serial by default: a Task has at most one active Executor Agent. Simple Tasks use one
Executor; complex Tasks may add a persistent Manager Agent and serial Executors. Provider, model,
and reasoning effort remain user-controlled. Sessions are reused when their stable context is
compatible, preserving provider cache opportunities, and native provider subagents are not
authoritative Task Graph nodes until a provider exposes complete lifecycle control.

Scene Profiles, the exact context-mount and state-observation contract, and the initial Agent Skill
catalog for each domain are deliberately deferred.
