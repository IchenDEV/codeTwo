# Rust-core implementation spec — Agent Scenes roadmap (R1, R3, R4, R7, R8, R9, R12 core halves)

Companion to `docs/reference/scenes.md` (normative spec) and `docs/design/scenes-impl-frontend.md`.
This document is the authoritative implementation design for the core side; implementing agents
follow it and note any deviation in their handoff. All paths under repo root. "core" =
`crates/core/src/`, "desktop host" = `apps/desktop/src-host/src/lib.rs`.

---

## 1. `scene.rs` (R3) — scene/pipeline data model, library, apply, escalation

New file `crates/core/src/scene.rs`. Register in `crates/core/src/lib.rs` mod list alphabetically
and add a `pub use scene::{...}` block.

### 1.1 Types (serde, mirroring the frozen schemas exactly)

All structs `#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]` and
`#[serde(deny_unknown_fields)]` (schema is `additionalProperties: false`; a file with unknown
fields is malformed → warn+skip).

```rust
pub const SCENE_SCHEMA_ID: &str    = "https://agent-scenes.org/schemas/1.0.0/scene.schema.json";
pub const PIPELINE_SCHEMA_ID: &str = "https://agent-scenes.org/schemas/1.0.0/pipeline.schema.json";

pub struct Scene {
    #[serde(rename = "$schema")] pub schema: String,
    pub name: String,
    #[serde(default)] pub version: Option<String>,
    pub title: String,
    #[serde(default)] pub description: String,
    #[serde(default)] pub icon: Option<String>,
    #[serde(default)] pub author: Option<SceneAuthor>,        // { name, email, url } all Option<String>
    #[serde(default)] pub homepage: Option<String>,
    #[serde(default)] pub repository: Option<String>,
    #[serde(default)] pub license: Option<String>,
    #[serde(default)] pub keywords: Vec<String>,
    #[serde(default)] pub localizations: HashMap<String, SceneLocalization>, // { title, description } Options
    #[serde(default)] pub execution: Option<SceneExecution>,
    #[serde(default)] pub skills: Option<SceneSkills>,
    #[serde(default)] pub brief: Option<SceneBrief>,
    #[serde(default)] pub artifacts: Vec<SceneArtifactSpec>,
    #[serde(default)] pub exit: Option<SceneExit>,
    #[serde(default)] pub hooks: Vec<SceneHook>,
    #[serde(default)] pub constraints: Option<SceneConstraints>,
    #[serde(default)] pub extensions: HashMap<String, serde_json::Map<String, serde_json::Value>>,
}

pub struct SceneExecution {
    #[serde(default)] pub providers: Vec<String>,
    #[serde(default)] pub model: Option<String>,
    #[serde(default)] pub reasoning_effort: Option<String>,
    #[serde(default)] pub session_mode: Option<SceneSessionMode>,
    #[serde(default)] pub memory_preset: Option<SceneMemoryPreset>,
    #[serde(default)] pub worktree: Option<SceneWorktree>,
    #[serde(default)] pub plan_first: Option<bool>,
}
// snake_case enums, Copy + Eq + Ord where noted:
pub enum SceneSessionMode { ReadOnly, Ask, AutoEdit, FullAccess }   // derive Ord: declaration order IS the loosening order
pub enum SceneMemoryPreset { Standard, ReadOnly, Private, LearnOnly }
pub enum SceneWorktree { Off, Current, OriginDefault }

pub struct SceneSkills {
    #[serde(default)] pub pinned: Vec<String>,
    #[serde(default)] pub inline: Vec<SceneInlineFragment>,   // { name: String, text: String, icon: Option<String> }
    #[serde(default)] pub suppress_unpinned: bool,
}

pub struct SceneBrief {
    pub template: String,
    #[serde(default)] pub slots: Vec<SlotDef>,                // SHARED type, see §2 — defined in skill.rs
    #[serde(default)] pub clarify: Option<BriefClarify>,      // MultiChoice | FreeForm | Off
}

pub struct SceneArtifactSpec {
    pub id: String,
    pub title: String,
    pub kind: SceneArtifactKind,   // Document, Plan, Report, TestReport, Checklist, Diff, Link, Custom
    #[serde(default)] pub required: bool,
    #[serde(default)] pub template: Option<String>,
    #[serde(default)] pub description: Option<String>,
}

pub struct SceneExit {
    #[serde(default)] pub criteria: Vec<ExitCriterion>,
    #[serde(default)] pub next: Vec<NextSuggestion>,          // { scene, label: Option, carry: Vec<String> }
}
pub struct ExitCriterion {
    pub kind: ExitCriterionKind,   // RequiredArtifacts, ChecklistComplete, TestsPass, UserConfirm, Custom
    #[serde(default)] pub artifact: Option<String>,
    #[serde(default)] pub description: Option<String>,
}
impl Scene {
    /// Spec default when `exit.criteria` is absent/empty: [required_artifacts, user_confirm].
    pub fn effective_criteria(&self) -> Vec<ExitCriterion>;
}

pub struct SceneHook {
    pub on: HookEvent,             // Enter, TurnEnd, ArtifactProduced, ExitCriteriaMet, TestsFailed, Schedule
    #[serde(default)] pub artifact: Option<String>,
    #[serde(default)] pub schedule: Option<String>,
    pub action: HookAction,
}
pub struct HookAction {
    pub kind: HookActionKind,      // SuggestScene, SuggestNext, RunMacro, Notify
    #[serde(default)] pub scene: Option<String>,
    #[serde(default, rename = "macro")] pub macro_ref: Option<String>,
    #[serde(default)] pub args: HashMap<String, String>,
    #[serde(default)] pub message: Option<String>,
}

pub struct SceneConstraints {
    #[serde(default)] pub guardrails: Vec<String>,
    #[serde(default)] pub tools: Option<ToolHints>,            // { allow: Vec<String>, deny: Vec<String> }
}
```

Pipeline (same header fields name/version/title/…/localizations/extensions):

```rust
pub struct Pipeline {
    #[serde(rename = "$schema")] pub schema: String,
    pub name: String, pub title: String,
    /* header fields as Scene */
    #[serde(default)] pub entry: Option<String>,
    pub stages: Vec<PipelineStage>,
    #[serde(default)] pub transitions: Vec<PipelineTransition>,
    #[serde(default)] pub extensions: HashMap<String, serde_json::Map<String, serde_json::Value>>,
}
pub struct PipelineStage {
    pub id: String,
    pub scene: String,
    #[serde(default)] pub title: Option<String>,
    #[serde(default)] pub gate: Option<Gate>,                  // Suggest (default) | Confirm | Auto
    #[serde(default)] pub carry: Vec<CarrySpec>,               // { from, artifact, #[serde(rename="as")] as_label: Option<String> }
}
pub struct PipelineTransition {
    pub from: String, pub to: String,
    pub when: TransitionTrigger,   // ExitCriteriaMet, TestsFailed, UserRequest
    #[serde(default)] pub gate: Option<Gate>,
}
```

### 1.2 Post-parse validation

`pub fn validate_scene(scene: &Scene) -> Result<(), String>` and `validate_pipeline`. Serde can't
express the schema's conditional requirements or the slug pattern (Rust `regex` has no lookahead —
hand-roll):

- `$schema` equals the const (exactly; wrong version → invalid, file skipped).
- `is_slug(name)`: 1–64 chars, `[a-z0-9.-]`, first/last alphanumeric, no `--` or `..`.
  `is_artifact_id`: same but `[a-z0-9-]` only.
- `select` slot requires non-empty `options`; `checklist_complete` requires `artifact`; `custom`
  requires `description`; `suggest_scene` requires `scene`; `run_macro` requires `macro`;
  `notify` requires `message`; `on: schedule` requires `schedule` (and `schedule` only meaningful
  there).
- Pipeline: `entry`/transition `from`/`to`/carry `from` must name declared stage ids; stage ids
  unique.
- Filename stem mismatch with `name` → `tracing::warn!` only, keep the file (name is the key).

### 1.3 `SceneLibrary` — four-source precedence

```rust
#[derive(Clone, Debug)]
pub enum SceneSource { Project, User, Plugin { plugin_id: String }, Builtin }   // source_label() -> "project"|"user"|"plugin"|"builtin"

pub struct ResolvedScene   { pub scene: Scene,     pub source: SceneSource, pub path: Option<PathBuf> }
pub struct ResolvedPipeline{ pub pipeline: Pipeline, pub source: SceneSource, pub path: Option<PathBuf> }

#[derive(Default)]
pub struct SceneLibrary { scenes: Vec<ResolvedScene>, pipelines: Vec<ResolvedPipeline> }  // stored in precedence order

impl SceneLibrary {
    /// project_dir = <project>/.codetwo/scenes, user_dir = ~/.config/codetwo/scenes,
    /// plugins = (plugin_id, <plugin_root>/scenes) for each *enabled* plugin. Builtins appended last.
    pub fn load(project_dir: Option<&Path>, user_dir: Option<&Path>, plugins: &[(String, PathBuf)]) -> SceneLibrary;
    fn load_dir(dir: &Path, source: SceneSource, out: &mut SceneLibrary);   // *.scene.json / *.pipeline.json; missing dir → nothing; malformed/invalid → tracing::warn + skip
    pub fn builtin() -> SceneLibrary;   // include_str! of the six fixtures
    pub fn resolve(&self, reference: &str) -> Option<&ResolvedScene>;
    pub fn resolve_pipeline(&self, reference: &str) -> Option<&ResolvedPipeline>;
    pub fn scenes(&self) -> &[ResolvedScene];
    pub fn pipelines(&self) -> &[ResolvedPipeline];
    /// Canonical pinned reference: "project:develop", "user:x", "builtin:develop", "<plugin-id>:scene:<name>".
    pub fn reference_for(entry: &ResolvedScene) -> String;
}
```

**Builtins:** `include_str!("../schemas/agent-scenes/1.0.0/examples/research.scene.json")` (and
`develop`, `test`, `fix`, `acceptance`, `rnd-lifecycle.pipeline.json`). Build via
`LazyLock<SceneLibrary>`; parse failures warn+skip even here; a test asserts all six parse and
validate (the conformance test — the examples are normative fixtures).

**Reference resolution** (`resolve`):
- `builtin:<name>` / `user:<name>` / `project:<name>` → search only that source.
- `<plugin-id>:scene:<name>` (contains `:scene:`) → only that plugin's entries.
- bare `<name>` → first match walking the precedence-ordered vec (project > user > plugin > builtin).
- No match → `None`; callers degrade to a warning chip (never an error).

### 1.4 Soft-apply vs full-apply, and the escalation chokepoint

Mode ↔ policy mapping (pure fns in scene.rs):

```rust
pub fn session_mode_policy(mode: SceneSessionMode) -> ExecutionPolicy
// read_only    → (Ask, ReadOnly)
// ask          → (Ask, WorkspaceWrite)
// auto_edit    → (AcceptEdits, WorkspaceWrite)
// full_access  → (Yolo, DangerFullAccess)
pub fn policy_session_mode(policy: &ExecutionPolicy) -> SceneSessionMode   // inverse; unmatched combos map to the loosest mode they imply (conservative)
```

Memory mapping: `pub fn memory_preset_policy(p: SceneMemoryPreset) -> (read, write)` — standard=
(inherit,inherit)→existing enabled pair, read_only=(allow,deny), private=(deny,deny),
learn_only=(deny,allow) (use the actual memory-policy types the desktop `set_session_memory_policy`
path takes).

**The single enforcement chokepoint** (escalation rule is absolute):

```rust
pub struct EscalationRequired { pub from: SceneSessionMode, pub to: SceneSessionMode }

/// The ONLY function in the codebase allowed to turn a scene's session_mode into an
/// ExecutionPolicy change. Loosening (target rank > current rank per SceneSessionMode's Ord)
/// without `user_confirmed` returns Err(EscalationRequired). Tightening or equal always Ok.
pub fn apply_execution(
    current: &ExecutionPolicy,
    target: Option<SceneSessionMode>,
    user_confirmed: bool,
) -> Result<Option<ExecutionPolicy>, EscalationRequired>
```

Every consumer routes through it: the `apply_scene` command, full-apply session planning, pipeline
`auto` gates (on `Err` they downgrade to `suggest`), and the hook dispatcher (always
`user_confirmed = false`, and `run_macro` has no code path to `Op::SetExecutionPolicy` at all).
Unit test: every (current, target, confirmed) cell of the matrix.

Apply planning:

```rust
pub enum ApplyStrength { Soft, Full }
pub enum PendingField { Providers, Model, ReasoningEffort, Worktree }   // soft-apply deferrals per the binding matrix

pub struct SceneApplyPlan {
    pub scene_ref: String,
    pub execution: Option<ExecutionPolicy>,          // ready for Op::SetExecutionPolicy (soft) / NewSession initial_policy (full)
    pub memory: Option<(/* read */, /* write */)>,
    pub plan_first: Option<bool>,                    // frontend composer toggle; no Op
    pub pending: Vec<PendingField>,                  // non-empty only for Soft ("partial" chip indicator)
    pub escalation: Option<EscalationRequired>,      // set => NOTHING was applied; caller re-calls with confirmed=true
    pub new_session: Option<SceneSessionParams>,     // Full only
}
pub struct SceneSessionParams {                      // feeds the existing new_session command + follow-up Ops
    pub provider: Option<String>,                    // first installed entry of execution.providers
    pub model: Option<String>,                       // → Op::SetModel after creation
    pub reasoning_effort: Option<String>,            // → Op::SetConfigOption after creation
    pub use_worktree: bool,
    pub worktree_base: Option<WorktreeBaseline>,     // Current | OriginDefault mapping of SceneWorktree
    pub initial_policy: Option<ExecutionPolicy>,
}

pub fn plan_apply(current: &ExecutionPolicy, scene: &Scene, strength: ApplyStrength, confirm_escalation: bool) -> SceneApplyPlan
```

Field → mechanism matrix (authoritative):

| Scene field | Soft-apply | Full-apply |
|---|---|---|
| `session_mode` | `Op::SetExecutionPolicy` via `apply_execution` | `NewSession.initial_policy` via `apply_execution` (against project default policy) |
| `memory_preset` | existing `set_session_memory_policy` command path | same, after creation |
| `plan_first` | frontend composer state (returned in plan) | same |
| `providers` | **pending** | `NewSession.provider` |
| `model` | **pending** | `Op::SetModel` after `session_created` |
| `reasoning_effort` | **pending** | `Op::SetConfigOption` after creation |
| `worktree` | **immutable — pending** | `NewSession.use_worktree` + `worktree_base` |
| skills/brief/guardrails/inline | immediate (compile-time preamble + picker; engine glue in R8, §4.5) | same |

### 1.5 Prompt preamble (pure function; engine wiring deferred to R8)

```rust
/// Everything a scene injects at compile time, in the normative order
/// (project rules stay first — the engine prepends this AFTER rules, BEFORE user doc):
/// guardrails → inline fragments → artifact-capture instruction (id/title/template list,
/// fenced-block convention) → clarify instruction → carried artifacts.
pub fn prompt_preamble(scene: &Scene, carried: &[CarriedArtifact]) -> String
pub struct CarriedArtifact { pub label: String, pub from_stage: Option<String>, pub version: i64, pub content: String }
```

R3 lands this as a tested pure function; the only engine.rs touch (calling it inside `Op::Prompt`
handling, keyed off the session's persisted `active_scene`) belongs to the R8 PR.

### 1.6 Persistence: active scene per session — columns, not a table

`store.rs` `migrate()` (ensure_column pattern):

```sql
ALTER TABLE sessions ADD COLUMN active_scene TEXT;                       -- resolved ref, e.g. 'builtin:develop'; NULL = no scene
ALTER TABLE sessions ADD COLUMN scene_customized INTEGER NOT NULL DEFAULT 0;
```

Store methods: `set_session_scene(&self, session_id, scene_ref: Option<&str>, customized: bool)`
and `session_scene(&self, session_id) -> Option<(String, bool)>`. Optionally surface on the
`Session` struct as `#[serde(default)]` fields (append-only, wire-safe).

### 1.7 Desktop exposure (`apps/desktop/src-host/src/lib.rs`)

Scene commands register on the core plugin graph. The desktop's generic `call` protocol exposes
them automatically, so this roadmap adds no host state, wrapper commands, or dispatch-table
entries. Project/user/plugin scene resolution remains core product policy.

- `keymap.rs`: new `Action::CycleScene` — the 5 append edits (enum, `ALL` array + count, `as_str`
  → `"cycle_scene"`, `label` → `"Cycle scene"`, `default_key` → `"shift+tab"`).

### 1.8 R3 tests

- `crates/core/tests/scene_conformance.rs` (new file): all six fixtures load via
  `SceneLibrary::builtin()`, count == 5 scenes + 1 pipeline; `develop` brief slots typed;
  `rnd-lifecycle` entry/stage/transition graph as authored.
- Inline tests: precedence shadowing (tempdirs); pinned refs; malformed/invalid file skipped with
  siblings loading; missing dirs → builtins only; slug validator cases; `apply_execution` full
  matrix; `plan_apply` soft-vs-full pending sets; `effective_criteria` default; `prompt_preamble`
  ordering.

---

## 2. Macro slot metadata (R1 core half)

File: `crates/core/src/skill.rs`.

### 2.1 Shared slot type (added by the R3 PR, used by R1 and scene briefs)

```rust
/// One typed fill-in slot — the shared vocabulary between Macro skills and scene `brief.slots`
/// (Agent Scenes 1.0.0 slot object).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SlotDef {
    pub id: String,
    #[serde(default)] pub label: String,                 // empty → UI falls back to id (macro legacy)
    #[serde(default)] pub kind: SlotKind,
    #[serde(default, skip_serializing_if = "Vec::is_empty")] pub options: Vec<String>,
    #[serde(default)] pub required: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")] pub default: Option<String>,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SlotKind { #[default] Text, Multiline, Select, File, Artifact }
```

### 2.2 Serde migration for `SkillPayload::Macro`

```rust
Macro {
    template: String,
    #[serde(default, deserialize_with = "deserialize_slots")]
    slots: Vec<SlotDef>,
},
```

Backward compat with on-disk `slots: ["style","scope"]` via an untagged helper:

```rust
#[derive(Deserialize)]
#[serde(untagged)]
enum SlotDefOrName { Def(SlotDef), Name(String) }
// Name(id) → SlotDef { id, kind: Text, label: "", .. }
```

Serialization always writes the new object shape (`save_to_dir` rewrites on edit). Known cost:
an older build reading a new file warns-and-skips that one skill — non-fatal by existing design.

### 2.3 Compile path

- `substitute()` unchanged — params keyed by slot id.
- Macro arm in `compile_with_context`: build effective params = slot `default`s overlaid by user
  `params` before `substitute`. No param and no default keeps the leave-`{{slot}}`-as-is behavior.
- `builtin_skills()` `commit-macro`: `style` → Select(options conventional/descriptive, required),
  `scope` → Text.

### 2.4 `SkillInfo` (desktop lib.rs)

Append, serde-skipped when None: `macro_template: Option<String>`,
`macro_slots: Option<Vec<SlotDef>>`. Populated in `list_skills` so the `/` picker renders the
inline card without a second fetch.

### 2.5 R1 tests

Legacy `["style","scope"]` deserializes to text slots; new shape round-trips; mixed array works;
select serializes options; defaults applied at compile; missing-param-no-default leaves
placeholder; existing macro tests untouched-green.

---

## 3. Scene artifacts (R3/R4 core half)

**Decision: extend `ArtifactStore` with `save_document` (reuse blob layer, artifacts table,
content addressing) + a new `scene_artifact.rs` module owning the descriptor/versioning layer.**

### 3.1 `artifact.rs`: `save_document`

```rust
pub fn save_document(
    &self,
    text: &str,
    mime_type: &str,                 // allowlist: "text/markdown" | "text/plain"
    display_name: Option<&str>,
    session_id: &str,
    tool_call_id: &str,              // synthetic "scene:<artifact_key>" for scene captures
) -> Result<ArtifactRef, ArtifactError>
```

Mirrors `save_image`: size cap, blake3 digest, `digest.md`/`digest.txt` storage name, tmp+rename,
dedupe on digest, `artifact_refs` row. **Width/height = 0** — the documented "not an image"
sentinel (wire-compatible, no migration). Reject other mime with `UnsupportedFormat`.

### 3.2 New table (append to `SCHEMA` const in store.rs — `IF NOT EXISTS` additive pattern)

```sql
CREATE TABLE IF NOT EXISTS scene_artifacts (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  scene_ref             TEXT NOT NULL,
  artifact_key          TEXT NOT NULL,
  kind                  TEXT NOT NULL,
  title                 TEXT NOT NULL,
  session_id            TEXT NOT NULL,
  pipeline_instance_id  TEXT,
  stage_id              TEXT,
  artifact_id           TEXT NOT NULL,
  version               INTEGER NOT NULL,     -- 1-based per (session_id, artifact_key)
  pinned                INTEGER NOT NULL DEFAULT 0,
  created_at            INTEGER NOT NULL,
  FOREIGN KEY (artifact_id) REFERENCES artifacts(id)
);
CREATE INDEX IF NOT EXISTS scene_artifacts_session  ON scene_artifacts(session_id, artifact_key, version);
CREATE INDEX IF NOT EXISTS scene_artifacts_pipeline ON scene_artifacts(pipeline_instance_id, stage_id, artifact_key);
```

### 3.3 New module `crates/core/src/scene_artifact.rs`

```rust
pub struct SceneArtifactStore { store: Arc<Store>, blobs: ArtifactStore }

pub struct SceneArtifactRecord {
    pub id: i64, pub scene_ref: String, pub artifact_key: String, pub kind: String, pub title: String,
    pub session_id: String, pub pipeline_instance_id: Option<String>, pub stage_id: Option<String>,
    pub artifact: ArtifactRef, pub version: i64, pub pinned: bool, pub created_at: i64,
}

impl SceneArtifactStore {
    pub fn record(&self, scene_ref, spec: &SceneArtifactSpec, session_id,
                  pipeline: Option<(&str /*instance*/, &str /*stage*/)>, content: &str)
                  -> Result<SceneArtifactRecord, ArtifactError>;         // next version = MAX+1 per (session, key)
    pub fn pin(&self, session_id, artifact_key, version: Option<i64>) -> Result<(), ArtifactError>;  // None = unpin all; ≤1 pinned per scope
    pub fn latest(&self, session_id, artifact_key) -> Result<Option<SceneArtifactRecord>, _>;   // pinned row if any, else MAX(version)
    pub fn latest_for_stage(&self, instance_id, stage_id, artifact_key) -> ...;
    pub fn list_for_session(&self, session_id) -> ...;
    pub fn list_for_instance(&self, instance_id) -> ...;
    pub fn content(&self, record_id: i64) -> Result<String, ArtifactError>;   // blob get + UTF-8

    /// Pipeline carry resolution: for each CarrySpec, pinned-or-newest version from the named
    /// stage across the instance; a `from` stage with no record is skipped SILENTLY (loops).
    pub fn resolve_carry(&self, instance_id, stage: &PipelineStage) -> Vec<CarriedArtifact>;   // content capped 32 KiB each, truncation noted in label
}

/// Best-effort capture: fenced blocks whose info string contains `artifact:<id>` for a declared id
/// (convention emitted in prompt_preamble's capture instruction). Pure, unit-tested; called from
/// R8's TurnEnded glue over the turn's agent text.
pub fn extract_artifact_blocks(text: &str, declared: &[SceneArtifactSpec]) -> Vec<(String, String)>;
```

**Versioning:** newest wins; re-emitting bumps version; `pin` freezes; unpin restores newest-wins.
Manual "pin as artifact" is the guaranteed path → `record_scene_artifact` command.

### 3.4 `DocBlock::Artifact` (R4)

Append to `DocBlock` after `Session`:

```rust
/// A stored scene-artifact version; its content is inlined as labeled context at compile time.
Artifact { record_id: i64 },
```
- `canonical_doc_text`: `format!("[artifact:{record_id}]")`.
- Compile: new resolver-taking entry point (session-mention pattern): `compile_full(doc, library,
  cwd, resolve_session, resolve_artifact: Option<&dyn Fn(i64)->Option<(String /*label*/, String /*content*/)>>)`;
  existing entry points delegate with `None`. Unresolved → push `artifact:<id>` to `unresolved`.
  `CompiledPrompt` gains `#[serde(default)] pub artifacts: Vec<i64>`.

### 3.5 Desktop commands

`list_scene_artifacts(session)`, `scene_artifact_content(record_id)`,
`record_scene_artifact(session, artifact_key, content)` (manual pin / R4 plan save; scene_ref +
spec from the session's active scene, degrade to kind `custom` when undeclared),
`pin_scene_artifact(session, artifact_key, version: Option<i64>)`.
`AppState` gains `scene_artifacts: SceneArtifactStore`.

### 3.6 Tests

Version bump on re-record; pinned beats newest; unpin restores; carry silent-skip for never-run
stage; carry `as` label override; `extract_artifact_blocks` (marked fence, unmarked ignored,
undeclared id ignored, two blocks); save_document dedupe + 0×0 ref + mime rejection.

---

## 4. Hooks/event layer (R8) — sole owner of engine.rs + event.rs

### 4.1 New `Event` variants (appended before `Error`)

```rust
TestSignal { session, tool_call_id: String, command: String /* ≤256 */, passed: bool,
             exit_code: Option<i32> },
ArtifactProduced { session, scene_ref: String, artifact_key: String, kind: String,
                   version: i64, record_id: i64 },
ExitCriteriaMet { session, scene_ref: String, satisfied: Vec<String>,
                  unverified: Vec<String>, state_key: String },
HookSuggestion { session, scene_ref: String, on: String, kind: String,
                 target_scene: Option<String>, carry: Vec<String>, message: Option<String>,
                 pipeline_instance: Option<String>, to_stage: Option<String>, state_key: String },
HookTurnStarted { session, scene_ref: String, macro_id: String },
SessionCost { session, input_tokens: u64, output_tokens: u64, cost_usd: Option<f64>,
              burn_rate_usd_per_hour: Option<f64>, priced: bool },
```

Optional fields `skip_serializing_if`. Also append `cost_usd: Option<f64>` to the existing
`ContextWindow` variant (optional-field append, wire-compat), fed from ACP usage when numeric.
Wire-shape tests per variant in the event.rs tests mod (tag names `"test_signal"` etc.), plus
`context_window` without `cost_usd` still deserializes.

### 4.2 `tests_failed` heuristic — new pure module `crates/core/src/testsignal.rs`

```rust
pub fn classify_test_command(kind: Option<&str>, title: &str, raw_input: Option<&Value>) -> Option<String>;
pub fn test_outcome(status: &str, outputs: &[ToolOutput]) -> Option<TestOutcome { passed, exit_code }>;
```

**Classification (conservative):**
1. Gate on ACP kind: only `Some("execute")` or `None` (never read/fetch/edit/think).
2. Candidate: `raw_input.command` (string or array joined) else title stripped of `Run ` and
   backticks.
3. Split on `&&`, `||`, `;`; strip `env`/`VAR=` prefixes and `cd <dir>` segments; classify iff any
   segment's leading tokens exactly match (token-boundary): `cargo test`, `cargo nextest run`,
   `pytest`, `python -m pytest`, `python -m unittest`, `tox`, `npm test`, `npm run test*`,
   `pnpm test`, `yarn test`, `bun test`, `jest`/`npx jest`, `vitest`/`npx vitest run`,
   `mocha`/`npx mocha`, `npx playwright test`, `npx cypress run`, `go test`, `mvn test`,
   `mvn verify`, `gradle test`, `./gradlew test`, `rspec`, `bundle exec rspec`, `rake test`,
   `phpunit`, `dotnet test`, `swift test`, `ctest`, `make test`, `make check`.
4. Exclusions even on match: `--help`, `--version`, `--list`, `--collect-only`, `--dry-run`.

**Outcome (terminal status only, once per tool_call_id):**
- `status == "failed"` → passed:false, exit_code None.
- `status == "completed"`: scan Text outputs (last occurrence wins) for `exit code: n`,
  `exit status: n`, `exited with code n`, `(exit n)` → passed = (n==0).
- No exit code: accept only unambiguous runner summaries — cargo `test result: FAILED`/`ok`;
  pytest `== ... failed/passed ==` summary; jest/vitest `Tests: ... N failed`/all-passed.
  Explicit exit code beats summaries.
- Otherwise None. Never infer failure from stderr presence/warnings/non-terminal statuses.

**Engine wiring:** `ToolContext` gains `test_command: Option<String>` + `test_signaled: bool`.
Set at initial ToolCall (raw_input available), carried through updates. At terminal status with
`test_command` Some and `!test_signaled`: `test_outcome` → emit `Event::TestSignal`, set flag.
No persistence in R8 (`tests_pass` resets on restart until next run — documented).

### 4.3 Hook dispatch — core module `scene_runtime.rs`, fed off the broadcast bus

Engine emits raw facts; policy (debounce, allowlist, scheduling) lives in a subscriber so the TUI
can reuse it. Desktop `setup` spawns one task: `events.subscribe()` loop → `runtime.on_event(&ev)`.

```rust
pub struct SceneRuntime {
    scenes: RwLock<Arc<SceneLibrary>>, skills: /* shared SkillLibrary handle */,
    store: Arc<Store>, artifacts: SceneArtifactStore,
    submit: Box<dyn Fn(Op) + Send + Sync>,          // engine submission entry
    emit: broadcast::Sender<Event>,
    sessions: Mutex<HashMap<SessionId, SessionSceneState>>,
}
struct SessionSceneState {
    scene_ref: Option<String>,
    fired: HashSet<String>,          // debounce keys "<hook-index>:<state_key>"
    banner_dismissed: HashSet<String>,
    macro_in_flight: Option<String>, // ≤1 hook-initiated prompt per session; cleared on that turn's TurnEnded
    last_test: Option<bool>,
}
impl SceneRuntime {
    pub fn scene_activated(&self, session, scene_ref: Option<&str>);   // fires `enter` hooks
    pub fn on_event(&self, event: &Event);
    pub fn dismiss_banner(&self, session, state_key: &str);
    pub fn set_scheduling(&self, project_path: &str, enabled: bool);
}
```

Event → hook: `enter` ← scene_activated; `turn_end` ← TurnEnded; `tests_failed` ←
TestSignal{passed:false}; `artifact_produced` (+filter) ← ArtifactProduced; `exit_criteria_met` ←
§4.4; `schedule` ← timer.

**Debounce state keys:** turn_end → per-session turn counter; tests_failed → tool_call_id;
artifact_produced → `key@version`; exit_criteria_met → sorted `kind[:artifact@version]` joined
(same key drives the banner never-re-fires rule); one fire per `"{hook_index}:{state_key}"`.

**Actions (allowlist only):** suggest_scene / suggest_next (first exit.next entry with carry) /
notify → `Event::HookSuggestion` (render-only). `run_macro`: refuse if in flight (log, drop);
resolve Macro; params from `args` with `{{artifact:<id>}}` interpolated via
`SceneArtifactStore::latest`; submit `Op::Prompt { doc: vec![DocBlock::Skill{skill_id, params}] }`
+ emit HookTurnStarted. Within current permission mode by construction — no code path to
`Op::SetExecutionPolicy`.

**Schedules (off by default per project):** store migration `projects.scheduling_enabled INTEGER
NOT NULL DEFAULT 0`; command `set_project_scheduling`; runtime 30s tick per enabled project;
hand-rolled five-field cron matcher `scene_runtime::cron::matches` (supports `* , - /`; table
tests; using the `cron` crate acceptable if dependency review passes). Scheduled runs obey
one-in-flight and land as attributed turns.

### 4.4 Exit-criteria evaluation (pure fn, run after TurnEnded / ArtifactProduced / pin changes)

```rust
pub struct ExitEvaluation { pub met: bool, pub satisfied: Vec<String>, pub missing: Vec<String>, pub unverified: Vec<String>, pub state_key: String }
pub fn evaluate_exit(scene: &Scene, artifacts: &SceneArtifactStore, session: &str, last_test: Option<bool>) -> ExitEvaluation
```
- required_artifacts: every required spec has ≥1 version.
- checklist_complete: latest referenced checklist has no `- [ ]` and ≥1 `- [x]` (missing → unsatisfied).
- tests_pass: `last_test == Some(true)`.
- user_confirm: excluded from `met`; marks the scene never-auto-advance (pipeline auto downgrade).
- custom: never machine-satisfied; description → `unverified`, does not block `met`.
- met && key not fired/dismissed → emit `Event::ExitCriteriaMet` + run exit_criteria_met hooks.

### 4.5 Engine glue landed inside the R8 PR (single engine.rs owner)

- Scene preamble injection: engine reads session's `active_scene`, resolves via
  `Engine::set_scenes(Arc<SceneLibrary>)` (mirroring `set_skills`; desktop `reload_scenes` calls
  both), prepends `prompt_preamble(scene, carried)` between project rules and user doc at
  `Op::Prompt` compile; carried from `resolve_carry` when pipeline-bound.
- Artifact auto-capture: at TurnEnded, `extract_artifact_blocks` over the turn's agent text →
  `SceneArtifactStore::record` → emit ArtifactProduced.
- `Event::Usage` emission where provider adapters report token counts; forward numeric ACP usage
  cost into `ContextWindow.cost_usd`.

### 4.6 R8 tests

testsignal.rs: full classification table (positives incl. `cd x && cargo test`, env prefixes;
negatives: `cargo build`, `pytest --help`, grep-for-test title, kind="read"); outcome precedence.
event.rs: wire-shape per §4.1. scene_runtime.rs: debounce; one-in-flight; artifact filter; enter
on activation; cron table; exit evaluation per kind; escalation can never originate from a hook
(no policy Op observable in a mock submit sink). Integration
`crates/core/tests/scene_runtime_hooks.rs`: fixture `test` scene's `tests_failed → suggest_scene
fix` end-to-end from a synthetic TestSignal.

---

## 5. Pipeline instances (R9 core half)

### 5.1 Persistence (store.rs, append to SCHEMA)

```sql
CREATE TABLE IF NOT EXISTS pipeline_instances (
  id            TEXT PRIMARY KEY,
  pipeline_ref  TEXT NOT NULL,
  project_path  TEXT NOT NULL,
  current_stage TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active',   -- 'active' | 'completed' | 'abandoned'
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS pipeline_transitions (
  instance_id TEXT NOT NULL,
  seq         INTEGER NOT NULL,
  from_stage  TEXT,                            -- NULL = entry
  to_stage    TEXT NOT NULL,
  trigger     TEXT NOT NULL,                   -- 'entry' | 'exit_criteria_met' | 'tests_failed' | 'user_request'
  gate        TEXT NOT NULL,                   -- gate actually used, post-downgrade
  session_id  TEXT,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (instance_id, seq)
);
```

`migrate()`: `ensure_column(sessions, "pipeline_instance_id" TEXT)` and
`ensure_column(sessions, "pipeline_stage" TEXT)`. Per-stage artifact versions need no extra table
(`scene_artifacts(pipeline_instance_id, stage_id)`). Loop count = COUNT(transitions to stage).

Store methods: `create_pipeline_instance`, `get_pipeline_instance`, `list_pipeline_instances`,
`record_pipeline_transition` (seq = MAX+1, updates current_stage/updated_at),
`set_pipeline_status`, `bind_session_to_stage`.

### 5.2 Transition evaluation (pure, scene.rs)

```rust
pub struct EffectiveTransition { pub to: String, pub when: TransitionTrigger, pub gate: Gate }
/// Listed transitions with from==stage REPLACE the default outgoing edge; absent any,
/// default = next stage in array order, when=ExitCriteriaMet, gate = target stage's gate.
/// Last stage with no listed transitions → empty (pipeline completes).
pub fn outgoing_edges(pipeline: &Pipeline, stage_id: &str) -> Vec<EffectiveTransition>
```

Runtime: session bound to (instance, stage) produces ExitCriteriaMet or TestSignal{failed} →
match edges by trigger. Gate handling: `auto` honored only when (a) `apply_execution(current,
target.session_mode, false)` is Ok AND (b) current stage scene's effective_criteria lack
user_confirm; else downgrade to suggest. suggest/confirm → HookSuggestion{kind:"suggest_next",
pipeline_instance, to_stage, carry}. Honored auto → advance directly (soft-apply same session).

### 5.3 Commands

`start_pipeline(reference, project_path, session: Option<String>)` → creates instance at entry,
records `entry` transition, binds + soft-applies entry scene when session given.
`advance_pipeline(instance_id, to_stage, session: Option<String>, confirm: bool)` →
`{ instance, applied_scene: Option<SceneApplyOutcome>, session_plan: Option<SceneSessionParams>,
carried: Vec<String> }`; escalation identical to apply_scene (refuse-and-report until confirm).
`bind_pipeline_session(instance_id, stage_id, session)`. `get_pipeline_instance(instance_id)` →
`{ instance, transitions, stages: Vec<StageStatus{id, scene_ref, title, state:
"done"|"current"|"pending", loop_count, sessions, artifacts}> }` (feeds the stage track).
`list_pipeline_instances(project_path)`.

### 5.4 Carry compilation

At prompt time for a stage-bound session, engine glue calls `resolve_carry(instance, stage)` and
passes to `prompt_preamble` — inlined and labeled like session mentions:
`## Carried artifact: <as-label or title> (from <stage>, v<n>)` + content (32 KiB cap). Each
stage re-entry recompiles against newest versions; the artifact store, not session memory, is the
inter-stage contract.

### 5.5 Tests

`outgoing_edges` against the rnd-lifecycle fixture (test stage listed edges replace default;
fix→test loop; acceptance confirm gate); loop counting; auto downgrade on loosening target and on
user_confirm presence; carry silent-skip; store round-trips. Integration
`crates/core/tests/scene_pipeline.rs`.

---

## 6. Per-session cost accounting (R7 core half) — new module `crates/core/src/cost.rs`

```rust
pub struct ModelPrice { pub provider: &'static str, pub model_prefix: &'static str, pub input_per_mtok: f64, pub output_per_mtok: f64 }
pub const PRICES: &[ModelPrice];   // hardcoded, prefix-matched (longest prefix wins); miss → priced:false
pub fn price_for(provider: &str, model: &str) -> Option<&'static ModelPrice>;

pub struct SessionCostTracker { inner: Mutex<HashMap<SessionId, SessionUsage>> }
struct SessionUsage {
    input_tokens: u64, output_tokens: u64,
    provider: Option<String>, model: Option<String>,
    authoritative_cost: Option<f64>,                 // from ContextWindow.cost_usd, wins over table
    samples: VecDeque<(i64 /*ms*/, f64 /*cumulative usd*/)>,   // retained 30 min
}
impl SessionCostTracker {
    pub fn observe(&self, event: &Event);            // Usage → accumulate; ContextWindow.cost_usd → authoritative
    pub fn set_session_model(&self, session, provider, model);
    pub fn snapshot(&self, session) -> Option<SessionCostSnapshot>;
}
pub struct SessionCostSnapshot {
    pub input_tokens: u64, pub output_tokens: u64,
    pub cost_usd: Option<f64>, pub burn_rate_usd_per_hour: Option<f64>,
    pub priced: bool, pub model: Option<String>,
}
```

Pricing: hardcoded PRICES with model-id **prefix** matching, no config file in v1; unknown model
→ priced:false, UI shows tokens + context only. The implementing agent fills the table from
current provider documentation — do not invent prices. `ContextWindow.cost_usd` always overrides.

Burn rate: trailing-window, `(cost(now) − cost(now − 10 min)) × 6` USD/h from the samples deque;
None when unpriced, window < 60 s, or < 2 samples.

Wiring: tracker in `AppState` (`cost: Arc<SessionCostTracker>`), fed by the same
broadcast-subscription task as SceneRuntime (engine untouched; Usage emission is R8 §4.5).
`set_session_model` from Models/ConfigOptions/set_model paths. On each observed event, emit
`Event::SessionCost` throttled ≥1 s apart per session.

Command: `usage_by_session(session) -> Option<SessionCostSnapshot>`. Not persisted v1 (resets on
restart; future `sessions.cost_usd` column is the upgrade path).

Tests: accumulation; prefix matching incl. miss; authoritative override; burn-rate window math
incl. None conditions; throttle.

---

## 7. Issue write path (R12 core half)

### 7.1 `issues.rs` additions

```rust
/// Post a comment via `gh issue comment <id> --body-file -` (body over stdin — no arg-length or
/// quoting hazards). Returns the comment URL gh prints on stdout. Validate id numeric first.
pub async fn comment_github(cwd: &Path, id: &str, body: &str) -> std::io::Result<String>

/// Resolve a Linear identifier ("ENG-123") to its internal issue id. GraphQL via curl (same
/// posture as list_linear) but the request body MUST be built with serde_json::json! (never
/// format!) and sent with `--data-binary @-` over stdin — the format!-built list query must not
/// be imitated for user-supplied text.
pub async fn resolve_linear_issue_id(token: &str, identifier: &str) -> std::io::Result<String>
pub fn parse_linear_issue_id(value: &serde_json::Value) -> Option<String>          // pure, tested

/// mutation { commentCreate(input: { issueId, body }) { success comment { id url } } }
pub async fn comment_linear(token: &str, issue_id: &str, body: &str) -> std::io::Result<String>
pub fn parse_linear_comment(value: &serde_json::Value) -> std::io::Result<String>  // pure; success:false → Err

/// Delegation activity-trail body: attribution line ("Delegated to C2 scene <ref>"),
/// session title, produced artifacts as a bullet list of (title, url-or-summary). Pure, tested.
pub fn delegation_comment(scene_ref: &str, session_title: &str, artifacts: &[(String, String)]) -> String
```

(Implementing agent verifies whether Linear's `issue(id:)` accepts human identifiers directly; if
yes, `resolve_linear_issue_id` collapses to one query. Parser fns stay either way.)

### 7.2 `DocBlock::Issue` (appended after `Artifact`)

```rust
/// A referenced issue-tracker item (delegation provenance). Snapshot embedded at insert time
/// (the composer already fetched it), so compile is offline-safe.
Issue { source: String /* "github"|"linear" */, id: String,
        #[serde(default)] title: String, #[serde(default)] url: String, #[serde(default)] body: String },
```
- `canonical_doc_text`: `format!("[issue:{source}#{id}]")`.
- Compile arm: render like `Issue::to_context` (title/url/body block). Never lands in `unresolved`.

### 7.3 Desktop command

`comment_issue(cwd, source, id, body) -> Result<String /*url*/, String>` — dispatches gh/Linear
(token from the existing Linear-token config path).

### 7.4 Tests

parse_linear_issue_id / parse_linear_comment (success, success:false, malformed);
delegation_comment formatting; canonical_doc_text for Issue; compile inlines title/url/body;
numeric-id validation rejection.

---

## 8. Core land order

1. **R3-core** — scene.rs full; skill.rs adds SlotDef/SlotKind types only; store active_scene
   columns; desktop AppState/reload_scenes/8 commands; keymap CycleScene; conformance test.
2. **R1-core** — Macro slots serde migration + compile defaults + builtin update; SkillInfo fields.
3. **R4-artifacts** — save_document; scene_artifacts table; scene_artifact.rs; DocBlock::Artifact
   + compile_full; artifact commands.
4. **R12-core** — issues.rs write fns; DocBlock::Issue (immediately after Artifact — sequential,
   mechanical rebase); comment_issue.
5. **R8-events** — the one and only event.rs + engine.rs change; testsignal.rs; scene_runtime.rs;
   scheduling_enabled; subscription task; dismiss command.
6. **R9-pipelines** — pipeline tables/methods; outgoing_edges; runtime edges; 5 commands.
7. **R7-cost** — cost.rs; usage_by_session; SessionCost emission (needs R8's variants + Usage).

skill.rs edits are strictly linear: 1 → 2 → 3 → 4. PR-7 can parallel PR-6.

Cross-cutting invariants: scenes/pipelines are pure data — no path executes scene-supplied
content; `scene::apply_execution` is the single escalation chokepoint; every loader warns and
skips on malformed input; unresolved references degrade, never error; all enum/command/handler
additions are appends.
