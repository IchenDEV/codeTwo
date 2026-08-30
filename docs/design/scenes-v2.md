# Scenes 2.0

Status: **Accepted product contract; implementation pending**

Related records: [canonical language](../../CONTEXT.md),
[breaking-change ADR](../adr/0001-scenes-v2-dynamic-task-orchestration.md), and
[implementation plan](./scenes-v2-implementation-plan.md).

This document is normative for the Scenes 2.0 product model. It records the decisions reached in
the product grilling that ended on 2026-08-21. It intentionally separates confirmed behavior from
deferred design so implementation does not fill gaps by guessing.

## 1. Purpose

Scenes 2.0 makes CodeTwo useful across software development, testing, operations, product
research, UX and design, data analysis, content and growth, and office collaboration.

It does this without prescribing a workflow. The user owns a Task; AI maintains a dynamic set of
Work Items from current evidence; Scenes supply stable domain context; Agent Skills supply
methods; Agents execute; and Core enforces persistence, budgets, and concrete risk gates.

Scenes 2.0 is a clean break from Agent Scenes 1.0.

## 2. Normative language

The words MUST, MUST NOT, SHOULD, SHOULD NOT, and MAY describe product requirements.

The canonical terms are defined in the repository root [CONTEXT.md](../../CONTEXT.md). In
particular:

- A Task is the user-facing unit of work.
- A Work Item is a provisional unit in the current Task Graph.
- A Scene is a domain work environment.
- An Agent Skill is a real installed, project-provided, or task-generated Agent Skill.
- An Agent is a runtime actor, not a template.
- A Session is provider runtime state internal to a Task.

## 3. Non-negotiable invariants

| Invariant | Requirement |
| --- | --- |
| No fixed flow | The runtime MUST NOT define or execute Pipelines, fixed stages, prescribed transitions, or reusable workflow graphs. |
| Dynamic orchestration | AI MAY add, replace, retry, reorder, or remove Work Items from current evidence. |
| Task-first product | The Task, not Session, is the primary navigation, status, and completion object. |
| Scene is environment | A Scene MUST NOT be used as a method, stage, role, permission preset, model router, or completion rule. |
| Real Agent Skills | Within Scenes 2.0, Skill always means an inspectable Agent Skill from an allowed source. |
| Serial execution | A Task MUST have at most one active Executor Agent. |
| User model control | Provider, model, and reasoning effort MUST be selected and changed by the user. |
| Cache-aware sessions | A Work Item MUST NOT imply a new Session; compatible Sessions SHOULD be reused. |
| Concrete risk gates | Sending, publishing, deleting, paying, and access changes MUST be confirmed as concrete effects by Core. |
| No silent installation | AI MUST NOT install plugins, connect accounts, or persist generated Agent Skills. |
| No 1.0 compatibility | The 2.0 runtime MUST NOT load, resolve, alias, convert, or execute 1.0 Scenes or Pipelines. |
| Honest observability | Missing provider cache, cost, lifecycle, or capability receipts MUST be reported as unknown, not estimated as fact. |

## 4. Domain model

The product relationship is:

    Task
      owns Result Contract
      owns dynamic Task Graph
        contains Work Items
          attach zero or more Scenes
          select zero or more Agent Skills
          run through an Agent Session
          consume and produce Artifacts

The Orchestrator maintains that relationship. It does not prescribe a reusable graph.

### 4.1 Task

A Task MUST persist:

- the user's goal;
- the current Result Contract;
- the user-selected Provider Configuration;
- current status: active, paused, completed, partially completed, blocked, or cancelled;
- budget state and observability boundaries;
- the revisioned Task Graph;
- active and historical Agents and Sessions;
- produced Artifacts and their provenance;
- concrete risk requests and decisions;
- orchestration decisions and their user-visible reasons.

A Task MAY begin as one simple Work Item. The system MUST NOT create a Manager Agent merely
because the prompt is long.

### 4.2 Result Contract

The Orchestrator MUST derive a Result Contract from the user's goal. It contains:

- the outcome to achieve;
- required deliverables;
- verifiable completion conditions;
- boundaries and explicit non-goals;
- known risks and unresolved facts.

The Orchestrator MAY add or refine requirements as evidence emerges. It MUST NOT silently delete,
weaken, or rewrite an existing requirement. A material goal change MUST record the before state,
after state, and reason.

The user MUST NOT be forced through a setup form when the request already provides enough
information. The Agent SHOULD ask only when a material ambiguity or risk boundary blocks safe
progress.

### 4.3 Work Item and Task Graph

The Orchestrator changes Work Items, not Scenes. A Work Item MUST identify:

- its objective;
- relevant Result Contract conditions;
- attached Scenes;
- selected Agent Skills;
- required input Artifact references;
- the expected outputs and completion evidence for this attempt;
- current status and blockers;
- assigned Agent Session, if any;
- the reason it was added or changed.

The Task Graph is provisional. Unstarted Work Items MUST be shown as tentative. The user MAY
insert, replace, prohibit, pause, or cancel Work Items. The Orchestrator MAY revise the graph
without per-step confirmation, except where a concrete risk gate, plugin installation, or
Provider Configuration change is required.

The Task Graph MUST be revisioned. An AI-produced graph change MUST target an expected base
revision, and Core MUST reject stale or invalid changes rather than merging them heuristically.

### 4.4 Artifact

An Artifact belongs to a Work Item attempt. It MUST record:

- Task and Work Item identity;
- attempt and version;
- producing Agent Session;
- attached Scenes and selected Agent Skills;
- Provider Configuration;
- content identity and storage reference;
- creation time and status.

Retrying a Work Item MUST create a new Artifact version rather than overwrite the old one. The
Task MUST identify which Artifact versions satisfy its Result Contract. AI MAY recommend a version
but the user MAY pin, replace, or reject it.

Artifact transfer between Work Items SHOULD use references and content identities. The system
MUST NOT copy an entire transcript merely to hand off work.

## 5. Scenes

### 5.1 Meaning

A Scene is a stable domain work environment. Multiple Scenes MAY be attached to one Task or Work
Item and have no inherent order.

The initial official Domain Packs each contain one Scene:

1. Software Development
2. Testing and Quality
3. Operations and Reliability
4. Product and Research
5. UX and Design
6. Data Analysis
7. Content and Growth
8. Office and Collaboration

The official packs SHOULD be enabled on demand. The core product MAY provide general Agent Skills,
but it MUST NOT restore generic stage Scenes such as Research, Develop, Test, Fix, or Acceptance.

### 5.2 Sources

Scenes MAY come from:

- official read-only Domain Packs;
- personal definitions;
- project-shared definitions;
- installed plugins.

An official Scene MUST be duplicated before customization. A plugin-contributed Scene MUST name
its publisher, version, provided domain, related Agent Skills, capability namespaces, and plugin
requirements.

A new Scene is justified only by a distinct domain environment, resource model, or risk model.
Packaging a method such as code review, regression testing, or meeting summarization as a Scene
is invalid; those are Agent Skills.

### 5.3 Automatic attachment

AI MAY attach and detach Scenes without asking for each change. The UI MUST show:

- which Scenes are active;
- why each Scene was attached;
- which Agent Skills were selected;
- which capabilities are ready, degraded, missing, or blocked.

The user MAY add, remove, prohibit, or lock a Scene. A locked Scene MUST NOT be detached by AI.

### 5.4 Minimum 2.0 definition

The first implementation MAY keep Scene Definition deliberately small:

- stable identity and version;
- title, description, domain, localization, authorship, and provenance;
- Agent Skill discovery selectors;
- capability discovery namespaces;
- sanctioned extension data.

The schema MUST NOT reintroduce 1.0 execution posture, brief, artifact ownership, exit criteria,
hooks, next-stage suggestions, or Pipeline fields as placeholders.

The exact context-mount, state-observation, host-surface, and Scene Profile contracts are deferred.
Implementation MUST NOT invent them inside the initial schema.

## 6. Agent Skills

### 6.1 Authenticity

Within Scenes 2.0, every selected Skill MUST be a real Agent Skill from exactly one of these
sources:

- preinstalled by CodeTwo;
- installed from an explicit plugin;
- provided by the current project;
- generated for the current Task.

An arbitrary label, prompt fragment, Macro, MCP server, subagent definition, or agent personality
MUST NOT be presented as an Agent Skill merely to satisfy this contract.

Existing CodeTwo implementation types may continue outside Scenes 2.0, but the 2.0 resolver MUST
filter for authentic Agent Skills.

### 6.2 Selection

Scenes expose discovery scope; the Orchestrator selects Agent Skills for a Work Item. The same
Agent Skill MAY be selected under multiple Scenes. Scene definitions MUST reference Agent Skill
identity or selectors and MUST NOT copy Skill bodies.

The Work Item, not the Agent Skill, owns this attempt's concrete expected outputs and completion
conditions. An Agent Skill teaches how to work; it does not own Task completion.

### 6.3 Temporary Agent Skills

When no installed Agent Skill fits, AI MAY generate a Task-scoped Agent Skill. It:

- MUST have the same inspectable structure and validation as other Agent Skills;
- MUST be marked as AI-generated and temporary;
- MUST NOT gain capabilities beyond the Work Item's approved capability set;
- MUST NOT be installed into personal or project catalogs automatically;
- MUST expire with the Task unless the user explicitly saves it.

AI MUST NOT generate a temporary Scene to solve a missing-method problem.

## 7. Orchestration and Agents

### 7.1 No fixed workflow

Domain Packs MUST NOT contain Pipelines, workflow templates, fixed stage lists, transition graphs,
or implicit next-stage hooks. Historical task behavior MAY inform retrieval and recommendations,
but MUST NOT be replayed as a prescribed graph.

The Orchestrator MAY learn:

- effective Scene and Agent Skill choices for similar goals;
- user prohibitions and preferences;
- available project capabilities;
- common evidence patterns and failure causes;
- observable Provider, model, cost, duration, and cache data.

Learning MUST retain scope and provenance. Sensitive Artifact bodies MUST NOT enter orchestration
experience merely to improve routing.

### 7.2 Simple and complex Tasks

The logical Orchestrator exists for every Task, but a physical Manager Agent is created lazily:

- a simple, one-Work-Item Task uses one Executor Agent;
- a Task that needs persistent decomposition, repeated evaluation, or multiple Work Items MAY add
  a Manager Agent;
- once created, the Manager Agent plans, assigns, and evaluates but MUST NOT execute domain work.

Agent roles are runtime labels. CodeTwo MUST NOT create an installable Agent template library.

### 7.3 Serial execution

A Task MUST have no more than one active Executor Agent. Different Executor Agents MAY run
serially as the Task changes domain, method, or context. Parallel read or write execution is out
of scope for the first release.

This serial rule does not prohibit a Provider from using private internal mechanisms while
answering one Session. Such internal work is opaque implementation of that Work Item; it MUST NOT
be treated as authoritative Task Graph nodes without a complete provider lifecycle adapter.

### 7.4 Planner output

AI MUST NOT write Task Graph state directly. It proposes a bounded graph patch containing:

- expected base revision;
- a user-visible reason;
- additions, updates, retries, cancellations, or completion proposals;
- references to installed Scenes, Agent Skills, capabilities, and Artifacts.

Core validates identity, revision, serial-execution rules, budgets, loop ceilings, capabilities,
and risk effects before accepting the patch. Unknown references MUST be surfaced rather than
silently dropped.

## 8. Provider and Session contract

### 8.1 User control

The user selects Provider, model, and reasoning effort for a Task. All Manager and Executor
Sessions inherit that configuration.

Scenes and AI:

- MAY report a missing model capability;
- MAY recommend a different configuration;
- MUST NOT apply a configuration change;
- MUST NOT send context to another Provider without user action.

If the user changes Provider Configuration, the system MUST mark a cache and context boundary. If
the old Session cannot be restored, a new Session receives only the Task Capsule and required
Artifacts.

### 8.2 Provider ownership

The Provider owns inference, provider context, and provider-native tool behavior. CodeTwo owns the
Task Graph, persistence, scheduling, capability resolution, and risk gates.

The first release MUST use ordinary CodeTwo Sessions as the controllable Executor adapter. A
provider-native subagent MUST NOT become a first-class Work Item Agent until the provider exposes
complete spawn, status, result, usage, and cancellation receipts.

Cancellation without a terminal provider receipt MUST remain visible as uncertain. The
Orchestrator MUST NOT immediately assign the same external side effect to a new Agent.

### 8.3 Session reuse and cache stability

A Work Item is not a Session. The system SHOULD maintain:

- one long-lived Manager Session when a Manager Agent exists;
- a bounded pool of reusable Executor Sessions;
- at most one active Executor Session per Task.

A Session is reusable only when Provider Configuration, Scene set, Agent Skill set, capability
manifest, workspace scope, and stable prompt identity are compatible.

Prompt compilation SHOULD keep stable material before volatile material:

1. CodeTwo invariant instructions;
2. project rules snapshot;
3. deterministically ordered tools and capability manifest;
4. stable Task Capsule;
5. stable Scene and Agent Skill material;
6. Work Item objective and changing Artifact content.

Stable prompt inputs MUST use deterministic ordering and content identities. Retry SHOULD reuse a
compatible Session. A plugin or MCP set change is a Session boundary when the Provider binds it at
session creation.

Provider cache hits are observable only when the Provider supplies trustworthy data. CodeTwo MAY
display a structural reusable-prefix ratio, but MUST label it as a CodeTwo metric rather than a
Provider cache hit.

## 9. Capabilities and plugins

### 9.1 Resolution

A Scene declares capability discovery namespaces. Agent Skills and Work Items declare concrete
needs. The Task resolves those needs only after Agent Skill selection.

A Capability has one of these states:

- ready;
- degraded with an explicit fallback;
- blocked because a required adapter is missing;
- unknown because readiness cannot be verified.

### 9.2 Installation

AI MAY recommend an adapter but MUST NOT install it. Before installation, the UI MUST show:

- plugin identity, publisher, and version;
- capabilities provided;
- installation scope;
- external accounts required;
- read and effect categories;
- which Work Item is blocked without it.

The user chooses personal or project installation. After installation the Work Item readiness
check runs again. Disabling or uninstalling an adapter MUST move dependent Work Items to degraded
or blocked state.

Scene packs and executable capability adapters MUST version independently. Updating declarative
domain content MUST NOT force an executable plugin update.

## 10. Effects and risk gates

Core owns effect classification. Plugins MUST describe command effects such as:

- read;
- local modification;
- external modification;
- send;
- publish or deploy;
- delete;
- payment;
- access administration.

Unknown effects MUST fail closed. Scene and Agent Skill text may describe expected effects but
cannot lower Core classification.

The product MUST distinguish preparation from execution, including:

- email draft versus send;
- build versus production deploy;
- calendar read versus external invitation;
- proposed change versus deletion;
- cost estimate versus payment.

A Risk Gate MUST identify the actual action, target, scope, and expected effect. The user does not
select an abstract permission mode. Refusal blocks that effect; the Orchestrator MAY propose a
draft, preview, or read-only alternative.

## 11. Budgets, loops, and completion

The user MAY set cost, token, or time budgets. Core MUST additionally enforce ceilings for:

- consecutive failures;
- repeated Work Item or Agent Skill attempts;
- replans with no new Artifact or evidence;
- total attempts when provider cost is unavailable.

Approaching a budget SHOULD complete the current safe Work Item and report remaining work.
Reaching a budget MUST pause the Task. The system MUST NOT switch Provider, model, reasoning
effort, or billing state to continue automatically.

Completion requires:

- every required Result Contract condition has evidence or an explicit unknown;
- no required Work Item remains active or silently abandoned;
- failures, skips, and unverifiable conditions are listed;
- concrete risk decisions are reflected in the result;
- the final status is completed, partially completed, or blocked.

Completing a Task does not require a user to approve every prior Work Item or Scene change.

## 12. Product interface

### 12.1 Primary navigation

The primary hierarchy is:

    Project
      Task
        Result Contract
        live Task Graph
        Agents and Sessions
        Artifacts

Sessions MUST be available for inspection and debugging but SHOULD NOT occupy the primary task
rail by default.

### 12.2 Task surface

The Task surface MUST show:

- overall goal and status;
- active Scenes as compact work-context labels;
- current and tentative Work Items;
- the active Agent and Session;
- Artifact versions and completion evidence;
- graph adjustments and reasons;
- blockers, missing plugins, budget state, and risk requests.

The user MUST be able to pause, cancel, prohibit a direction, insert a Work Item, and inspect
Sessions. AI MAY change Scenes and Work Items without a confirmation dialog.

The following images are non-normative layout concepts, not acceptance evidence:

- [`taskboard-concept.png`](taskboard-concept.png) — Task Board overview.
- [`taskboard-editor-concept.png`](taskboard-editor-concept.png) — create/edit Task dialog.

### 12.3 Scene surface

The old single Scene picker, posture controls, completion-next banner, and fixed Stage Track do not
fit 2.0.

The Task header SHOULD show compact active Scene labels. Details MAY expand to show reasons,
selected Agent Skills, readiness, adapters, and user locks. Domain Pack management belongs in a
separate library surface.

## 13. Distribution

The official eight Domain Packs are declarative and SHOULD be enabled on demand. A Domain Pack
MAY include:

- one Scene Definition;
- authentic Agent Skills;
- capability adapter recommendations;
- provenance, localization, and documentation.

It MUST NOT include:

- a Pipeline or fixed workflow;
- an Agent template;
- automatic plugin installation;
- connected-account data;
- a model or permission override.

The exact Agent Skill catalog for each official pack is deferred. Candidate methods discussed
during planning, such as research, analysis, planning, drafting, review, diagnosis, code review,
regression testing, and meeting summarization, are not accepted pack contents until separately
reviewed.

## 14. Breaking cutover

Scenes 2.0 performs no compatibility resolution and no data migration.

At the released cutover:

- the runtime ignores all 1.0 Scene and Pipeline files;
- 1.0 references do not resolve through aliases;
- 1.0 project, user, and plugin content is not converted;
- historical session text and artifacts remain readable;
- old files and database tables remain physically untouched unless the user explicitly deletes
  them;
- old Scenes cannot be selected, copied, edited, exported, or rerun;
- new storage and identities cannot collide with 1.0 identities.

The implementation MAY build 2.0 behind an internal cutover gate while commits are landing. This
is a development technique, not product compatibility. No released 2.0 path may fall back to 1.0.

## 15. Deferred decisions

The following are explicitly out of scope for the initial specification and MUST NOT be guessed:

- Scene Profiles and resource binding persistence;
- shared-versus-local Profile storage;
- the exact Scene context-mount contract;
- state observers and Scene-specific host surfaces;
- the complete Agent Skill catalog for each Domain Pack;
- public community marketplace policy;
- provider-native subagent lifecycle integration;
- parallel Executor Agents;
- automatic cross-Provider or cross-model routing.

## 16. Acceptance criteria

Scenes 2.0 is product-complete only when:

1. No fixed Pipeline, stage transition, or next-scene runtime remains reachable.
2. The Task is the primary user object and can contain multiple serial Work Items and Sessions.
3. A revisioned Task Graph survives restart and rejects stale patches.
4. AI can attach multiple Scenes and select only authentic Agent Skills.
5. AI can create a temporary Task-scoped Agent Skill without installing it.
6. Simple Tasks do not pay for a Manager Agent; complex Tasks can add one.
7. At most one Executor Agent is active for a Task.
8. Provider Configuration changes only through user action.
9. Compatible Sessions are reused and compiled stable prefixes are deterministic.
10. Unknown cache data is shown as unknown.
11. Missing capabilities lead to a truthful ready, degraded, blocked, or unknown state.
12. Plugin installation is an explicit user action followed by readiness reconciliation.
13. Concrete external effects pass through Core risk gates.
14. Budgets and loop ceilings pause rather than silently reroute a Task.
15. Artifacts retain Work Item, Agent, Scene, Agent Skill, and Provider provenance.
16. The UI exposes active Scenes, current Work Item, tentative graph changes, Artifacts, and
    blockers without presenting a fixed flow.
17. 1.0 Scenes and Pipelines are rejected or ignored without conversion.
18. Historical user data remains untouched on disk.
