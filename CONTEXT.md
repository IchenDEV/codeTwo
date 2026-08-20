# CodeTwo Task Orchestration

This context defines the language for CodeTwo tasks, domain scenes, Agent Skills, and AI-directed
execution. It keeps a user goal distinct from the environment, method, runtime actor, and provider
session used to achieve it.

## Work

**Task**:
A user-owned goal whose status, result contract, work history, and artifacts are tracked together.
_Avoid_: Session, workflow, pipeline

**Result Contract**:
The task's current goal, required outcomes, evidence expectations, and boundaries. It may be
refined as facts emerge, but its requirements cannot be silently weakened.
_Avoid_: Fixed plan, stage checklist

**Work Item**:
One concrete piece of work that the Orchestrator currently considers useful for a Task. Work Items
are provisional and may be added, replaced, retried, or removed as evidence changes.
_Avoid_: Stage, scene node, workflow step

**Task Graph**:
The revisioned, current relationship between a Task's Work Items and artifacts. It is an
observable planning state, never a reusable or fixed workflow.
_Avoid_: Pipeline, prescribed process

**Artifact**:
A versioned result produced by a Work Item and referenced by content identity. A Task selects
which artifact versions satisfy its Result Contract.
_Avoid_: Chat response, scene output

## Environment and Method

**Scene**:
A stable domain work environment that can be attached to a Task or Work Item. A Scene is not a
method, execution stage, permission preset, model router, or completion rule.
_Avoid_: Skill, workflow stage, role

**Active Scene**:
A Scene currently attached to a Task or Work Item by the Orchestrator or user. Multiple Scenes may
be active at the same time and have no required ordering.
_Avoid_: Current stage

**Domain Pack**:
A distribution unit containing one Scene, related Agent Skills, and plugin recommendations for a
domain. Enabling a pack does not install executable dependencies or connect accounts.
_Avoid_: Workflow pack, agent template pack

**Agent Skill**:
A real, inspectable Agent Skill that teaches an Agent how to perform a reusable method. It is
preinstalled, installed from a plugin or project, or generated for a Task.
_Avoid_: Scene, arbitrary method tag, agent personality

**Temporary Agent Skill**:
A Task-scoped Agent Skill generated for a Work Item when no installed Agent Skill fits. It expires
with the Task unless the user explicitly saves it.
_Avoid_: Temporary Scene, automatically installed Skill

**Capability**:
An abstract ability needed to read or affect a resource, independent of which plugin provides it.
_Avoid_: Plugin ID, permission level

**Capability Adapter**:
An installed provider of a Capability. Selection and installation are user-controlled, while the
Orchestrator may only discover and recommend adapters.
_Avoid_: Scene dependency, implicit connector

## Execution

**Orchestrator**:
The task-level authority that maintains the Result Contract and Task Graph, selects Scenes and
Agent Skills, assigns Work Items, and evaluates results. It does not own provider inference.
_Avoid_: Workflow engine, fixed planner

**Agent**:
A runtime actor assigned to execute or orchestrate a Task. An Agent is created for current work
and is not an installable template.
_Avoid_: Agent profile, Agent Skill

**Manager Agent**:
An Agent created only when a Task becomes complex enough to require persistent orchestration. It
plans, delegates, and evaluates but does not execute domain work.
_Avoid_: Mandatory agent for every Task

**Executor Agent**:
An Agent that performs one or more compatible Work Items serially using selected Scenes, Agent
Skills, capabilities, and artifacts.
_Avoid_: Concurrent worker pool

**Session**:
A provider conversation runtime used internally by a Task. Sessions may be reused across
compatible Work Items and are not the user's primary unit of work.
_Avoid_: Task

**Task Capsule**:
A stable, bounded context shared with task Sessions: the Result Contract, approved boundaries,
resource identities, and required artifact references.
_Avoid_: Full transcript copy

**Run Snapshot**:
The authoritative revisioned view of a Task, including its Result Contract, Work Items, active
Scenes, Agent activity, artifacts, blockers, and budget state.
_Avoid_: Frontend-derived agent roster

## Control

**Provider Configuration**:
The Provider, model, and reasoning effort selected by the user for a Task. Scenes and the
Orchestrator may recommend changes but cannot apply them.
_Avoid_: Scene-selected model, automatic provider routing

**Risk Gate**:
A concrete, Core-owned confirmation for an external effect such as sending, publishing, deleting,
paying, or changing access. It is based on the real command and target, not an abstract permission
mode.
_Avoid_: Full access mode, Skill-declared safety

**Task Budget**:
The user-controlled cost, token, or time allowance together with Core-owned loop and failure
ceilings. Reaching it pauses the Task rather than changing Provider Configuration.
_Avoid_: Silent model downgrade, unbounded orchestration
