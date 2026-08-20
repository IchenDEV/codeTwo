# Scenes 2.0 implementation plan

Status: **Ready for implementation using the specification's minimal Scene schema**

Related records: [canonical language](../../CONTEXT.md),
[product specification](./scenes-v2.md), and
[breaking-change ADR](../adr/0001-scenes-v2-dynamic-task-orchestration.md).

This plan turns the accepted Scenes 2.0 product contract into small, independently verifiable
commits. It does not authorize implementation by itself.

## Problem statement

Agent Scenes 1.0 models work as one active stage with execution posture, briefs, artifacts, exit
criteria, hooks, and fixed Pipelines. That shape works for a development lifecycle but does not
extend cleanly to development, testing, operations, UX, data, content, and office work without
turning methods into duplicate Scenes or forcing unrelated work through prescribed flows.

The current product is Session-first. Pipeline state is split across Scene types, Scene Runtime,
SQLite tables, command plugins, the desktop bridge, App-level wiring, banners, and a Stage Track.
Subagent activity is mainly inferred from provider tool-call metadata rather than controlled as a
durable task-level lifecycle. Agent Skills, MCP definitions, Macros, fragments, and subagent
definitions also share implementation vocabulary even though Scenes 2.0 needs “Agent Skill” to
mean an authentic Agent Skill.

Scenes 2.0 must replace this with Task-first, provider-neutral, cache-aware, serial dynamic
orchestration while preserving unrelated CodeTwo behavior and leaving old user data untouched.

## Solution

Build one deep Orchestrator module in the Rust core. Its small external interface owns Task
creation, revisioned graph changes, Work Item attempt results, user controls, and authoritative Run
Snapshots. It hides planner validation, serial scheduling, Session leasing, capability readiness,
budgets, loop detection, Artifact provenance, and crash recovery.

The desktop, TUI, server, and plugins consume the same SQ/EQ events and snapshots. Provider
inference remains behind existing ACP Sessions. The first release uses ordinary CodeTwo Sessions
for execution and does not treat provider-native subagents as controllable Work Item Agents.

Scene Definitions become small domain and discovery declarations. Agent Skills are authentic
Agent Skills. Concrete outputs belong to Work Items; overall completion belongs to the Task Result
Contract. No fixed Pipeline or workflow definition remains in the released runtime.

## Current-state evidence

The implementation must account for these live seams:

- Core frontends already share the Submission Queue and Event Queue interface.
- Activity Tracker already owns one live turn per Session and revisioned pending input.
- SQLite already persists Sessions, transcripts, Artifacts, Scene Artifacts, Pipeline instances,
  transitions, and issue delegation receipts.
- Scene Runtime currently owns hook debounce, exit evaluation, scheduled turns, and Pipeline
  steering.
- Scene commands currently mix scene application, artifacts, scheduling, and Pipeline control.
- Desktop App wiring imports Scene and Pipeline bridge methods directly and renders a single Scene
  chip, banners, Scene Studio, Mission Control, and Stage Track.
- Mission Control derives a read-only cross-Session projection, but it is not authoritative task
  orchestration.
- Agent activity UI recognizes provider-native delegation from bounded tool-call metadata, but
  Core lacks provider-native spawn, status, aggregated usage, result, and interrupt-all receipts.
- Plugin ingestion already discovers real Agent Skills and separately inventories subagents, MCP
  servers, Scenes, and Pipelines.
- The working tree used to write this plan is detached and contains unrelated untracked desktop
  source. Implementation must start from an explicitly owned branch or clean worktree.

## Target module interfaces

### Orchestrator

The external interface should remain close to:

- start Task from a Task request;
- apply a validated orchestration patch at an expected revision;
- record a Work Item attempt result;
- control a Task with pause, resume, cancel, insert, prohibit, or user configuration change;
- read one authoritative Run Snapshot.

Callers should not need to understand planner prompts, graph storage, scheduling queues, Session
leases, capability adapters, or budget counters.

### Planner port

The Orchestrator owns the planner protocol. Production uses a provider-backed planner adapter and
tests use a deterministic in-memory adapter. Planner replies are proposals, never writes.

### Executor port

The Orchestrator owns a serial Executor contract. Production initially uses an ordinary CodeTwo
Session adapter and tests use an in-memory adapter. A provider-native subagent adapter is deferred
until a complete lifecycle exists.

### Capability port

The Orchestrator asks for readiness by abstract capability. The plugin manager supplies the
production adapter and tests use an in-memory catalog. Plugin installation remains outside this
interface and requires user action.

### Store

The store exposes Task-level transactions and compare-and-swap revision changes. It should not
expose raw orchestration table choreography to callers.

## Incremental delivery strategy

During development, the new path may be unreachable or hidden behind an internal component gate
while the old application remains functional. This is not compatibility. The final cutover commit
removes every released fallback to Scenes 1.0, and a final deletion sequence removes unreachable
1.0 code and UI.

Each commit below must compile and pass the tests relevant to its changed interface. Avoid broad
integration edits until the owning module and its tests already exist.

## Commits

### Phase A — characterize and establish language

#### Commit 1: Lock current 1.0 behavior with cutover characterization tests

- Add tests that prove the existing loader accepts 1.0 Scenes and Pipelines only through the old
  path.
- Record current command names, bridge payloads, plugin counts, active Scene persistence, Pipeline
  bindings, and Stage Track behavior.
- These tests are temporary deletion guides: each one must be removed in the same commit that
  removes the behavior it characterizes.
- Do not change production behavior.

#### Commit 2: Add Scenes 2.0 domain types without runtime wiring

- Introduce Task, Result Contract, Work Item, Scene reference, Agent Skill reference, Agent
  assignment, Artifact provenance, Task Budget, Provider Configuration, and Run Snapshot types.
- Keep serialization strict and reject unknown state-changing variants.
- Add round-trip, invalid identity, bounded text, and unknown-field tests.
- Do not add a planner or database yet.

#### Commit 3: Add the minimal Scene 2.0 schema and conformance fixtures

- Define only confirmed identity, domain, provenance, localization, Agent Skill selectors,
  capability namespaces, and extension fields.
- Add exactly the eight official domain Scene fixtures.
- Prohibit 1.0 posture, brief, artifacts, exit, hooks, next-stage, and Pipeline fields.
- Add schema and Rust conformance tests, including explicit rejection of representative 1.0 files.
- Keep the catalog disconnected from the product surface.

#### Commit 4: Add an isolated Scene 2.0 catalog

- Resolve official, personal, project, and plugin Scene definitions with pinned provenance.
- Do not read 1.0 directories or extensions through this catalog.
- Add precedence, malformed-sibling isolation, provenance, localization, and no-alias tests.
- Keep current 1.0 Scene commands unchanged.

#### Commit 5: Add the Scenes 2.0 Agent Skill resolver

- Make “Agent Skill” resolve only authentic Agent Skill contributions.
- Reject or separately classify fragments, Macros, MCP definitions, and subagent definitions.
- Support installed, project-provided, and Task-scoped temporary Agent Skill sources.
- Add deterministic digest ordering so the same catalog produces the same planner prefix.
- Add tests for type filtering, missing references, duplicate provenance, and stable digests.

### Phase B — Task persistence and authoritative state

#### Commit 6: Install new Task storage without touching old Scene data

- Add new tables for Tasks and Result Contracts using fresh 2.0 identities.
- Do not transform, delete, or read old Scene or Pipeline rows.
- Add in-memory and file-backed round-trip tests.
- Ensure opening an existing database leaves old tables and rows byte-for-byte logically
  untouched.

#### Commit 7: Add Work Item, graph edge, and attempt storage

- Persist Work Items, provisional dependencies, status, reasons, and attempt history.
- Support multiple attempts without overwriting earlier results.
- Add foreign-key, invalid-state, and serial-attempt tests.
- Do not schedule any work.

#### Commit 8: Add orchestration event history and compare-and-swap revisions

- Persist accepted graph patches and user controls with monotonically increasing sequence and Task
  revision.
- Reject stale base revisions atomically.
- Materialize Run Snapshot through the same Store interface used in production.
- Test concurrent stale writers, idempotent retries, restart reconstruction, and event ordering.

#### Commit 9: Add Task-to-Session leases and Artifact provenance

- Relate a Task to Manager and Executor Sessions without assuming one Session per Work Item.
- Persist lease compatibility identity and Work Item attempts per Session.
- Add Task and Work Item provenance to new Artifact references while retaining the underlying
  content-addressed Artifact store.
- Test Session reuse, incompatible lease rejection, versioned Artifacts, and historical provenance.

### Phase C — the deep Orchestrator

#### Commit 10: Add pure orchestration patch validation

- Define bounded add, update, retry, cancel, prohibit, and completion proposal operations.
- Validate expected revision, installed identities, graph consistency, Result Contract
  non-regression, serial execution, and text/count bounds.
- Return an accepted patch or explicit errors without side effects.
- Test every invalid edge and operation through this interface.

#### Commit 11: Add the Orchestrator with in-memory planner and executor adapters

- Implement start, apply patch, record result, control, and snapshot interfaces.
- Hide scheduling and adapter details inside the module.
- Execute only one Work Item at a time.
- Add end-to-end core tests using fake adapters for a one-item completion and a multi-item serial
  completion.

#### Commit 12: Add lazy Manager Agent escalation

- Keep simple Tasks on one Executor.
- Allow a Task to create one persistent Manager only after a validated complexity decision.
- Ensure the Manager cannot be assigned domain execution.
- Record the user-visible reason for escalation.
- Test simple-task cost avoidance, escalation, Manager persistence, and role separation.

#### Commit 13: Add loop, failure, and no-progress ceilings

- Count consecutive failures, repeated Work Items, repeated Agent Skill choices, and replans with
  no new evidence.
- Pause rather than reroute when a ceiling is reached.
- Surface remaining work and the exact ceiling reached in Run Snapshot.
- Test bounded retry, repeated stale planner proposals, and resume after user control.

#### Commit 14: Add Result Contract refinement and completion evaluation

- Allow additive and clarifying refinements with recorded reasons.
- Reject silent requirement removal or weakening.
- Produce completed, partially completed, or blocked outcomes with evidence and unknowns.
- Test each final status and material goal-change receipt.

#### Commit 15: Add Task Budget enforcement

- Persist user budgets and observed token, cost, time, and attempt data.
- Treat unsupported cost and cache metrics as unknown.
- Pause at hard budget and never switch Provider Configuration.
- Test observed and unobservable provider cases, near-budget behavior, and user extension.

### Phase D — provider execution and cache stability

#### Commit 16: Add deterministic Task Capsule compilation

- Compile invariant rules, project snapshot, stable capability manifest, Task Capsule, Scenes,
  Agent Skills, and volatile Work Item content in the agreed order.
- Content-address every stable layer and sort all unordered inputs.
- Add byte-for-byte determinism tests and mutation tests that prove only the expected suffix
  changes.

#### Commit 17: Add the Session lease compatibility key

- Key reuse by Task, Provider Configuration, Scene set, Agent Skill set, capability manifest,
  workspace scope, and stable prompt identity.
- Reuse retries and compatible serial Work Items.
- Force a boundary on Provider/model/effort, plugin/MCP composition, workspace, or stable prefix
  change.
- Test false reuse and false invalidation cases.

#### Commit 18: Implement the ordinary CodeTwo Session executor adapter

- Create, prompt, cancel, and resume Sessions through existing engine operations.
- Map authoritative Session activity and terminal events to Work Item attempts.
- Keep provider-native subagent calls opaque inside the parent attempt.
- Test with the existing fake ACP harness, including cancellation uncertainty and restart.

#### Commit 19: Implement the provider-backed planner adapter

- Give the planner only a bounded Scene and Agent Skill digest plus Task state.
- Require a structured patch response and reject malformed, fenced, stale, or hallucinated
  references through the validator.
- Keep one long-lived Manager Session when present and submit deltas rather than rebuilt history.
- Test malformed output, unknown identities, replay, and bounded context.

#### Commit 20: Add cache and usage observability receipts

- Record trustworthy provider-reported cache data when available.
- Expose unknown when unavailable.
- Separately expose CodeTwo stable-prefix reuse as a structural metric with an unambiguous label.
- Test that structural reuse is never serialized or rendered as a provider cache hit.

### Phase E — capability and effect control

#### Commit 21: Add capability readiness resolution

- Resolve Work Item and Agent Skill needs against installed adapters.
- Return ready, degraded, blocked, or unknown with reasons and possible fallbacks.
- Reconcile readiness when an adapter changes.
- Test alternative adapters, removal during a Task, unknown readiness, and degraded execution.

#### Commit 22: Add plugin installation proposals

- Produce a non-mutating proposal with publisher, version, scope, capabilities, effects, account
  requirements, and blocked Work Item.
- Keep the actual install command in the existing plugin manager and user-driven.
- Resume readiness after a successful install; retain blocked state after rejection or failure.
- Test that planner output cannot invoke installation.

#### Commit 23: Add Core-owned effect classification and Task risk receipts

- Normalize read, local modify, external modify, send, publish/deploy, delete, payment, and access
  administration effects.
- Treat unknown effects as gated.
- Reuse authoritative pending-input mechanics while presenting action, target, scope, and effect
  instead of an abstract permission mode.
- Test draft-versus-send, build-versus-deploy, read-versus-invite, rejection fallback, and unknown
  plugin effects.

#### Commit 24: Add Task-scoped temporary Agent Skills

- Generate into Task-owned storage, validate as authentic Agent Skills, and mark provenance.
- Prevent automatic personal/project installation and capability expansion.
- Delete or tombstone temporary content when the Task lifecycle requires it, while retaining an
  inspectable execution receipt.
- Add explicit user save as a separate command.
- Test expiration, save, invalid generated structure, and denied capability requests.

### Phase F — shared protocol and product surfaces

#### Commit 25: Add Task operations and events to SQ/EQ

- Expose Task start, control, patch proposal handling, and snapshot refresh through shared Core
  operations and events.
- Include request correlation and revision receipts.
- Update exhaustive Desktop, TUI, and server event consumers with safe unsupported rendering.
- Add serialization, old-client fallback, and event-order tests.

#### Commit 26: Add a thin desktop Task state adapter

- Keep orchestration logic out of the root application component.
- Reconcile list snapshots and live revisions without rollback.
- Aggregate task-level pending input from authoritative Session activity.
- Add pure state and race tests before rendering UI.

#### Commit 27: Add Task-first navigation behind the internal cutover gate

- Render Project to Task navigation while retaining Session inspection inside a Task.
- Do not hide the old surface yet outside the internal gate.
- Add empty, simple, complex, blocked, paused, partially completed, and cancelled states.
- Add accessibility and narrow-width rendered tests.

#### Commit 28: Add the live Work Item surface

- Show current and tentative Work Items, reasons, active Agent, Artifacts, blockers, and budgets.
- Support pause, cancel, prohibit, insert, and inspect Session actions.
- Do not render a fixed horizontal flow or imply tentative items are committed.
- Test all user controls and revision-stale recovery.

#### Commit 29: Add compact multi-Scene context

- Replace the 2.0 task header's single-selection metaphor with compact active Scene labels.
- Show attachment reason, Agent Skills, readiness, adapter suggestions, and user locks on demand.
- Allow AI attachment without confirmation and explicit user add, remove, prohibit, and lock.
- Test multiple Scenes, auto change, locked Scene behavior, and missing definitions.

#### Commit 30: Add the Domain Pack library

- Show the eight official packs and installed personal, project, and plugin Scene sources.
- Support enable, disable, inspect, duplicate, and plugin recommendation actions.
- Do not create Scene Profiles or implement deferred context mounts.
- Test provenance, read-only official definitions, and disabled-pack Task behavior.

### Phase G — breaking cutover and deletion

#### Commit 31: Cut Task-first Scenes 2.0 over as the only released surface

- Flip the internal gate after all acceptance behavior is available.
- New Tasks use only the 2.0 catalog and Orchestrator.
- Remove every released fallback from 2.0 to the 1.0 loader.
- Add acceptance tests proving 1.0 definitions cannot influence a new Task.

#### Commit 32: Remove fixed Pipeline desktop behavior

- Remove Pipeline bridge calls, palette entries, state, confirmations, Stage Track, and
  Pipeline-specific banners.
- Delete the corresponding characterization and rendered tests in the same commit.
- Keep the desktop build and non-Scene session behavior green.

#### Commit 33: Remove the 1.0 Scene desktop editor and application behavior

- Remove single Scene selection, posture application, briefs, completion-next banners, and
  1.0 Scene Studio forms.
- Replace any remaining session-level Scene display with Task-level 2.0 context.
- Delete only tests that assert removed behavior; retain generic UI primitive coverage.

#### Commit 34: Remove Pipeline and 1.0 Scene commands and runtime steering

- Delete Pipeline commands, transitions, scheduling paths tied to 1.0, next suggestions, and
  fixed-stage steering.
- Remove unreachable 1.0 Scene application and export commands.
- Retain only generic Artifact, Session activity, and risk mechanisms used by 2.0.
- Add command-registry tests proving removed commands are unavailable.

#### Commit 35: Remove 1.0 schemas, loaders, fixtures, and plugin component handling

- Stop loading 1.0 Scene and Pipeline files from project, user, or plugin directories.
- Remove Pipeline component counts and validation from new plugin ingestion.
- Replace office-starter and R&D fixtures with the eight 2.0 Domain Packs.
- Keep old installed files untouched on disk.
- Add install tests proving 1.0 content is preserved as inert bundle data or reported unsupported,
  never activated.

#### Commit 36: Stop creating old Pipeline tables for new databases

- Remove old Pipeline table creation and new-session binding columns from fresh 2.0 schema setup.
- Do not drop or transform those tables in an existing database.
- Remove unused store methods and types.
- Add a fixture database with old rows and prove opening 2.0 leaves them intact while no runtime
  query uses them.

#### Commit 37: Remove remaining 1.0 code, strings, screenshots, and documentation

- Delete unreachable types, tests, localization keys, screenshots, and roadmap claims.
- Retain a short historical note that 1.0 data is unsupported and not migrated.
- Make docs, glossary, ADR, and product text use Task, Work Item, Scene, and Agent Skill
  consistently.
- Run a repository search for forbidden fixed-flow terms in active 2.0 surfaces.

#### Commit 38: Complete physical acceptance and remove the internal cutover gate

- Run a real simple Task and a complex serial multi-Agent Task.
- Verify active multi-Scene display, temporary Agent Skill, plugin-blocked Work Item, risk refusal,
  budget pause, restart recovery, Session reuse, and 1.0 rejection.
- Inspect desktop full and narrow layouts and confirm no fixed flow is implied.
- Remove the development-only gate only after this evidence passes.

## Decision document

- Scenes 2.0 is a breaking replacement, not an extension of Agent Scenes 1.0.
- Runtime compatibility aliases, dual loading, and data migration are forbidden.
- Old user files and tables remain untouched and inactive.
- The Task is the primary user object; Sessions are internal execution records.
- The Task Graph is dynamic and revisioned. It is not a workflow definition.
- A Scene is a domain work environment. Eight official Domain Packs each contain one Scene.
- Concrete methods are authentic Agent Skills, never atomic Scenes.
- AI may generate temporary Task-scoped Agent Skills but not temporary Scenes.
- Agent is a runtime actor; there is no Agent template library.
- Simple Tasks avoid a Manager Agent. Complex Tasks may use one Manager and serial Executors.
- A Task has at most one active Executor Agent.
- Provider, model, and reasoning effort are user-controlled.
- Ordinary CodeTwo Sessions are the first production Executor adapter.
- Provider-native subagent activity remains opaque until complete lifecycle support exists.
- Session reuse and deterministic prompt prefixes are first-class requirements.
- Cache hits are shown only from provider evidence; structural reuse is labeled separately.
- Capability needs resolve to user-installed adapters after Agent Skill selection.
- AI cannot install plugins, connect accounts, or change Provider Configuration.
- Core classifies concrete effects and owns risk gates.
- Result Contracts determine completion; budgets and loop ceilings pause unsafe or unbounded work.
- Scene Profiles, context mounts, state observers, exact Domain Pack Agent Skills, public
  marketplace, native subagent control, and parallel execution are out of scope.

## Testing decisions

### Test philosophy

- Test observable behavior through module interfaces.
- Use the same Orchestrator interface for production callers and tests.
- Prefer in-memory Store, planner, Executor, and capability adapters over testing internal helper
  functions.
- Assert durable state, emitted events, accepted or rejected commands, Artifacts, and user-visible
  receipts.
- Avoid snapshotting planner prose or internal scheduling data that callers cannot observe.
- Replace 1.0 tests when their behavior is deleted; do not layer 2.0 expectations on obsolete
  tests.

### Core coverage

- strict 2.0 Scene conformance and explicit 1.0 rejection;
- authentic Agent Skill filtering and temporary Agent Skill lifecycle;
- Task and Work Item persistence;
- compare-and-swap revisions and crash reconstruction;
- serial scheduling and lazy Manager escalation;
- Result Contract non-regression and completion outcomes;
- budget, failure, retry, and no-progress ceilings;
- Session lease compatibility and deterministic prompt compilation;
- provider cancellation uncertainty;
- capability readiness and plugin reconciliation;
- Core-owned effect gates;
- Artifact provenance and versioning.

### Protocol coverage

- Task operation and event round trips;
- request correlation and monotonic revisions;
- exhaustive frontend consumers;
- unsupported client and provider capability behavior;
- no provider-native lifecycle claims from tool-call metadata.

### Desktop coverage

- Task-first rail and Task detail states;
- compact multi-Scene context;
- dynamic Work Items without a fixed-flow visual;
- user Scene locks and prohibitions;
- Session inspection;
- missing-plugin proposal and post-install readiness;
- concrete risk requests;
- budget pause and resume;
- full and narrow layout, keyboard access, focus return, and accessible status updates.

### Prior art to reuse

- Activity Tracker revision and pending-input tests for authoritative concurrency behavior;
- Scene conformance tests for strict schema and invalid-sibling isolation;
- Scene Runtime hook tests as deletion guides for event-driven behavior;
- Mission Control derivation and rendered tests for cross-Session status;
- plugin manager lifecycle and project-scope tests for adapter readiness;
- fake ACP engine tests for Session creation, prompt, cancellation, and replay;
- design-system checks and rendered desktop tests for UI acceptance.

## Validation gates

Run at meaningful integration points and at final cutover:

1. Rust formatting check for task-owned changed files.
2. Cargo check for the full workspace and all targets.
3. Cargo test for the full workspace.
4. Desktop unit and rendered tests from the desktop application directory.
5. Desktop design-system check.
6. Desktop production build from the desktop application directory.
7. Git whitespace and conflict-marker checks.
8. Repository search proving active 2.0 code has no Pipeline, fixed-stage, next-scene, 1.0
   fallback, automatic provider switch, or parallel Executor path.
9. Physical desktop QA for both wide and narrow viewports.

A queued CI job is not a passed gate. Provider cache behavior, native subagent lifecycle, and
plugin readiness must be reported only from observed receipts.

## Out of scope

- Scene Profiles and saved resource bindings;
- Scene context-mount and state-observer implementation;
- Scene-specific host UI beyond the shared task context surface;
- the final Agent Skill catalog and content for each Domain Pack;
- public community Scene or Agent Skill marketplace;
- fixed or reusable workflow templates;
- any 1.0 Scene or Pipeline migration;
- runtime compatibility aliases or dual loading;
- parallel Executor Agents;
- provider-native subagent lifecycle control;
- automatic Provider, model, or reasoning-effort switching;
- automatic plugin installation or account connection;
- production actions without concrete risk gates;
- publishing a GitHub issue or starting implementation as part of this planning artifact.

## Handoff

Before implementation starts:

1. Create or select a task-owned branch or clean worktree; do not use the detached planning
   checkout with unrelated untracked desktop content.
2. Use the minimal Scene schema in the specification. Do not invent deferred context-mount,
   state-observer, host-surface, or Profile fields.
3. Assign ownership by module so Core orchestration, plugin/capability work, and desktop surfaces
   do not collide in high-conflict integration files.
4. Start with Commit 1 and keep every commit buildable.
