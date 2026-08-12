//! Code2 desktop bridge: a thin Tauri layer over `codetwo-core`.
//!
//! The core `Engine` is managed in Tauri state. Frontends push `Op`s through commands and receive
//! `Event`s streamed over the `engine-event` channel. Terminals live in the core as real emulators
//! (`codetwo_core::term`) keyed by a stable id; the frontend attaches to one and streams it over
//! `pty-output`.

mod browser;
mod browser_mcp;
mod lsp;

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use codetwo_core::browser::Annotation;
use codetwo_core::codex_runtime::CodexRuntimeDiscovery;
use codetwo_core::event::ModelChoice;
use codetwo_core::git::{self, Checkpoint, DiffResult, DiffScope, DiffStat, GitStatus};
use codetwo_core::github_skills;
use codetwo_core::harness;
use codetwo_core::issues::{self, Issue};
use codetwo_core::keymap::{Action as KeyAction, Keymap};
use codetwo_core::models::builtin_models;
use codetwo_core::permission::{ExecutionPolicy, PermissionMode, SandboxPolicy};
use codetwo_core::plugin::{self, InstalledPlugin, PluginCounts, PluginScaffold};
use codetwo_core::plugin_marketplace::{self, MarketplacePluginSource, PluginMarketplace};
use codetwo_core::project::{self, ProjectScript, ProjectWorktreeMode};
use codetwo_core::provider::{
    registry_with_codex_runtime, Provider, ProviderCapability, ProviderId,
};
use codetwo_core::scene::{
    self, ApplyStrength, Pipeline, Scene, SceneArtifactKind, SceneArtifactSpec, SceneLibrary,
    SceneSource,
};
use codetwo_core::scene_artifact::{SceneArtifactRecord, SceneArtifactStore};
use codetwo_core::scene_runtime::SceneRuntime;
use codetwo_core::skill::{
    builtin_skills, DocBlock, Skill, SkillKind, SkillLibrary, SkillPayload, SlotDef,
};
use codetwo_core::source_control::{self, SourceControlInfo};
use codetwo_core::store::Project;
use codetwo_core::term::{Scope, TerminalConfig, TerminalHandle, TerminalOutput};
use codetwo_core::workspace::DirEntry;
use codetwo_core::workspace_search::{
    self, WorkspaceSearchCancellation, WorkspaceSearchOptions, WorkspaceSearchResult,
};
use codetwo_core::worktree::{ResolvedWorktreeBaseline, WorktreeBaseline};
use codetwo_core::{
    ArtifactStore, CanvasAssetRef, CanvasDraft, CanvasDraftUpdate, CanvasExport, CanvasFeatureGate,
    CanvasFreezeInput, CanvasManifest, CanvasObject, CanvasSceneEnvelope, CanvasSnapshot,
    CanvasStaticAsset, DesktopMcpConfig, Engine, Event, MemoryAccess, MemoryReceipt, MemoryRecord,
    MemorySettings, MemoryStats, Op, Session, SessionSearchHit, Store, TranscriptCursor,
    TranscriptPage,
};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State, WebviewWindow};
use tokio::sync::broadcast;

#[derive(Serialize, Clone)]
struct RemoteStatus {
    port: u16,
    endpoints: Vec<codetwo_server::PairingEndpoint>,
}

#[derive(Serialize)]
struct RemotePairingLink {
    endpoint_id: String,
    url: String,
    token: String,
    expires_in: u64,
    qr_svg: String,
}

#[derive(Serialize)]
struct WorktreeBaselineOption {
    kind: WorktreeBaseline,
    resolved: Option<ResolvedWorktreeBaseline>,
    unavailable_reason: Option<String>,
}

/// The running remote server: its port, the live auth state (shared with the axum routes so we can
/// mint pairing tokens and revoke devices while it runs), and the serve task for teardown.
struct RemoteHandle {
    port: u16,
    auth: Arc<codetwo_server::AuthState>,
    task: tokio::task::JoinHandle<()>,
}

struct AppState {
    engine: Arc<Engine>,
    store: Arc<Store>,
    providers: Vec<ProviderInfo>,
    canvas_gate: CanvasFeatureGate,
    canvas_owner: String,
    events: broadcast::Sender<Event>,
    skills_dir: PathBuf,
    plugins_dir: PathBuf,
    /// Resolved scene/pipeline library (project > user > plugin > builtin). Reloaded alongside
    /// skills whenever the workspace changes.
    scenes: Mutex<Arc<SceneLibrary>>,
    /// Versioned scene-artifact captures over the shared content-addressed blob layer (R4).
    scene_artifacts: SceneArtifactStore,
    /// Scene hook dispatcher (R8), fed by one broadcast-subscription task spawned in `setup`.
    scene_runtime: Arc<SceneRuntime>,
    /// Last workspace the frontend listed skills for; harness skill discovery scans its
    /// project-level roots (`.claude/skills` …) so a save/delete reload keeps them.
    skills_cwd: Mutex<Option<PathBuf>>,
    keymap: Mutex<Keymap>,
    keymap_path: PathBuf,
    ptys: Mutex<HashMap<String, TerminalHandle>>,
    /// Request-scoped search cancellation handles. IDs come from the invoking webview, so one
    /// window never has to cancel another window's latest request implicitly.
    workspace_searches: Mutex<HashMap<(String, String), WorkspaceSearchCancellation>>,
    remote: Mutex<Option<RemoteHandle>>,
    /// Where paired remote devices persist (survives app restarts and server stop/start).
    remote_auth_path: PathBuf,
    browser_socket_path: PathBuf,
}

/// Rebuild the live skill library: built-ins + `<data>/skills/*.json` + skills auto-discovered
/// from the harness directories (~/.claude/skills, .codex/skills, …) of the current workspace.
fn reload_skills(state: &AppState) {
    let mut v = builtin_skills();
    if let Ok(loaded) = SkillLibrary::load_dir(&state.skills_dir) {
        v.extend(loaded.all().cloned());
    }
    if let Ok(plugins) = plugin::load_dir(&state.plugins_dir) {
        v.extend(
            plugins
                .into_iter()
                .filter(|plugin| plugin.enabled)
                .flat_map(|plugin| plugin.components),
        );
    }
    let cwd = state.skills_cwd.lock().unwrap().clone();
    v.extend(harness::discover(cwd.as_deref()));
    state.engine.set_skills(SkillLibrary::new(v));
}

/// Rebuild the scene library: `<project>/.codetwo/scenes` + `~/.config/codetwo/scenes` +
/// enabled plugins' `scenes/` dirs + builtins, in that precedence order.
fn reload_scenes(state: &AppState) {
    let cwd = state.skills_cwd.lock().unwrap().clone();
    let project_dir = cwd.map(|c| c.join(".codetwo/scenes"));
    let user_dir = dirs_home().map(|h| h.join(".config/codetwo/scenes"));
    let plugins: Vec<(String, PathBuf)> = plugin::load_dir(&state.plugins_dir)
        .map(|plugins| {
            plugins
                .into_iter()
                .filter(|plugin| plugin.enabled)
                .map(|plugin| {
                    let dir = state.plugins_dir.join(&plugin.id).join("scenes");
                    (plugin.id, dir)
                })
                .collect()
        })
        .unwrap_or_default();
    let lib = Arc::new(SceneLibrary::load(
        project_dir.as_deref(),
        user_dir.as_deref(),
        &plugins,
    ));
    *state.scenes.lock().unwrap() = lib.clone();
    // Keep the engine's preamble compiler and the hook runtime on the same resolved library.
    state.engine.set_scenes(lib.clone());
    state.scene_runtime.set_scenes(lib);
}

#[derive(Serialize, Clone)]
struct ProviderInfo {
    id: String,
    display_name: String,
    available: bool,
    needs_node: bool,
    /// The models we offer for this provider when it reports none of its own over ACP. Empty only
    /// for providers we ship no list for.
    models: Vec<ModelChoice>,
    #[serde(default)]
    capabilities: Vec<ProviderCapability>,
}

#[derive(Serialize)]
struct SkillInfo {
    id: String,
    name: String,
    description: String,
    icon: Option<String>,
    kind: String,
    /// Harness display name ("Claude Code" …) for auto-discovered skills; `None` for library ones.
    source: Option<String>,
    /// Macro payload metadata so the `/` picker can render the inline slot card without a second
    /// fetch. `None` for every other kind.
    #[serde(skip_serializing_if = "Option::is_none")]
    macro_template: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    macro_slots: Option<Vec<SlotDef>>,
}

#[derive(Serialize, Clone)]
struct PtyOutput {
    id: String,
    data: String,
}

#[derive(Serialize, Clone)]
struct PtyTitle {
    id: String,
    title: String,
}

/// The result of attaching to a terminal. `restore` is a VT dump that replays the terminal's
/// scrollback and screen into a fresh renderer — empty for one that was just created.
#[derive(Serialize)]
struct PtyAttach {
    created: bool,
    restore: String,
}

#[derive(Serialize)]
struct MarketItem {
    id: String,
    name: String,
    description: String,
    author: String,
    tags: Vec<String>,
    icon: Option<String>,
    kind: String,
    installed: bool,
}

#[derive(Serialize)]
struct GitHubImportResult {
    plugin: PluginInfo,
}

#[derive(Serialize)]
struct PluginScaffoldInfo {
    id: String,
    name: String,
    description: String,
    files: usize,
}

#[derive(Serialize)]
struct PluginInfo {
    id: String,
    name: String,
    version: String,
    description: String,
    author: String,
    source: String,
    repository: String,
    spec_version: String,
    standard: plugin::PluginStandard,
    standards: Vec<plugin::PluginStandard>,
    enabled: bool,
    trusted: bool,
    scope: plugin::PluginInstallScope,
    counts: PluginCounts,
    scaffolds: Vec<PluginScaffoldInfo>,
    extension_components: Vec<plugin::PluginExtensionComponent>,
    diagnostics: Vec<plugin::PluginDiagnostic>,
}

impl From<PluginScaffold> for PluginScaffoldInfo {
    fn from(scaffold: PluginScaffold) -> Self {
        Self {
            id: scaffold.id,
            name: scaffold.name,
            description: scaffold.description,
            files: scaffold.files,
        }
    }
}

impl From<InstalledPlugin> for PluginInfo {
    fn from(plugin: InstalledPlugin) -> Self {
        Self {
            id: plugin.id,
            name: plugin.name,
            version: plugin.version,
            description: plugin.description,
            author: plugin.author,
            source: plugin.source,
            repository: plugin.repository,
            spec_version: plugin.spec_version,
            standard: plugin.standard,
            standards: plugin.standards,
            enabled: plugin.enabled,
            trusted: plugin.trusted,
            scope: plugin.scope,
            counts: plugin.counts,
            scaffolds: plugin.scaffolds.into_iter().map(Into::into).collect(),
            extension_components: plugin.extension_components,
            diagnostics: plugin.diagnostics,
        }
    }
}

fn parse_provider(s: &str) -> ProviderId {
    match s {
        "claude_code" => ProviderId::ClaudeCode,
        "codex" => ProviderId::Codex,
        "grok" => ProviderId::Grok,
        "cursor" => ProviderId::Cursor,
        "opencode" => ProviderId::OpenCode,
        "pi" => ProviderId::Pi,
        "kimi" => ProviderId::Kimi,
        "zcode" => ProviderId::ZCode,
        other => ProviderId::Custom(other.to_string()),
    }
}

fn parse_mode(s: &str) -> PermissionMode {
    match s {
        "accept_edits" => PermissionMode::AcceptEdits,
        "yolo" => PermissionMode::Yolo,
        _ => PermissionMode::Ask,
    }
}

fn parse_sandbox(s: &str) -> Result<SandboxPolicy, String> {
    match s {
        "read_only" => Ok(SandboxPolicy::ReadOnly),
        "workspace_write" => Ok(SandboxPolicy::WorkspaceWrite),
        "danger_full_access" => Ok(SandboxPolicy::DangerFullAccess),
        other => Err(format!("unknown sandbox policy: {other}")),
    }
}

fn kind_str(k: SkillKind) -> String {
    match k {
        SkillKind::Fragment => "fragment",
        SkillKind::AgentSkill => "agent_skill",
        SkillKind::Subagent => "subagent",
        SkillKind::Mcp => "mcp",
        SkillKind::Macro => "macro",
    }
    .to_string()
}

// ---- commands --------------------------------------------------------------------------------

#[tauri::command]
fn list_providers(state: State<'_, AppState>) -> Vec<ProviderInfo> {
    state.providers.clone()
}

#[tauri::command]
fn list_sessions(state: State<'_, AppState>) -> Result<Vec<Session>, String> {
    state
        .engine
        .list_sessions()
        .map_err(|error| error.to_string())
}

/// Resolve both choices from local refs only. The core resolver deliberately has no fetch path.
#[tauri::command]
async fn list_worktree_baselines(cwd: String) -> Vec<WorktreeBaselineOption> {
    let path = std::path::Path::new(&cwd);
    let (current, origin_default) = tokio::join!(
        codetwo_core::worktree::resolve_baseline(path, WorktreeBaseline::Current),
        codetwo_core::worktree::resolve_baseline(path, WorktreeBaseline::OriginDefault),
    );
    [
        (WorktreeBaseline::Current, current),
        (WorktreeBaseline::OriginDefault, origin_default),
    ]
    .into_iter()
    .map(|(kind, result)| match result {
        Ok(resolved) => WorktreeBaselineOption {
            kind,
            resolved: Some(resolved),
            unavailable_reason: None,
        },
        Err(error) => WorktreeBaselineOption {
            kind,
            resolved: None,
            unavailable_reason: Some(error.to_string()),
        },
    })
    .collect()
}

#[tauri::command]
fn list_skills(state: State<'_, AppState>, cwd: Option<String>) -> Vec<SkillInfo> {
    // A cwd means the frontend switched (or confirmed) its workspace: rescan the harness skill
    // directories so project-level skills track the project the user is actually in.
    if let Some(c) = cwd {
        *state.skills_cwd.lock().unwrap() = Some(PathBuf::from(c));
        reload_skills(&state);
    }
    let lib = state.engine.skills();
    let lib = lib.lock().unwrap();
    let mut out: Vec<SkillInfo> = lib
        .all()
        .map(|s| {
            let (macro_template, macro_slots) = match &s.payload {
                SkillPayload::Macro { template, slots } => {
                    (Some(template.clone()), Some(slots.clone()))
                }
                _ => (None, None),
            };
            SkillInfo {
                id: s.id.clone(),
                name: s.name.clone(),
                description: s.description.clone(),
                icon: s.icon.clone(),
                kind: kind_str(s.kind()),
                source: s
                    .source
                    .clone()
                    .or_else(|| harness::source_label(&s.id).map(str::to_string)),
                macro_template,
                macro_slots,
            }
        })
        .collect();
    // Library skills first, then each harness's group, name-sorted — the map iterates randomly.
    out.sort_by(|a, b| (a.source.as_deref(), &a.name).cmp(&(b.source.as_deref(), &b.name)));
    out
}

#[tauri::command]
fn save_skill(state: State<'_, AppState>, skill: Skill) -> Result<(), String> {
    SkillLibrary::save_to_dir(&state.skills_dir, &skill).map_err(|e| e.to_string())?;
    reload_skills(&state);
    Ok(())
}

#[tauri::command]
fn delete_skill(state: State<'_, AppState>, id: String) -> Result<(), String> {
    SkillLibrary::delete_from_dir(&state.skills_dir, &id).map_err(|e| e.to_string())?;
    reload_skills(&state);
    Ok(())
}

// ---- scenes ---------------------------------------------------------------------------------

/// Wire shape for one resolved scene. A superset of the core listing so the scene chip can render
/// posture, brief, and pinned skills without a second fetch.
#[derive(Serialize)]
struct SceneInfo {
    reference: String,
    name: String,
    title: String,
    description: String,
    icon: Option<String>,
    source: &'static str,
    plugin_id: Option<String>,
    keywords: Vec<String>,
    has_brief: bool,
    localizations: std::collections::HashMap<String, codetwo_core::SceneLocalization>,
    execution: Option<codetwo_core::SceneExecution>,
    brief: Option<codetwo_core::SceneBrief>,
    artifacts: Vec<codetwo_core::SceneArtifactSpec>,
    skills: Option<codetwo_core::SceneSkills>,
    /// Appended for R8's completion banner: exit criteria and next-scene suggestions.
    exit: Option<codetwo_core::SceneExit>,
}

impl SceneInfo {
    fn from_resolved(entry: &scene::ResolvedScene) -> Self {
        let plugin_id = match &entry.source {
            SceneSource::Plugin { plugin_id } => Some(plugin_id.clone()),
            _ => None,
        };
        SceneInfo {
            reference: SceneLibrary::reference_for(entry),
            name: entry.scene.name.clone(),
            title: entry.scene.title.clone(),
            description: entry.scene.description.clone(),
            icon: entry.scene.icon.clone(),
            source: entry.source.source_label(),
            plugin_id,
            keywords: entry.scene.keywords.clone(),
            has_brief: entry.scene.brief.is_some(),
            localizations: entry.scene.localizations.clone(),
            execution: entry.scene.execution.clone(),
            brief: entry.scene.brief.clone(),
            artifacts: entry.scene.artifacts.clone(),
            skills: entry.scene.skills.clone(),
            exit: entry.scene.exit.clone(),
        }
    }
}

#[derive(Serialize)]
struct SceneDetail {
    reference: String,
    source: &'static str,
    scene: Scene,
}

#[derive(Serialize)]
struct PipelineInfo {
    reference: String,
    name: String,
    title: String,
    description: String,
    icon: Option<String>,
    source: &'static str,
    stage_count: usize,
}

#[derive(Serialize)]
struct PipelineDetail {
    reference: String,
    source: &'static str,
    pipeline: Pipeline,
}

#[derive(Serialize)]
struct EscalationOut {
    from: String,
    to: String,
}

impl EscalationOut {
    fn from_core(e: scene::EscalationRequired) -> Self {
        EscalationOut {
            from: e.from.as_str().to_string(),
            to: e.to.as_str().to_string(),
        }
    }
}

#[derive(Serialize)]
struct SceneApplyOutcome {
    applied: Vec<&'static str>,
    pending: Vec<&'static str>,
    escalation: Option<EscalationOut>,
    plan_first: Option<bool>,
    suppress_unpinned: bool,
    pinned_skills: Vec<String>,
}

#[derive(Serialize)]
struct SceneSessionPlanOutcome {
    params: Option<codetwo_core::SceneSessionParams>,
    escalation: Option<EscalationOut>,
}

#[derive(Serialize)]
struct SessionSceneState {
    reference: String,
    customized: bool,
    resolved: bool,
}

fn pending_field_str(field: codetwo_core::PendingField) -> &'static str {
    match field {
        codetwo_core::PendingField::Providers => "providers",
        codetwo_core::PendingField::Model => "model",
        codetwo_core::PendingField::ReasoningEffort => "reasoning_effort",
        codetwo_core::PendingField::Worktree => "worktree",
    }
}

#[tauri::command]
fn list_scenes(state: State<'_, AppState>, cwd: Option<String>) -> Vec<SceneInfo> {
    // Same contract as `list_skills`: a cwd means the workspace changed — rescan project scenes.
    if let Some(c) = cwd {
        *state.skills_cwd.lock().unwrap() = Some(PathBuf::from(c));
        reload_scenes(&state);
    }
    let lib = state.scenes.lock().unwrap().clone();
    lib.scenes().iter().map(SceneInfo::from_resolved).collect()
}

#[tauri::command]
fn get_scene(state: State<'_, AppState>, reference: String) -> Result<SceneDetail, String> {
    let lib = state.scenes.lock().unwrap().clone();
    let entry = lib
        .resolve(&reference)
        .ok_or_else(|| format!("unknown scene `{reference}`"))?;
    Ok(SceneDetail {
        reference: SceneLibrary::reference_for(entry),
        source: entry.source.source_label(),
        scene: entry.scene.clone(),
    })
}

#[tauri::command]
fn list_pipelines(state: State<'_, AppState>) -> Vec<PipelineInfo> {
    let lib = state.scenes.lock().unwrap().clone();
    lib.pipelines()
        .iter()
        .map(|entry| PipelineInfo {
            reference: SceneLibrary::pipeline_reference_for(entry),
            name: entry.pipeline.name.clone(),
            title: entry.pipeline.title.clone(),
            description: entry.pipeline.description.clone(),
            icon: entry.pipeline.icon.clone(),
            source: entry.source.source_label(),
            stage_count: entry.pipeline.stages.len(),
        })
        .collect()
}

#[tauri::command]
fn get_pipeline(state: State<'_, AppState>, reference: String) -> Result<PipelineDetail, String> {
    let lib = state.scenes.lock().unwrap().clone();
    let entry = lib
        .resolve_pipeline(&reference)
        .ok_or_else(|| format!("unknown pipeline `{reference}`"))?;
    Ok(PipelineDetail {
        reference: SceneLibrary::pipeline_reference_for(entry),
        source: entry.source.source_label(),
        pipeline: entry.pipeline.clone(),
    })
}

/// Soft-apply a scene to a live session. On an unconfirmed escalation NOTHING is applied and the
/// outcome carries the prompt; the frontend confirms and re-calls with `confirm_escalation`.
#[tauri::command]
async fn apply_scene(
    state: State<'_, AppState>,
    session: String,
    reference: String,
    confirm_escalation: bool,
) -> Result<SceneApplyOutcome, String> {
    let (scene_ref, scene, plan) = {
        let lib = state.scenes.lock().unwrap().clone();
        let entry = lib
            .resolve(&reference)
            .ok_or_else(|| format!("unknown scene `{reference}`"))?;
        let current = state
            .store
            .get_session(&session)
            .map_err(|e| e.to_string())?
            .map(|s| ExecutionPolicy {
                mode: s.permission_mode,
                sandbox: s.sandbox_policy,
            })
            .unwrap_or_default();
        let scene_ref = SceneLibrary::reference_for(entry);
        let plan = scene::plan_apply(
            &current,
            &entry.scene,
            &scene_ref,
            ApplyStrength::Soft,
            confirm_escalation,
        );
        (scene_ref, entry.scene.clone(), plan)
    };

    if let Some(escalation) = plan.escalation {
        return Ok(SceneApplyOutcome {
            applied: Vec::new(),
            pending: Vec::new(),
            escalation: Some(EscalationOut::from_core(escalation)),
            plan_first: None,
            suppress_unpinned: false,
            pinned_skills: Vec::new(),
        });
    }

    let mut applied = Vec::new();
    if let Some(policy) = plan.execution {
        state
            .engine
            .submit(Op::SetExecutionPolicy {
                session: session.clone(),
                mode: policy.mode,
                sandbox: policy.sandbox,
                request_id: None,
            })
            .await
            .map_err(|e| e.to_string())?;
        applied.push("session_mode");
    }
    if let Some((read, write)) = plan.memory {
        state
            .store
            .set_session_memory_policy(&session, read, write)
            .map_err(|e| e.to_string())?;
        applied.push("memory_preset");
    }
    if plan.plan_first.is_some() {
        applied.push("plan_first");
    }
    state
        .store
        .set_session_scene(&session, Some(&scene_ref), false)
        .map_err(|e| e.to_string())?;

    let skills = scene.skills.unwrap_or_default();
    Ok(SceneApplyOutcome {
        applied,
        pending: plan.pending.into_iter().map(pending_field_str).collect(),
        escalation: None,
        plan_first: plan.plan_first,
        suppress_unpinned: skills.suppress_unpinned,
        pinned_skills: skills.pinned,
    })
}

/// Full-apply plan for creating a new session in a scene. Applied against the project-default
/// policy, so a loose scene escalates here too until the frontend confirms.
#[tauri::command]
fn scene_session_plan(
    state: State<'_, AppState>,
    reference: String,
    confirm_escalation: bool,
) -> Result<SceneSessionPlanOutcome, String> {
    let lib = state.scenes.lock().unwrap().clone();
    let entry = lib
        .resolve(&reference)
        .ok_or_else(|| format!("unknown scene `{reference}`"))?;
    let scene_ref = SceneLibrary::reference_for(entry);
    let plan = scene::plan_apply(
        &ExecutionPolicy::default(),
        &entry.scene,
        &scene_ref,
        ApplyStrength::Full,
        confirm_escalation,
    );
    if let Some(escalation) = plan.escalation {
        return Ok(SceneSessionPlanOutcome {
            params: None,
            escalation: Some(EscalationOut::from_core(escalation)),
        });
    }
    let mut params = plan.new_session;
    if let Some(p) = params.as_mut() {
        // Only offer a provider the user actually has installed; otherwise inherit.
        if let Some(wanted) = &p.provider {
            let available = state
                .providers
                .iter()
                .any(|info| info.available && info.id == *wanted);
            if !available {
                p.provider = entry
                    .scene
                    .execution
                    .as_ref()
                    .map(|e| e.providers.clone())
                    .unwrap_or_default()
                    .into_iter()
                    .find(|candidate| {
                        state
                            .providers
                            .iter()
                            .any(|info| info.available && info.id == *candidate)
                    });
            }
        }
    }
    Ok(SceneSessionPlanOutcome {
        params,
        escalation: None,
    })
}

#[tauri::command]
fn set_session_scene(
    state: State<'_, AppState>,
    session: String,
    reference: Option<String>,
    customized: bool,
) -> Result<(), String> {
    state
        .store
        .set_session_scene(&session, reference.as_deref(), customized)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn get_session_scene(
    state: State<'_, AppState>,
    session: String,
) -> Result<Option<SessionSceneState>, String> {
    let stored = state
        .store
        .session_scene(&session)
        .map_err(|e| e.to_string())?;
    let lib = state.scenes.lock().unwrap().clone();
    Ok(stored.map(|(reference, customized)| SessionSceneState {
        resolved: lib.resolve(&reference).is_some(),
        reference,
        customized,
    }))
}

// ---- scene artifacts (R4) -------------------------------------------------------------------

#[tauri::command]
fn list_scene_artifacts(
    state: State<'_, AppState>,
    session: String,
) -> Result<Vec<SceneArtifactRecord>, String> {
    state
        .scene_artifacts
        .list_for_session(&session)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn scene_artifact_content(state: State<'_, AppState>, record_id: i64) -> Result<String, String> {
    state
        .scene_artifacts
        .content(record_id)
        .map_err(|e| e.to_string())
}

/// Manual capture (the guaranteed path — "pin as artifact" / R4 plan save). The scene reference
/// and spec come from the session's active scene; a key the scene does not declare degrades to
/// kind `custom` with the key as its title rather than failing the save.
#[tauri::command]
fn record_scene_artifact(
    state: State<'_, AppState>,
    session: String,
    artifact_key: String,
    content: String,
) -> Result<SceneArtifactRecord, String> {
    let scene_ref = state
        .store
        .session_scene(&session)
        .map_err(|e| e.to_string())?
        .map(|(reference, _)| reference)
        .unwrap_or_default();
    let spec = {
        let lib = state.scenes.lock().unwrap().clone();
        lib.resolve(&scene_ref)
            .and_then(|entry| {
                entry
                    .scene
                    .artifacts
                    .iter()
                    .find(|artifact| artifact.id == artifact_key)
                    .cloned()
            })
            .unwrap_or_else(|| SceneArtifactSpec {
                id: artifact_key.clone(),
                title: artifact_key.clone(),
                kind: SceneArtifactKind::Custom,
                required: false,
                template: None,
                description: None,
            })
    };
    state
        .scene_artifacts
        .record(&scene_ref, &spec, &session, None, &content)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn pin_scene_artifact(
    state: State<'_, AppState>,
    session: String,
    artifact_key: String,
    version: Option<i64>,
) -> Result<(), String> {
    state
        .scene_artifacts
        .pin(&session, &artifact_key, version)
        .map_err(|e| e.to_string())
}

// ---- scene hooks (R8) -----------------------------------------------------------------------

/// Remember a completion-banner dismissal: the same exit state never re-fires for this session.
#[tauri::command]
fn dismiss_scene_banner(state: State<'_, AppState>, session: String, state_key: String) {
    state.scene_runtime.dismiss_banner(&session, &state_key);
}

/// Enable/disable scene `schedule` hooks for one project (off by default).
#[tauri::command]
fn set_project_scheduling(state: State<'_, AppState>, path: String, enabled: bool) {
    state.scene_runtime.set_scheduling(&path, enabled);
}

// ---- provider-neutral memory ----------------------------------------------------------------

#[tauri::command]
fn memory_settings(state: State<'_, AppState>) -> Result<MemorySettings, String> {
    state
        .engine
        .store()
        .ok_or_else(|| "memory store unavailable".to_string())?
        .memory_settings()
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn set_memory_settings(state: State<'_, AppState>, settings: MemorySettings) -> Result<(), String> {
    state
        .engine
        .store()
        .ok_or_else(|| "memory store unavailable".to_string())?
        .set_memory_settings(settings)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn list_memories(
    state: State<'_, AppState>,
    project_path: String,
    limit: Option<usize>,
) -> Result<Vec<MemoryRecord>, String> {
    state
        .engine
        .store()
        .ok_or_else(|| "memory store unavailable".to_string())?
        .list_memories(&project_path, limit.unwrap_or(100).min(500))
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn search_memories(
    state: State<'_, AppState>,
    project_path: String,
    query: String,
    limit: Option<usize>,
) -> Result<Vec<MemoryRecord>, String> {
    state
        .engine
        .store()
        .ok_or_else(|| "memory store unavailable".to_string())?
        .search_memories(&project_path, &query, limit.unwrap_or(50).min(100))
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn memory_stats(state: State<'_, AppState>, project_path: String) -> Result<MemoryStats, String> {
    state
        .engine
        .store()
        .ok_or_else(|| "memory store unavailable".to_string())?
        .memory_stats(&project_path)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn add_memory(
    state: State<'_, AppState>,
    project_path: String,
    category: String,
    content: String,
    pinned: bool,
) -> Result<MemoryRecord, String> {
    state
        .engine
        .store()
        .ok_or_else(|| "memory store unavailable".to_string())?
        .add_memory(&project_path, &category, &content, pinned)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn set_memory_pinned(state: State<'_, AppState>, id: String, pinned: bool) -> Result<(), String> {
    state
        .engine
        .store()
        .ok_or_else(|| "memory store unavailable".to_string())?
        .set_memory_pinned(&id, pinned)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn set_memory_active(state: State<'_, AppState>, id: String, active: bool) -> Result<(), String> {
    state
        .engine
        .store()
        .ok_or_else(|| "memory store unavailable".to_string())?
        .set_memory_active(&id, active)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn set_session_memory_policy(
    state: State<'_, AppState>,
    session: String,
    read: MemoryAccess,
    write: MemoryAccess,
) -> Result<(), String> {
    state
        .engine
        .store()
        .ok_or_else(|| "memory store unavailable".to_string())?
        .set_session_memory_policy(&session, read, write)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn list_memory_receipts(
    state: State<'_, AppState>,
    session: String,
) -> Result<Vec<MemoryReceipt>, String> {
    state
        .engine
        .store()
        .ok_or_else(|| "memory store unavailable".to_string())?
        .list_memory_receipts(&session)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn get_transcript_page(
    state: State<'_, AppState>,
    session: String,
    before: Option<i64>,
    limit: usize,
) -> Result<TranscriptPage, String> {
    state
        .engine
        .transcript_page(&session, before.map(TranscriptCursor), limit)
        .map_err(|error| error.to_string())
}

// ---- git quick-view (F1) ---------------------------------------------------------------------

#[tauri::command]
async fn git_status(cwd: String) -> GitStatus {
    git::status(std::path::Path::new(&cwd)).await
}

// checkpoints, diffs, commit/push (F7/F8)

#[tauri::command]
async fn git_checkpoint(cwd: String, message: String) -> Result<Checkpoint, String> {
    git::checkpoint(std::path::Path::new(&cwd), &message)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn git_checkpoints(cwd: String) -> Vec<Checkpoint> {
    git::list_checkpoints(std::path::Path::new(&cwd)).await
}

#[tauri::command]
async fn git_diff(
    cwd: String,
    path: Option<String>,
    scope: DiffScope,
) -> Result<DiffResult, String> {
    git::diff(std::path::Path::new(&cwd), path.as_deref(), scope)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn git_diff_since(cwd: String, commit: String) -> Result<DiffResult, String> {
    git::diff_since(std::path::Path::new(&cwd), &commit)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn git_diff_stat(cwd: String) -> Result<DiffStat, String> {
    git::diff_stat(std::path::Path::new(&cwd))
        .await
        .map_err(|e| e.to_string())
}

/// Diff stat for a session's own checkout (worktree-aware: `cwd` already points inside the
/// isolated checkout for worktree sessions). Unknown session → `None`, so the mission-control
/// dialog renders a dash instead of an error.
#[tauri::command]
async fn session_diff_stat(
    state: State<'_, AppState>,
    session: String,
) -> Result<Option<DiffStat>, String> {
    let cwd = state
        .store
        .get_session(&session)
        .map_err(|e| e.to_string())?
        .map(|s| s.cwd);
    let Some(cwd) = cwd else {
        return Ok(None);
    };
    git::diff_stat(std::path::Path::new(&cwd))
        .await
        .map(Some)
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn git_stage_paths(cwd: String, paths: Vec<String>) -> Result<(), String> {
    git::stage_paths(std::path::Path::new(&cwd), &paths)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn git_unstage_paths(cwd: String, paths: Vec<String>) -> Result<(), String> {
    git::unstage_paths(std::path::Path::new(&cwd), &paths)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn git_revert(cwd: String, commit: String) -> Result<(), String> {
    git::revert_to(std::path::Path::new(&cwd), &commit)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn git_commit(cwd: String, message: String) -> Result<String, String> {
    git::commit(std::path::Path::new(&cwd), &message)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn git_push(cwd: String) -> Result<String, String> {
    git::push(std::path::Path::new(&cwd))
        .await
        .map_err(|e| e.to_string())
}

// ---- keybindings (F2) ------------------------------------------------------------------------

#[tauri::command]
fn get_keymap(state: State<'_, AppState>) -> Vec<(String, String, String)> {
    state.keymap.lock().unwrap().entries()
}

#[tauri::command]
fn set_keymap(state: State<'_, AppState>, action: String, key: String) -> Result<(), String> {
    let mut km = state.keymap.lock().unwrap();
    match serde_json::from_value::<KeyAction>(serde_json::Value::String(action.clone())) {
        Ok(a) => {
            km.set(a, key);
            km.save(&state.keymap_path).map_err(|e| e.to_string())
        }
        Err(_) => Err(format!("unknown action: {action}")),
    }
}

// ---- browser annotate (F3/F4) ----------------------------------------------------------------

/// Render a browser annotation as the markdown context block the UI inserts into the prompt doc.
#[tauri::command]
fn browser_context(annotation: Annotation) -> String {
    annotation.to_context()
}

/// Open the inspector on the app's own UI. The browser panel's pages are separate webviews now and
/// have their own item — see `browser::browser_devtools`.
#[tauri::command]
fn open_devtools(window: tauri::WebviewWindow) {
    window.open_devtools();
}

// ---- Plugin Hub + component market (F5) -------------------------------------------------------

#[tauri::command]
fn market_catalog(state: State<'_, AppState>) -> Vec<MarketItem> {
    let lib = state.engine.skills();
    let lib = lib.lock().unwrap();
    codetwo_core::market::builtin_catalog()
        .into_iter()
        .map(|e| MarketItem {
            installed: lib.get(&e.id).is_some(),
            kind: kind_str(e.kind()),
            id: e.id,
            name: e.name,
            description: e.description,
            author: e.author,
            tags: e.tags,
            icon: e.icon,
        })
        .collect()
}

#[tauri::command]
fn market_install(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let entry = codetwo_core::market::builtin_catalog()
        .into_iter()
        .find(|e| e.id == id)
        .ok_or_else(|| format!("unknown market skill: {id}"))?;
    SkillLibrary::save_to_dir(&state.skills_dir, &entry.to_skill()).map_err(|e| e.to_string())?;
    reload_skills(&state);
    Ok(())
}

#[tauri::command]
fn list_plugins(state: State<'_, AppState>) -> Vec<PluginInfo> {
    plugin::load_dir(&state.plugins_dir)
        .unwrap_or_default()
        .into_iter()
        .map(Into::into)
        .collect()
}

/// Install a complete plugin from a public GitHub repository (or selected tree path). The core
/// validates the manifest and preserves its files without executing repository code.
#[tauri::command]
async fn github_import_plugin(
    state: State<'_, AppState>,
    lsp_state: State<'_, lsp::LspState>,
    repository: String,
) -> Result<GitHubImportResult, String> {
    let checkout = github_skills::checkout(&repository)
        .await
        .map_err(|error| error.to_string())?;
    let bundle = plugin::from_github(&checkout).map_err(|error| error.to_string())?;
    lsp_state.kill_plugin(&bundle.plugin.id);
    let installed =
        plugin::install(&state.plugins_dir, bundle).map_err(|error| error.to_string())?;
    reload_skills(&state);
    Ok(GitHubImportResult {
        plugin: installed.into(),
    })
}

#[tauri::command]
fn read_plugin_marketplace(path: String) -> Result<PluginMarketplace, String> {
    plugin_marketplace::load(std::path::Path::new(&path)).map_err(|error| error.to_string())
}

#[tauri::command]
async fn install_marketplace_plugin(
    state: State<'_, AppState>,
    lsp_state: State<'_, lsp::LspState>,
    marketplace_path: String,
    plugin_name: String,
) -> Result<GitHubImportResult, String> {
    let marketplace = plugin_marketplace::load(std::path::Path::new(&marketplace_path))
        .map_err(|error| error.to_string())?;
    let entry = plugin_marketplace::plugin(&marketplace, &plugin_name)
        .map_err(|error| error.to_string())?;
    if !entry.installable {
        return Err(entry
            .diagnostic
            .clone()
            .unwrap_or_else(|| "Marketplace plugin source is not installable".into()));
    }
    let source_label = format!("Marketplace · {}", marketplace.display_name);
    let mut bundle = match &entry.source {
        MarketplacePluginSource::Local { .. } => {
            let root = plugin_marketplace::resolve_local_source(&marketplace, &entry.source)
                .map_err(|error| error.to_string())?;
            plugin::from_local(
                &root,
                &source_label,
                &format!("{}:{}", marketplace.manifest_path, entry.name),
            )
            .map_err(|error| error.to_string())?
        }
        MarketplacePluginSource::Github {
            repository,
            reference,
            sha,
        } => {
            let mut spec =
                github_skills::parse_repository(repository).map_err(|error| error.to_string())?;
            spec.reference = sha.clone().or_else(|| reference.clone());
            let checkout = github_skills::checkout_spec(spec)
                .await
                .map_err(|error| error.to_string())?;
            plugin::from_github(&checkout).map_err(|error| error.to_string())?
        }
        MarketplacePluginSource::Git {
            url,
            path,
            reference,
            sha,
        } => {
            let mut spec =
                github_skills::parse_repository(url).map_err(|error| error.to_string())?;
            spec.reference = sha.clone().or_else(|| reference.clone());
            spec.subpath = path
                .as_deref()
                .map(|path| PathBuf::from(path.strip_prefix("./").unwrap_or(path)));
            let checkout = github_skills::checkout_spec(spec)
                .await
                .map_err(|error| error.to_string())?;
            plugin::from_github(&checkout).map_err(|error| error.to_string())?
        }
        _ => return Err("Marketplace plugin source is not installable".into()),
    };
    bundle.plugin.source = source_label;
    bundle.plugin.enabled = entry.default_enabled;
    if bundle.plugin.version == "0.0.0" && !entry.version.is_empty() {
        bundle.plugin.version = entry.version.clone();
    }
    lsp_state.kill_plugin(&bundle.plugin.id);
    let installed =
        plugin::install(&state.plugins_dir, bundle).map_err(|error| error.to_string())?;
    reload_skills(&state);
    Ok(GitHubImportResult {
        plugin: installed.into(),
    })
}

#[tauri::command]
fn uninstall_plugin(
    state: State<'_, AppState>,
    lsp_state: State<'_, lsp::LspState>,
    id: String,
    keep_data: Option<bool>,
) -> Result<(), String> {
    lsp_state.kill_plugin(&id);
    plugin::uninstall_with_options(&state.plugins_dir, &id, keep_data.unwrap_or(false))
        .map_err(|error| error.to_string())?;
    reload_skills(&state);
    Ok(())
}

#[tauri::command]
fn set_plugin_enabled(
    state: State<'_, AppState>,
    lsp_state: State<'_, lsp::LspState>,
    id: String,
    enabled: bool,
) -> Result<PluginInfo, String> {
    if !enabled {
        lsp_state.kill_plugin(&id);
    }
    let plugin =
        plugin::set_enabled(&state.plugins_dir, &id, enabled).map_err(|error| error.to_string())?;
    reload_skills(&state);
    Ok(plugin.into())
}

#[tauri::command]
fn set_plugin_trusted(
    state: State<'_, AppState>,
    lsp_state: State<'_, lsp::LspState>,
    id: String,
    trusted: bool,
) -> Result<PluginInfo, String> {
    if !trusted {
        lsp_state.kill_plugin(&id);
    }
    plugin::set_trusted(&state.plugins_dir, &id, trusted)
        .map(Into::into)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn apply_plugin_scaffold(
    state: State<'_, AppState>,
    plugin_id: String,
    scaffold_id: String,
    cwd: String,
) -> Result<plugin::ScaffoldInstallResult, String> {
    plugin::apply_scaffold(
        &state.plugins_dir,
        &plugin_id,
        &scaffold_id,
        std::path::Path::new(&cwd),
    )
    .map_err(|error| error.to_string())
}

// ---- remote control (F10) --------------------------------------------------------------------

fn remote_endpoints(port: u16) -> Vec<codetwo_server::PairingEndpoint> {
    codetwo_server::pairing_endpoints(port)
}

/// The auth state to operate on: the running server's live one, or (when stopped) a fresh view of
/// the persisted device list so pairing management still works.
fn remote_auth(state: &AppState) -> Arc<codetwo_server::AuthState> {
    if let Some(h) = &*state.remote.lock().unwrap() {
        return h.auth.clone();
    }
    Arc::new(codetwo_server::AuthState::load(Some(
        state.remote_auth_path.clone(),
    )))
}

/// Turn on network access (idempotent): serve this app's live engine on all interfaces so a paired
/// device can drive the same sessions. Pairing links are minted separately (`remote_pairing_link`).
#[tauri::command]
async fn start_remote(
    state: State<'_, AppState>,
    port: Option<u16>,
) -> Result<RemoteStatus, String> {
    {
        let guard = state.remote.lock().unwrap();
        if let Some(h) = &*guard {
            return Ok(RemoteStatus {
                port: h.port,
                endpoints: remote_endpoints(h.port),
            });
        }
    }
    let port = port.unwrap_or(4599);
    let addr: std::net::SocketAddr = format!("0.0.0.0:{port}")
        .parse()
        .map_err(|e: std::net::AddrParseError| e.to_string())?;
    let auth = Arc::new(codetwo_server::AuthState::load(Some(
        state.remote_auth_path.clone(),
    )));
    let (local, task) = codetwo_server::bind_and_serve_with_canvas(
        state.engine.clone(),
        state.events.clone(),
        addr,
        auth.clone(),
        state.store.clone(),
        state.canvas_gate,
    )
    .await
    .map_err(|e| e.to_string())?;
    let status = RemoteStatus {
        port: local.port(),
        endpoints: remote_endpoints(local.port()),
    };
    *state.remote.lock().unwrap() = Some(RemoteHandle {
        port: local.port(),
        auth,
        task,
    });
    Ok(status)
}

/// Turn off network access. Paired devices stay on disk and reconnect next time it's turned on.
#[tauri::command]
fn stop_remote(state: State<'_, AppState>) {
    if let Some(h) = state.remote.lock().unwrap().take() {
        h.task.abort();
    }
}

#[tauri::command]
fn remote_status(state: State<'_, AppState>) -> Option<RemoteStatus> {
    state.remote.lock().unwrap().as_ref().map(|h| RemoteStatus {
        port: h.port,
        endpoints: remote_endpoints(h.port),
    })
}

/// Mint a fresh one-time pairing link for a validated advertised endpoint. The token is issued only
/// after endpoint validation, rides in the URL fragment, and is never sent in a request path.
#[tauri::command]
fn remote_pairing_link(
    state: State<'_, AppState>,
    ttl_secs: Option<u64>,
    endpoint_id: Option<String>,
) -> Result<RemotePairingLink, String> {
    let guard = state.remote.lock().unwrap();
    let h = guard.as_ref().ok_or("turn on network access first")?;
    let endpoints = remote_endpoints(h.port);
    let endpoint = codetwo_server::select_pairing_endpoint(&endpoints, endpoint_id.as_deref())?;
    let ttl = std::time::Duration::from_secs(
        ttl_secs.unwrap_or(codetwo_server::DEFAULT_PAIRING_TTL.as_secs()),
    );
    let token = h.auth.issue_pairing_token(ttl);
    let url = codetwo_server::pairing_url_for_endpoint(&endpoint.url, &token);
    let qr_svg = if endpoint.qr_shareable {
        codetwo_server::pairing_qr_svg(&url).unwrap_or_default()
    } else {
        String::new()
    };
    Ok(RemotePairingLink {
        endpoint_id: endpoint.id.clone(),
        url,
        token,
        expires_in: ttl.as_secs(),
        qr_svg,
    })
}

#[tauri::command]
fn remote_devices(state: State<'_, AppState>) -> Vec<codetwo_server::DeviceInfo> {
    remote_auth(&state).list_devices()
}

/// Revoke a paired device: its bearer (and any pending tickets) stop working immediately.
#[tauri::command]
fn remote_revoke_device(state: State<'_, AppState>, id: String) -> bool {
    remote_auth(&state).revoke_device(&id)
}

// ---- issues (F14) ----------------------------------------------------------------------------

#[tauri::command]
fn gh_available() -> bool {
    issues::gh_available()
}

#[tauri::command]
async fn list_github_issues(cwd: String, limit: Option<u32>) -> Result<Vec<Issue>, String> {
    issues::list_github(std::path::Path::new(&cwd), limit.unwrap_or(30))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn list_linear_issues(token: String, limit: Option<u32>) -> Result<Vec<Issue>, String> {
    issues::list_linear(&token, limit.unwrap_or(30))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn issue_context(issue: Issue) -> String {
    issue.to_context()
}

// ---- Canvas Input V1 -------------------------------------------------------------------------

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct CanvasAssetRefDto {
    id: String,
    mime_type: String,
    width: u32,
    height: u32,
    source_name: Option<String>,
}

impl From<CanvasAssetRef> for CanvasAssetRefDto {
    fn from(value: CanvasAssetRef) -> Self {
        Self {
            id: value.id,
            mime_type: value.mime_type,
            width: value.width,
            height: value.height,
            source_name: value.source_name,
        }
    }
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct CanvasAssetDto {
    id: String,
    mime_type: String,
    width: u32,
    height: u32,
    bytes: Vec<u8>,
}

impl From<CanvasStaticAsset> for CanvasAssetDto {
    fn from(value: CanvasStaticAsset) -> Self {
        Self {
            id: value.id,
            mime_type: value.mime_type,
            width: value.width,
            height: value.height,
            bytes: value.bytes,
        }
    }
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct CanvasEnvelopeDto {
    engine: String,
    engine_version: String,
    schema_version: u32,
    revision: u64,
    theme: codetwo_core::CanvasTheme,
    assets: Vec<CanvasAssetRefDto>,
    scene: serde_json::Value,
}

impl From<CanvasSceneEnvelope> for CanvasEnvelopeDto {
    fn from(value: CanvasSceneEnvelope) -> Self {
        Self {
            engine: value.engine,
            engine_version: value.engine_version,
            schema_version: value.schema_version,
            revision: value.revision,
            theme: value.theme,
            assets: value.assets.into_iter().map(Into::into).collect(),
            scene: value.scene,
        }
    }
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct CanvasObjectDto {
    id: String,
    kind: codetwo_core::CanvasObjectKind,
    original_text: String,
    bounds: codetwo_core::CanvasRect,
    layer: i64,
    arrow_start: Option<codetwo_core::CanvasPoint>,
    arrow_end: Option<codetwo_core::CanvasPoint>,
    asset_id: Option<String>,
}

impl From<CanvasObject> for CanvasObjectDto {
    fn from(value: CanvasObject) -> Self {
        Self {
            id: value.id,
            kind: value.kind,
            original_text: value.original_text,
            bounds: value.bounds,
            layer: value.layer,
            arrow_start: value.arrow_start,
            arrow_end: value.arrow_end,
            asset_id: value.asset_id,
        }
    }
}

#[derive(Serialize, Clone)]
struct CanvasManifestDto {
    objects: Vec<CanvasObjectDto>,
}

impl From<CanvasManifest> for CanvasManifestDto {
    fn from(value: CanvasManifest) -> Self {
        Self {
            objects: value.objects.into_iter().map(Into::into).collect(),
        }
    }
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct CanvasExportDto {
    id: String,
    kind: codetwo_core::CanvasExportKind,
    index: Option<u32>,
    mime_type: String,
    width: u32,
    height: u32,
    bytes: Vec<u8>,
}

impl From<CanvasExport> for CanvasExportDto {
    fn from(value: CanvasExport) -> Self {
        Self {
            id: value.id,
            kind: value.kind,
            index: value.index,
            mime_type: value.mime_type,
            width: value.width,
            height: value.height,
            bytes: value.bytes,
        }
    }
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct CanvasDraftDto {
    id: String,
    owner: String,
    revision: u64,
    title: String,
    theme: codetwo_core::CanvasTheme,
    envelope: CanvasEnvelopeDto,
    manifest: CanvasManifestDto,
    assets: Vec<CanvasAssetDto>,
    created_at: i64,
    updated_at: i64,
    tombstoned_at: Option<i64>,
}

impl From<CanvasDraft> for CanvasDraftDto {
    fn from(value: CanvasDraft) -> Self {
        Self {
            id: value.id,
            owner: value.owner,
            revision: value.revision,
            title: value.title,
            theme: value.theme,
            envelope: value.envelope.into(),
            manifest: value.manifest.into(),
            assets: value.assets.into_iter().map(Into::into).collect(),
            created_at: value.created_at,
            updated_at: value.updated_at,
            tombstoned_at: value.tombstoned_at,
        }
    }
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct CanvasSnapshotDto {
    id: String,
    revision: u64,
    title: String,
    theme: codetwo_core::CanvasTheme,
    created_at: i64,
    frozen_at: i64,
    object_count: usize,
    envelope: CanvasEnvelopeDto,
    manifest: CanvasManifestDto,
    assets: Vec<CanvasAssetDto>,
    summary: String,
    exports: Vec<CanvasExportDto>,
}

impl From<CanvasSnapshot> for CanvasSnapshotDto {
    fn from(value: CanvasSnapshot) -> Self {
        Self {
            id: value.id,
            revision: value.revision,
            title: value.title,
            theme: value.theme,
            created_at: value.created_at,
            frozen_at: value.frozen_at,
            object_count: value.object_count,
            envelope: value.envelope.into(),
            manifest: value.manifest.into(),
            assets: value.assets.into_iter().map(Into::into).collect(),
            summary: value.summary,
            exports: value.exports.into_iter().map(Into::into).collect(),
        }
    }
}

#[derive(serde::Deserialize)]
struct CanvasFreezeCommandInput {
    title: String,
    theme: codetwo_core::CanvasTheme,
    envelope: CanvasSceneEnvelope,
    manifest: CanvasManifest,
    #[serde(default)]
    assets: Vec<CanvasStaticAsset>,
    #[serde(default)]
    exports: Vec<CanvasExport>,
}

impl CanvasFreezeCommandInput {
    fn into_core(self, now: i64) -> CanvasFreezeInput {
        CanvasFreezeInput {
            title: self.title,
            theme: self.theme,
            envelope: self.envelope,
            manifest: self.manifest,
            assets: self.assets,
            exports: self.exports,
            now,
        }
    }
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct CanvasFeatureStateDto {
    feature: &'static str,
    enabled: bool,
    status: &'static str,
}

#[tauri::command]
fn canvas_feature_state(state: State<'_, AppState>) -> CanvasFeatureStateDto {
    CanvasFeatureStateDto {
        feature: codetwo_core::CANVAS_FEATURE_GATE,
        enabled: state.canvas_gate.is_enabled(),
        status: "not production-enabled",
    }
}

fn require_canvas(state: &AppState) -> Result<(), String> {
    state
        .canvas_gate
        .require()
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn canvas_create_draft(
    state: State<'_, AppState>,
    title: String,
) -> Result<CanvasDraftDto, String> {
    require_canvas(&state)?;
    state
        .store
        .create_canvas_draft_with_gate(state.canvas_gate, &state.canvas_owner, &title, now_millis())
        .map(CanvasDraftDto::from)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn canvas_get_draft(
    state: State<'_, AppState>,
    id: String,
) -> Result<Option<CanvasDraftDto>, String> {
    require_canvas(&state)?;
    state
        .store
        .get_canvas_draft(&id, &state.canvas_owner)
        .map(|draft| draft.map(CanvasDraftDto::from))
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn canvas_update_draft(
    state: State<'_, AppState>,
    id: String,
    expected_revision: u64,
    update: CanvasDraftUpdate,
) -> Result<CanvasDraftDto, String> {
    require_canvas(&state)?;
    state
        .store
        .update_canvas_draft_cas(
            &id,
            &state.canvas_owner,
            expected_revision,
            update,
            now_millis(),
        )
        .map(CanvasDraftDto::from)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn canvas_normalize_media(
    state: State<'_, AppState>,
    bytes: Vec<u8>,
    declared_mime: Option<String>,
) -> Result<CanvasAssetDto, String> {
    require_canvas(&state)?;
    codetwo_core::normalize_media(&bytes, declared_mime.as_deref())
        .map(CanvasAssetDto::from)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn canvas_freeze(
    state: State<'_, AppState>,
    id: String,
    expected_revision: u64,
    input: CanvasFreezeCommandInput,
) -> Result<CanvasSnapshotDto, String> {
    require_canvas(&state)?;
    let input = input.into_core(now_millis());
    state
        .store
        .freeze_canvas_with_gate(
            state.canvas_gate,
            &id,
            &state.canvas_owner,
            expected_revision,
            input,
        )
        .map(CanvasSnapshotDto::from)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn canvas_get_snapshot(
    state: State<'_, AppState>,
    id: String,
    revision: u64,
) -> Result<Option<CanvasSnapshotDto>, String> {
    require_canvas(&state)?;
    state
        .store
        .get_canvas_snapshot_frozen(&id, revision)
        .map(|snapshot| snapshot.map(CanvasSnapshotDto::from))
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn canvas_get_asset(
    state: State<'_, AppState>,
    id: String,
    revision: u64,
    asset_id: String,
) -> Result<Option<CanvasAssetDto>, String> {
    require_canvas(&state)?;
    let snapshot = state
        .store
        .get_canvas_snapshot_frozen(&id, revision)
        .map_err(|error| error.to_string())?;
    Ok(snapshot
        .and_then(|snapshot| {
            snapshot
                .assets
                .into_iter()
                .find(|asset| asset.id == asset_id)
        })
        .map(CanvasAssetDto::from))
}

#[tauri::command]
fn canvas_get_export(
    state: State<'_, AppState>,
    id: String,
    revision: u64,
    export_id: String,
) -> Result<Option<CanvasExportDto>, String> {
    require_canvas(&state)?;
    let snapshot = state
        .store
        .get_canvas_snapshot_frozen(&id, revision)
        .map_err(|error| error.to_string())?;
    Ok(snapshot
        .and_then(|snapshot| {
            snapshot
                .exports
                .into_iter()
                .find(|export| export.id == export_id)
        })
        .map(CanvasExportDto::from))
}

#[tauri::command]
fn canvas_duplicate(
    state: State<'_, AppState>,
    id: String,
    revision: u64,
) -> Result<CanvasDraftDto, String> {
    require_canvas(&state)?;
    state
        .store
        .duplicate_canvas_to_owner_with_gate(
            state.canvas_gate,
            &id,
            revision,
            &state.canvas_owner,
            now_millis(),
        )
        .map(CanvasDraftDto::from)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn canvas_tombstone(state: State<'_, AppState>, id: String) -> Result<(), String> {
    require_canvas(&state)?;
    state
        .store
        .tombstone_canvas(&id, &state.canvas_owner, now_millis())
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn canvas_restore(state: State<'_, AppState>, id: String) -> Result<(), String> {
    require_canvas(&state)?;
    state
        .store
        .restore_canvas(&id, &state.canvas_owner, now_millis())
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn canvas_purge(state: State<'_, AppState>, id: String) -> Result<bool, String> {
    require_canvas(&state)?;
    state
        .store
        .purge_canvas(&id, &state.canvas_owner, now_millis())
        .map_err(|error| error.to_string())
}

// ---- compiled-prompt preview (F13) -----------------------------------------------------------

#[derive(Serialize)]
struct CompiledPromptDto {
    prompt: String,
    mcp_servers: Vec<String>,
    agent_skills: Vec<String>,
    subagents: Vec<String>,
    files: Vec<String>,
    sessions: Vec<String>,
    unresolved: Vec<String>,
    #[serde(default)]
    canvases: Vec<CompiledCanvasDto>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CompiledCanvasDto {
    id: String,
    frozen_revision: u64,
    title: String,
    summary: String,
    exports: Vec<CanvasExportDto>,
}

/// Compile the current document into the prompt that would actually be sent — skills expanded,
/// project rules prepended, `@`-mentioned files and past chats inlined.
#[tauri::command]
fn compile_doc(
    state: State<'_, AppState>,
    doc: Vec<DocBlock>,
    cwd: Option<String>,
) -> Result<CompiledPromptDto, String> {
    let lib = state.engine.skills();
    let lib = lib.lock().unwrap();
    let path = cwd.as_deref().map(std::path::Path::new);
    // The preview resolves `@`-mentioned chats exactly like the real send in the engine does.
    let resolve =
        |id: &str| -> Option<String> { state.engine.referenced_session_context(id).ok().flatten() };
    let c = codetwo_core::skill::compile_with_canvas(
        &doc,
        &lib,
        path,
        Some(&resolve),
        state.canvas_gate,
        codetwo_core::CanvasProviderImageCapability::Unknown,
        &|id, revision| state.store.resolve_canvas_prompt_frozen(id, revision),
    )
    .map_err(|error| error.to_string())?;
    Ok(CompiledPromptDto {
        prompt: c.prompt,
        mcp_servers: c.mcp_servers.into_iter().map(|s| s.name).collect(),
        agent_skills: c.agent_skills,
        subagents: c.subagents,
        files: c.files,
        sessions: c.sessions,
        unresolved: c.unresolved,
        canvases: c
            .canvases
            .into_iter()
            .map(|canvas| CompiledCanvasDto {
                id: canvas.payload.id,
                frozen_revision: canvas.payload.revision,
                title: canvas.payload.title,
                summary: canvas.payload.summary,
                exports: canvas
                    .payload
                    .exports
                    .into_iter()
                    .map(CanvasExportDto::from)
                    .collect(),
            })
            .collect(),
    })
}

/// Workspace file search for `@`-mentions.
#[tauri::command]
fn list_files(cwd: String, query: String, limit: Option<usize>) -> Vec<String> {
    codetwo_core::workspace::list_files(std::path::Path::new(&cwd), &query, limit.unwrap_or(50))
}

fn resolve_known_workspace_root(cwd: &str, roots: &[String]) -> Result<PathBuf, String> {
    let requested = std::path::Path::new(cwd)
        .canonicalize()
        .map_err(|error| format!("can't open workspace {cwd}: {error}"))?;
    let authorized = roots.iter().any(|root| {
        let root = std::path::Path::new(root);
        // Project and session roots are canonicalized before they are persisted. Treat that
        // recorded spelling as the identity anchor: canonicalizing it again would follow a root
        // that was deleted and replaced by a symlink, authorizing the replacement target.
        std::fs::symlink_metadata(root).is_ok_and(|metadata| {
            metadata.is_dir() && !metadata.file_type().is_symlink() && root == requested
        })
    });
    if !authorized {
        return Err(
            "workspace content search is limited to project and session roots known to CodeTwo"
                .to_string(),
        );
    }
    Ok(requested)
}

/// Bounded workspace content search. This never follows symlinks or invokes a shell.
fn authorized_workspace_root(state: &AppState, cwd: &str) -> Result<PathBuf, String> {
    let mut roots = Vec::new();
    if let Some(store) = state.engine.store() {
        let projects = store
            .list_projects()
            .map_err(|error| format!("couldn't read known projects: {error}"))?;
        roots.extend(projects.into_iter().map(|project| project.path));
    }
    let sessions = state
        .engine
        .list_sessions()
        .map_err(|error| format!("couldn't read workspace sessions: {error}"))?;
    let archived = state
        .engine
        .list_archived()
        .map_err(|error| format!("couldn't read archived workspaces: {error}"))?;
    for session in sessions.into_iter().chain(archived) {
        roots.push(session.cwd);
        roots.extend(session.project_path);
        roots.extend(session.worktree_path);
    }
    resolve_known_workspace_root(cwd, &roots)
}

#[tauri::command]
async fn search_workspace_contents(
    state: State<'_, AppState>,
    window: WebviewWindow,
    cwd: String,
    query: String,
    options: WorkspaceSearchOptions,
    limit: Option<usize>,
    request_id: String,
) -> Result<WorkspaceSearchResult, String> {
    if request_id.is_empty() || request_id.len() > 128 || request_id.chars().any(char::is_control) {
        return Err("workspace search request id is invalid".to_string());
    }
    let root = authorized_workspace_root(&state, &cwd)?;
    let cancellation = WorkspaceSearchCancellation::new();
    let request_key = (window.label().to_string(), request_id.clone());
    {
        let mut searches = state.workspace_searches.lock().unwrap();
        if searches.contains_key(&request_key) {
            return Err("workspace search request id is already active".to_string());
        }
        if searches.len() >= 8 {
            return Err("too many workspace searches are active".to_string());
        }
        searches.insert(request_key.clone(), cancellation.clone());
    }

    let result = workspace_search::search_contents_with_cancellation(
        &root,
        &query,
        options,
        limit.unwrap_or(200),
        &cancellation,
    )
    .await;
    state
        .workspace_searches
        .lock()
        .unwrap()
        .remove(&request_key);
    result.map_err(|error| error.to_string())
}

#[tauri::command]
fn cancel_workspace_content_search(
    state: State<'_, AppState>,
    window: WebviewWindow,
    request_id: String,
) -> bool {
    let request_key = (window.label().to_string(), request_id);
    let cancellation = state
        .workspace_searches
        .lock()
        .unwrap()
        .remove(&request_key);
    if let Some(cancellation) = cancellation {
        cancellation.cancel();
        true
    } else {
        false
    }
}

/// One directory level, for the file tree in the side dock.
#[tauri::command]
fn list_dir(cwd: String, path: String) -> Result<Vec<DirEntry>, String> {
    codetwo_core::workspace::list_dir(std::path::Path::new(&cwd), &path).map_err(|e| e.to_string())
}

/// Create an empty file in the workspace. Errors rather than overwriting.
#[tauri::command]
fn create_file(cwd: String, path: String) -> Result<(), String> {
    codetwo_core::workspace::create_file(std::path::Path::new(&cwd), &path)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn create_dir(cwd: String, path: String) -> Result<(), String> {
    codetwo_core::workspace::create_dir(std::path::Path::new(&cwd), &path)
        .map_err(|e| e.to_string())
}

/// Read a file for the built-in viewer. Refuses binaries and anything oversized.
#[tauri::command]
fn read_text(cwd: String, path: String) -> Result<String, String> {
    codetwo_core::workspace::read_text(std::path::Path::new(&cwd), &path).map_err(|e| e.to_string())
}

/// Raw bytes for the image preview, over Tauri's binary IPC channel rather than as a JSON array —
/// a 2 MB PNG serialized as numbers is ~12 MB of text to parse.
#[tauri::command]
fn read_binary(cwd: String, path: String) -> Result<tauri::ipc::Response, String> {
    codetwo_core::workspace::read_binary(std::path::Path::new(&cwd), &path)
        .map(tauri::ipc::Response::new)
        .map_err(|e| e.to_string())
}

/// Read a durable tool artifact by opaque id. The storage path never crosses IPC.
#[tauri::command]
fn get_artifact(state: State<'_, AppState>, id: String) -> Result<tauri::ipc::Response, String> {
    ArtifactStore::from_store(state.store.clone())
        .ok_or_else(|| "artifact storage is unavailable".to_string())?
        .get(&id)
        .map(tauri::ipc::Response::new)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn save_artifact_as(
    state: State<'_, AppState>,
    id: String,
    destination: String,
) -> Result<(), String> {
    ArtifactStore::from_store(state.store.clone())
        .ok_or_else(|| "artifact storage is unavailable".to_string())?
        .save_as(&id, std::path::Path::new(&destination))
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn reveal_artifact(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let path = ArtifactStore::from_store(state.store.clone())
        .ok_or_else(|| "artifact storage is unavailable".to_string())?
        .path_for_reveal(&id)
        .map_err(|error| error.to_string())?;
    #[cfg(target_os = "macos")]
    let status = std::process::Command::new("/usr/bin/open")
        .arg("-R")
        .arg(path)
        .status();
    #[cfg(not(target_os = "macos"))]
    let status = std::process::Command::new("xdg-open")
        .arg(path.parent().unwrap_or(std::path::Path::new(".")))
        .status();
    status
        .map_err(|error| error.to_string())?
        .success()
        .then_some(())
        .ok_or_else(|| "could not reveal artifact".to_string())
}

#[tauri::command]
fn write_text(cwd: String, path: String, content: String) -> Result<(), String> {
    codetwo_core::workspace::write_text(std::path::Path::new(&cwd), &path, &content)
        .map_err(|e| e.to_string())
}

/// Rename or move — one call, because on a filesystem they're one operation.
#[tauri::command]
fn rename_path(cwd: String, from: String, to: String) -> Result<(), String> {
    codetwo_core::workspace::rename_path(std::path::Path::new(&cwd), &from, &to)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn copy_path(cwd: String, from: String, to: String) -> Result<(), String> {
    codetwo_core::workspace::copy_file(std::path::Path::new(&cwd), &from, &to)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_path(cwd: String, path: String) -> Result<(), String> {
    codetwo_core::workspace::delete_path(std::path::Path::new(&cwd), &path)
        .map_err(|e| e.to_string())
}

/// Newest text per session, for the rail's preview line.
#[tauri::command]
fn session_previews(state: State<'_, AppState>) -> Vec<(String, String)> {
    state
        .engine
        .store()
        .and_then(|s| s.last_texts().ok())
        .unwrap_or_default()
}

/// Search canonical conversation text. Core clamps both query and result sizes.
#[tauri::command]
fn search_sessions(
    state: State<'_, AppState>,
    query: String,
    limit: Option<usize>,
) -> Result<Vec<SessionSearchHit>, String> {
    state
        .engine
        .search_sessions(&query, limit.unwrap_or(12))
        .map_err(|error| error.to_string())
}

/// Project rule files detected in the workspace (AGENTS.md, .cursorrules, CLAUDE.md, …).
#[tauri::command]
fn list_rules(cwd: String) -> Vec<String> {
    codetwo_core::rules::load(std::path::Path::new(&cwd))
        .into_iter()
        .map(|r| r.path)
        .collect()
}

// ---- projects ----------------------------------------------------------------------------------

fn now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

#[tauri::command]
fn list_projects(state: State<'_, AppState>) -> Vec<Project> {
    state
        .engine
        .store()
        .and_then(|s| s.list_projects().ok())
        .unwrap_or_default()
}

/// Add a directory to the project list. The path is resolved first so that the same project can't
/// enter the list twice under two spellings of one directory.
#[tauri::command]
fn add_project(
    state: State<'_, AppState>,
    path: String,
    name: Option<String>,
) -> Result<String, String> {
    let resolved = std::path::Path::new(&path)
        .canonicalize()
        .map_err(|e| format!("can't open “{path}”: {e}"))?;
    if !resolved.is_dir() {
        return Err(format!("“{}” is not a directory", resolved.display()));
    }
    let path = resolved.to_string_lossy().into_owned();
    if let Some(store) = state.engine.store() {
        store
            .add_project(&path, name.as_deref(), now_millis())
            .map_err(|e| e.to_string())?;
    }
    Ok(path)
}

#[tauri::command]
fn open_project(state: State<'_, AppState>, path: String) {
    if let Some(store) = state.engine.store() {
        let _ = store.touch_project(&path, now_millis());
    }
}

#[tauri::command]
fn rename_project(state: State<'_, AppState>, path: String, name: String) -> Result<(), String> {
    match state.engine.store() {
        Some(store) => store
            .rename_project(&path, &name)
            .map_err(|e| e.to_string()),
        None => Ok(()),
    }
}

#[tauri::command]
fn set_project_worktree_mode(
    state: State<'_, AppState>,
    path: String,
    mode: Option<ProjectWorktreeMode>,
) -> Result<(), String> {
    match state.engine.store() {
        Some(store) => store
            .set_project_worktree_mode(&path, mode)
            .map_err(|e| e.to_string()),
        None => Ok(()),
    }
}

#[tauri::command]
fn remove_project(state: State<'_, AppState>, path: String) -> Result<(), String> {
    match state.engine.store() {
        Some(store) => store.remove_project(&path).map_err(|e| e.to_string()),
        None => Ok(()),
    }
}

// ---- session management (G5) -----------------------------------------------------------------

#[tauri::command]
fn rename_session(state: State<'_, AppState>, session: String, title: String) {
    state.engine.rename_session(&session, &title);
}

#[tauri::command]
fn archive_session(state: State<'_, AppState>, session: String, archived: bool) {
    state.engine.set_archived(&session, archived);
}

#[tauri::command]
fn pin_session(state: State<'_, AppState>, session: String, pinned: bool) {
    state.engine.set_pinned(&session, pinned);
}

#[tauri::command]
fn list_archived_sessions(state: State<'_, AppState>) -> Result<Vec<Session>, String> {
    state
        .engine
        .list_archived()
        .map_err(|error| error.to_string())
}

// ---- PR + commit message (G6) ------------------------------------------------------------------

#[tauri::command]
async fn git_source_control_info(cwd: String) -> Result<Option<SourceControlInfo>, String> {
    source_control::inspect(std::path::Path::new(&cwd))
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn git_create_pr(cwd: String, title: String, body: String) -> Result<String, String> {
    git::create_pr(std::path::Path::new(&cwd), &title, &body)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn git_suggest_commit(cwd: String) -> String {
    git::suggest_commit_message(std::path::Path::new(&cwd)).await
}

// ---- sandbox + project scripts (G7/G8) ---------------------------------------------------------

#[tauri::command]
async fn set_sandbox(
    state: State<'_, AppState>,
    session: String,
    sandbox: String,
) -> Result<(), String> {
    let policy = parse_sandbox(&sandbox)?;
    state
        .engine
        .submit(Op::SetSandbox {
            session,
            sandbox: policy,
        })
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn set_execution_policy(
    state: State<'_, AppState>,
    session: String,
    mode: String,
    sandbox: String,
    request_id: Option<String>,
) -> Result<(), String> {
    state
        .engine
        .submit(Op::SetExecutionPolicy {
            session,
            mode: parse_mode(&mode),
            sandbox: parse_sandbox(&sandbox)?,
            request_id,
        })
        .await
        .map_err(|e| e.to_string())
}

/// The working directory a new session should start in.
///
/// Not `"."`: a bundled app launched from Finder inherits `/` as its process directory, so the
/// obvious default would silently point every session at the filesystem root. Fall back to the
/// user's home when the process directory is unusable as a workspace.
#[tauri::command]
fn default_cwd() -> String {
    let cwd = std::env::current_dir().ok();
    let usable = cwd.filter(|p| p.parent().is_some());
    usable
        .or_else(dirs_home)
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_else(|| ".".to_string())
}

fn dirs_home() -> Option<std::path::PathBuf> {
    std::env::var_os("HOME").map(std::path::PathBuf::from)
}

/// Switch the session's model. The engine forwards it to the agent over ACP and answers with a
/// `models` event; a provider that doesn't implement the call reports an `error` event instead.
#[tauri::command]
async fn set_model(
    state: State<'_, AppState>,
    session: String,
    model: String,
) -> Result<(), String> {
    state
        .engine
        .submit(Op::SetModel { session, model })
        .await
        .map_err(|e| e.to_string())
}

/// Set an agent-reported session config option (model, reasoning effort, …). The engine forwards
/// it over ACP and answers with a `config_options` event, or an `error` event if the provider
/// doesn't implement the option.
#[tauri::command]
async fn set_config_option(
    state: State<'_, AppState>,
    session: String,
    config_id: String,
    value: String,
) -> Result<(), String> {
    state
        .engine
        .submit(Op::SetConfigOption {
            session,
            config_id,
            value,
        })
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn list_project_scripts(cwd: String) -> Vec<ProjectScript> {
    project::load(std::path::Path::new(&cwd)).scripts
}

// ---- usage tracking (G12) ----------------------------------------------------------------------

#[derive(Serialize)]
struct UsageReport {
    windows: Vec<codetwo_core::usage::UsageWindow>,
    by_source: Vec<(String, u64)>,
    transcripts: usize,
}

/// Scan local provider transcripts and report rolling usage windows (CodexBar-style).
#[tauri::command]
async fn usage_report() -> UsageReport {
    // A cold 30-day transcript walk can take noticeable time. Keep it off Tauri's command/UI
    // thread; subsequent requests normally hit the core's bounded per-file cache.
    let scan = tokio::task::spawn_blocking(codetwo_core::usage::scan_all_with_count)
        .await
        .unwrap_or_default();
    let now = codetwo_core::session::now_millis();
    let limits = codetwo_core::usage::Limits::from_env();
    UsageReport {
        windows: codetwo_core::usage::windows(&scan.records, now, &limits),
        by_source: codetwo_core::usage::by_source(&scan.records),
        transcripts: scan.transcripts,
    }
}

// ---- voice input (G11) -------------------------------------------------------------------------

/// Whether a local transcriber is configured/detected (the UI falls back to the webview's own
/// speech recognition when this is false).
#[tauri::command]
fn voice_available() -> bool {
    codetwo_core::voice::is_available()
}

/// Persist recorded audio bytes and transcribe them, returning the text.
#[tauri::command]
async fn transcribe_audio(bytes: Vec<u8>, ext: Option<String>) -> Result<String, String> {
    let path = codetwo_core::voice::save_audio(&bytes, ext.as_deref().unwrap_or("webm"))
        .map_err(|e| e.to_string())?;
    let result = codetwo_core::voice::transcribe(&path)
        .await
        .map_err(|e| e.to_string());
    let _ = std::fs::remove_file(&path);
    result
}

#[tauri::command]
async fn run_project_script(cwd: String, id: String) -> Result<String, String> {
    let cfg = project::load(std::path::Path::new(&cwd));
    let script = cfg
        .scripts
        .into_iter()
        .find(|s| s.id == id)
        .ok_or_else(|| format!("unknown script: {id}"))?;
    project::run_script(std::path::Path::new(&cwd), &script)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn new_session(
    state: State<'_, AppState>,
    provider: String,
    cwd: String,
    use_worktree: bool,
    worktree_base: Option<WorktreeBaseline>,
    worktree_base_sha: Option<String>,
    request_id: Option<String>,
    initial_policy: Option<ExecutionPolicy>,
) -> Result<(), String> {
    state
        .engine
        .submit(Op::NewSession {
            provider: parse_provider(&provider),
            cwd,
            use_worktree,
            worktree_base,
            worktree_base_sha,
            request_id,
            initial_policy,
        })
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn submit_prompt(
    state: State<'_, AppState>,
    session: String,
    doc: Vec<DocBlock>,
    request_id: Option<String>,
) -> Result<(), String> {
    state
        .engine
        .submit(Op::Prompt {
            session,
            doc,
            request_id,
        })
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn answer_permission(
    state: State<'_, AppState>,
    session: String,
    request_id: String,
    option_id: Option<String>,
) -> Result<(), String> {
    state
        .engine
        .submit(Op::AnswerPermission {
            session,
            request_id,
            option_id,
        })
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn set_permission_mode(
    state: State<'_, AppState>,
    session: String,
    mode: String,
) -> Result<(), String> {
    state
        .engine
        .submit(Op::SetPermissionMode {
            session,
            mode: parse_mode(&mode),
        })
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn cancel_turn(state: State<'_, AppState>, session: String) -> Result<(), String> {
    state
        .engine
        .submit(Op::Cancel { session })
        .await
        .map_err(|e| e.to_string())
}

// ---- terminal --------------------------------------------------------------------------------

#[tauri::command]
fn tmux_available() -> bool {
    codetwo_core::tmux::is_available()
}

/// Attach to the terminal `id`, creating it if it doesn't exist yet.
///
/// Attaching rather than always spawning is what lets a terminal outlive its renderer: remounting
/// the panel (a dock tab switch, a session change, an app restart) hands back the same emulator
/// plus a VT dump to replay into the new renderer, instead of a blank shell and an orphaned child.
#[tauri::command]
fn pty_spawn(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    cwd: Option<String>,
    rows: u16,
    cols: u16,
    scrollback: Option<usize>,
    tmux_session: Option<String>,
) -> Result<PtyAttach, String> {
    if let Some(existing) = state.ptys.lock().unwrap().get(&id) {
        // The renderer may have been resized while detached.
        let _ = existing.resize(rows, cols);
        let restore = existing.restore().map_err(|e| e.to_string())?;
        return Ok(PtyAttach {
            created: false,
            restore,
        });
    }

    let cfg = TerminalConfig {
        cwd,
        rows,
        cols,
        scrollback: scrollback.unwrap_or(10_000),
        tmux_session,
    };
    let (term, mut rx) = TerminalHandle::spawn(cfg).map_err(|e| e.to_string())?;

    let handle = app.clone();
    let stream_id = id.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(out) = rx.recv().await {
            let _ = match out {
                TerminalOutput::Data(data) => handle.emit(
                    "pty-output",
                    PtyOutput {
                        id: stream_id.clone(),
                        data,
                    },
                ),
                TerminalOutput::Title(title) => handle.emit(
                    "pty-title",
                    PtyTitle {
                        id: stream_id.clone(),
                        title,
                    },
                ),
            };
        }
        let _ = handle.emit("pty-exit", stream_id);
    });

    state.ptys.lock().unwrap().insert(id, term);
    Ok(PtyAttach {
        created: true,
        restore: String::new(),
    })
}

#[tauri::command]
fn pty_write(state: State<'_, AppState>, id: String, data: String) -> Result<(), String> {
    with_terminal(&state, &id, |t| t.write(data.as_bytes()))
}

#[tauri::command]
fn pty_resize(state: State<'_, AppState>, id: String, rows: u16, cols: u16) -> Result<(), String> {
    with_terminal(&state, &id, |t| t.resize(rows, cols))
}

/// Terminal contents as plain text, for handing to the agent. `all` includes scrollback; otherwise
/// just what's on screen.
#[tauri::command]
fn pty_dump(state: State<'_, AppState>, id: String, all: bool) -> Result<String, String> {
    let scope = if all { Scope::All } else { Scope::Screen };
    with_terminal(&state, &id, |t| t.text(scope))
}

/// Close a terminal for good. Unlike detaching, this kills the child process.
#[tauri::command]
fn pty_kill(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state.ptys.lock().unwrap().remove(&id);
    Ok(())
}

fn with_terminal<T>(
    state: &AppState,
    id: &str,
    f: impl FnOnce(&TerminalHandle) -> std::io::Result<T>,
) -> Result<T, String> {
    let map = state.ptys.lock().unwrap();
    let term = map.get(id).ok_or("no such terminal")?;
    f(term).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Launched from Finder we inherit a bare PATH, and every CLI we shell out to — the provider
    // adapters, the voice transcriber — looks missing. Do this before anything reads the
    // environment or spawns a child.
    codetwo_core::provider::augment_search_path();
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        // "Add a project" opens a real folder chooser. Typing an absolute path into a text field
        // is the kind of thing that makes a desktop app feel like a web form.
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir).ok();

            let browser_socket_path = data_dir.join("codetwo-browser.sock");
            let browser_master_key = uuid::Uuid::new_v4().to_string();
            app.manage(browser::BrowserState::load(&data_dir));
            let browser_handle = app.handle().clone();
            let broker_socket_path = browser_socket_path.clone();
            let broker_master_key = browser_master_key.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(error) =
                    browser::start_broker(browser_handle, broker_socket_path, broker_master_key)
                        .await
                {
                    eprintln!("CodeTwo Browser broker stopped: {error}");
                }
            });

            // One immutable startup snapshot. Updating ChatGPT/plugins/config requires a restart;
            // CodeTwo never mutates or continuously scans the external host.
            let codex_runtime = CodexRuntimeDiscovery::detect();
            let registry = registry_with_codex_runtime(&codex_runtime);
            let providers = registry
                .iter()
                .map(|provider: &Provider| ProviderInfo {
                    id: provider.id.as_str().to_string(),
                    display_name: provider.display_name.clone(),
                    available: provider.is_available(),
                    needs_node: provider.needs_node,
                    models: builtin_models(&provider.id),
                    capabilities: if provider.id == ProviderId::Codex {
                        codex_runtime.capability_projection(true)
                    } else {
                        Vec::new()
                    },
                })
                .collect::<Vec<_>>();

            let db_path = data_dir.join("codetwo.db");
            let store = Arc::new(Store::open(db_path.to_string_lossy().as_ref())?);
            if let Err(error) = store.purge_expired_canvases(now_millis()) {
                eprintln!("canvas tombstone cleanup failed: {error}");
            }
            let scene_artifacts = SceneArtifactStore::new(
                store.clone(),
                ArtifactStore::from_store(store.clone()).ok_or("artifact storage unavailable")?,
            );

            let skills_dir = data_dir.join("skills");
            let plugins_dir = data_dir.join("plugins");
            let mut skill_vec = builtin_skills();
            if let Ok(loaded) = SkillLibrary::load_dir(&skills_dir) {
                skill_vec.extend(loaded.all().cloned());
            }
            if let Ok(plugins) = plugin::load_dir(&plugins_dir) {
                skill_vec.extend(
                    plugins
                        .into_iter()
                        .filter(|plugin| plugin.enabled)
                        .flat_map(|plugin| plugin.components),
                );
            }
            // User-level harness skills only for now; project-level ones join on the first
            // `list_skills` call that carries a workspace.
            skill_vec.extend(harness::discover(None));
            let skills = SkillLibrary::new(skill_vec);

            let canvas_gate = CanvasFeatureGate::disabled();
            let canvas_owner = format!("desktop:{}", data_dir.to_string_lossy());
            let desktop_mcp = DesktopMcpConfig {
                command: std::env::current_exe()?.to_string_lossy().into_owned(),
                socket_path: browser_socket_path.to_string_lossy().into_owned(),
                master_key: browser_master_key,
            };
            let (engine, mut rx) = Engine::with_store_canvas_and_desktop_mcp(
                registry,
                skills,
                store.clone(),
                canvas_gate,
                desktop_mcp,
            );
            let engine = Arc::new(engine);

            // Fan the engine's events into a broadcast so both the frontend and the remote server
            // can subscribe (one shared engine, local + remote).
            let (events, _) = broadcast::channel::<Event>(1024);
            let ev_tx = events.clone();
            tauri::async_runtime::spawn(async move {
                while let Some(ev) = rx.recv().await {
                    let _ = ev_tx.send(ev);
                }
            });

            // Pump broadcast events to the frontend. A lag burst must not kill the pump — skip the
            // dropped events and keep going (the webview re-syncs from the store on next load).
            let handle = app.handle().clone();
            let mut sub = events.subscribe();
            tauri::async_runtime::spawn(async move {
                loop {
                    match sub.recv().await {
                        Ok(ev) => {
                            let _ = handle.emit("engine-event", ev);
                        }
                        Err(broadcast::error::RecvError::Lagged(n)) => {
                            eprintln!("engine-event pump lagged; dropped {n} events");
                        }
                        Err(broadcast::error::RecvError::Closed) => break,
                    }
                }
            });

            // Scene layer (R8): the engine compiles preambles and captures artifacts against the
            // builtin library until the first workspace-scoped `reload_scenes` refines it, and the
            // hook runtime consumes the same broadcast bus every other subscriber uses.
            let initial_scenes = Arc::new(SceneLibrary::builtin());
            engine.set_scenes(initial_scenes.clone());
            engine.set_scene_artifacts(scene_artifacts.clone());
            let submit_engine = engine.clone();
            let scene_runtime = Arc::new(SceneRuntime::new(
                initial_scenes.clone(),
                engine.skills(),
                store.clone(),
                scene_artifacts.clone(),
                Box::new(move |op| {
                    let engine = submit_engine.clone();
                    tauri::async_runtime::spawn(async move {
                        if let Err(error) = engine.submit(op).await {
                            eprintln!("hook prompt submission failed: {error}");
                        }
                    });
                }),
                events.clone(),
            ));
            let hook_runtime = scene_runtime.clone();
            let mut hook_sub = events.subscribe();
            tauri::async_runtime::spawn(async move {
                loop {
                    match hook_sub.recv().await {
                        Ok(ev) => hook_runtime.on_event(&ev),
                        Err(broadcast::error::RecvError::Lagged(n)) => {
                            eprintln!("scene hook pump lagged; dropped {n} events");
                        }
                        Err(broadcast::error::RecvError::Closed) => break,
                    }
                }
            });
            tauri::async_runtime::spawn(scene_runtime.clone().schedule_loop());

            let keymap_path = data_dir.join("keymap.json");
            let keymap = Keymap::load(&keymap_path);

            app.manage(AppState {
                engine,
                store,
                providers,
                canvas_gate,
                canvas_owner,
                events,
                skills_dir,
                plugins_dir,
                scenes: Mutex::new(initial_scenes),
                scene_artifacts,
                scene_runtime,
                skills_cwd: Mutex::new(None),
                keymap: Mutex::new(keymap),
                keymap_path,
                ptys: Mutex::new(HashMap::new()),
                workspace_searches: Mutex::new(HashMap::new()),
                remote: Mutex::new(None),
                remote_auth_path: data_dir.join("remote-devices.json"),
                browser_socket_path,
            });
            app.manage(lsp::LspState(Mutex::new(HashMap::new())));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_providers,
            list_sessions,
            list_worktree_baselines,
            list_skills,
            save_skill,
            delete_skill,
            get_transcript_page,
            memory_settings,
            set_memory_settings,
            list_memories,
            search_memories,
            memory_stats,
            add_memory,
            set_memory_pinned,
            set_memory_active,
            set_session_memory_policy,
            list_memory_receipts,
            git_status,
            git_checkpoint,
            git_checkpoints,
            git_diff,
            git_diff_since,
            git_diff_stat,
            git_stage_paths,
            git_unstage_paths,
            git_revert,
            git_commit,
            git_push,
            get_keymap,
            set_keymap,
            browser_context,
            open_devtools,
            market_catalog,
            market_install,
            list_plugins,
            github_import_plugin,
            read_plugin_marketplace,
            install_marketplace_plugin,
            uninstall_plugin,
            set_plugin_enabled,
            set_plugin_trusted,
            apply_plugin_scaffold,
            start_remote,
            stop_remote,
            remote_status,
            remote_pairing_link,
            remote_devices,
            remote_revoke_device,
            canvas_feature_state,
            canvas_create_draft,
            canvas_get_draft,
            canvas_update_draft,
            canvas_normalize_media,
            canvas_freeze,
            canvas_get_snapshot,
            canvas_get_asset,
            canvas_get_export,
            canvas_duplicate,
            canvas_tombstone,
            canvas_restore,
            canvas_purge,
            tmux_available,
            gh_available,
            list_github_issues,
            list_linear_issues,
            issue_context,
            compile_doc,
            list_files,
            search_workspace_contents,
            cancel_workspace_content_search,
            list_dir,
            create_file,
            create_dir,
            read_text,
            read_binary,
            get_artifact,
            save_artifact_as,
            reveal_artifact,
            write_text,
            rename_path,
            copy_path,
            delete_path,
            session_previews,
            search_sessions,
            list_rules,
            rename_session,
            archive_session,
            pin_session,
            list_archived_sessions,
            git_source_control_info,
            git_create_pr,
            git_suggest_commit,
            set_sandbox,
            set_execution_policy,
            list_project_scripts,
            run_project_script,
            voice_available,
            transcribe_audio,
            usage_report,
            new_session,
            submit_prompt,
            answer_permission,
            set_permission_mode,
            set_model,
            set_config_option,
            default_cwd,
            list_projects,
            add_project,
            open_project,
            rename_project,
            set_project_worktree_mode,
            remove_project,
            cancel_turn,
            pty_spawn,
            pty_write,
            pty_resize,
            pty_dump,
            pty_kill,
            browser::browser_open,
            browser::browser_bounds,
            browser::browser_navigate,
            browser::browser_history,
            browser::browser_reload,
            browser::browser_visible,
            browser::browser_zoom,
            browser::browser_devtools,
            browser::browser_annotate,
            browser::browser_annotations,
            browser::browser_annotation_count,
            browser::browser_annotations_clear,
            browser::browser_close,
            browser::browser_close_all,
            browser::browser_registry_snapshot,
            browser::browser_registry_create,
            browser::browser_take_control,
            browser::browser_permissions,
            browser::browser_revoke_permission,
            lsp::lsp_start,
            lsp::lsp_send,
            list_scenes,
            get_scene,
            list_pipelines,
            get_pipeline,
            apply_scene,
            scene_session_plan,
            set_session_scene,
            get_session_scene,
            session_diff_stat,
            list_scene_artifacts,
            scene_artifact_content,
            record_scene_artifact,
            pin_scene_artifact,
            dismiss_scene_banner,
            set_project_scheduling
        ])
        .build(tauri::generate_context!())
        .expect("error while running Code2")
        .run(|app, event| {
            // Language servers are real children with real index threads; leaving them orphaned
            // on quit is how a machine ends up with four rust-analyzers and no editor.
            if let tauri::RunEvent::Exit = event {
                if let Some(state) = app.try_state::<lsp::LspState>() {
                    state.kill_all();
                }
                if let Some(state) = app.try_state::<AppState>() {
                    let _ = std::fs::remove_file(&state.browser_socket_path);
                }
            }
        });
}

/// Entrypoint used by the exact internal MCP launch flag. This path does not initialize Tauri or
/// any user-facing window.
pub fn run_browser_mcp() -> Result<(), String> {
    browser_mcp::run()
}

#[cfg(test)]
mod tests {
    use super::{
        parse_sandbox, resolve_known_workspace_root, CanvasAssetDto, CanvasDraftDto,
        CanvasEnvelopeDto, CanvasExportDto, CanvasSnapshotDto, CompiledCanvasDto,
    };
    use codetwo_core::permission::{ExecutionPolicy, SandboxPolicy};
    use codetwo_core::{
        CanvasExport, CanvasExportKind, CanvasManifest, CanvasSceneEnvelope, CanvasSnapshot,
        CanvasStaticAsset,
    };

    #[test]
    fn workspace_search_accepts_only_an_exact_known_canonical_root() {
        let base = std::env::temp_dir().join(format!(
            "codetwo-desktop-search-root-{}-{}",
            std::process::id(),
            codetwo_core::session::now_millis()
        ));
        let project = base.join("project");
        let child = project.join("src");
        let sibling = base.join("sibling");
        std::fs::create_dir_all(&child).unwrap();
        std::fs::create_dir_all(&sibling).unwrap();
        let known = vec![project
            .canonicalize()
            .unwrap()
            .to_string_lossy()
            .into_owned()];

        assert_eq!(
            resolve_known_workspace_root(project.to_str().unwrap(), &known).unwrap(),
            project.canonicalize().unwrap()
        );
        assert!(resolve_known_workspace_root(child.to_str().unwrap(), &known).is_err());
        assert!(resolve_known_workspace_root(sibling.to_str().unwrap(), &known).is_err());

        let _ = std::fs::remove_dir_all(base);
    }

    #[cfg(unix)]
    #[test]
    fn workspace_search_rejects_a_known_root_replaced_by_a_symlink() {
        use std::os::unix::fs::symlink;

        let base = std::env::temp_dir().join(format!(
            "codetwo-desktop-search-symlink-{}-{}",
            std::process::id(),
            codetwo_core::session::now_millis()
        ));
        let project = base.join("project");
        let replacement = base.join("replacement");
        std::fs::create_dir_all(&project).unwrap();
        std::fs::create_dir_all(&replacement).unwrap();
        let known = vec![project
            .canonicalize()
            .unwrap()
            .to_string_lossy()
            .into_owned()];

        std::fs::remove_dir(&project).unwrap();
        symlink(&replacement, &project).unwrap();

        assert!(resolve_known_workspace_root(project.to_str().unwrap(), &known).is_err());
        assert!(resolve_known_workspace_root(replacement.to_str().unwrap(), &known).is_err());

        std::fs::remove_file(project).unwrap();
        let _ = std::fs::remove_dir_all(base);
    }

    #[test]
    fn workspace_search_accepts_a_linked_worktree_directory() {
        let base = std::env::temp_dir().join(format!(
            "codetwo-desktop-search-worktree-{}-{}",
            std::process::id(),
            codetwo_core::session::now_millis()
        ));
        let worktree = base.join("linked-worktree");
        std::fs::create_dir_all(&worktree).unwrap();
        std::fs::write(
            worktree.join(".git"),
            "gitdir: ../repo/.git/worktrees/linked\n",
        )
        .unwrap();
        let canonical = worktree.canonicalize().unwrap();
        let known = vec![canonical.to_string_lossy().into_owned()];

        assert_eq!(
            resolve_known_workspace_root(worktree.to_str().unwrap(), &known).unwrap(),
            canonical
        );

        let _ = std::fs::remove_dir_all(base);
    }

    #[test]
    fn sandbox_policy_parsing_rejects_unknown_values() {
        assert_eq!(parse_sandbox("read_only").unwrap(), SandboxPolicy::ReadOnly);
        assert_eq!(
            parse_sandbox("workspace_write").unwrap(),
            SandboxPolicy::WorkspaceWrite
        );
        assert_eq!(
            parse_sandbox("danger_full_access").unwrap(),
            SandboxPolicy::DangerFullAccess
        );
        assert_eq!(
            parse_sandbox("future_policy").unwrap_err(),
            "unknown sandbox policy: future_policy"
        );

        let initial_policy = serde_json::json!({
            "mode": "ask",
            "sandbox": "future_policy"
        });
        assert!(serde_json::from_value::<ExecutionPolicy>(initial_policy).is_err());
    }

    #[test]
    fn canvas_wire_dtos_preserve_opaque_scene_and_use_camel_case() {
        let scene = serde_json::json!({
            "elements": [],
            "appState": { "activeTool": "selection" },
            "customOpaque": { "assetRef": "opaque-value" }
        });
        let envelope = CanvasSceneEnvelope::new(2, codetwo_core::CanvasTheme::Dark, scene.clone());
        let dto = CanvasEnvelopeDto::from(envelope);
        let value = serde_json::to_value(dto).unwrap();
        assert_eq!(
            value["engineVersion"],
            codetwo_core::EXCALIDRAW_ENGINE_VERSION
        );
        assert!(value.get("engine_version").is_none());
        assert_eq!(value["scene"], scene);

        let asset = CanvasStaticAsset {
            id: "asset-opaque".into(),
            mime_type: "image/png".into(),
            width: 1,
            height: 1,
            bytes: vec![1, 2, 3],
        };
        let asset_value = serde_json::to_value(CanvasAssetDto::from(asset)).unwrap();
        assert_eq!(asset_value["mimeType"], "image/png");
        assert!(asset_value.get("mime_type").is_none());
        assert_eq!(asset_value["bytes"], serde_json::json!([1, 2, 3]));

        let export = CanvasExport {
            id: "overview".into(),
            kind: CanvasExportKind::Overview,
            index: None,
            mime_type: "image/png".into(),
            width: 1,
            height: 1,
            bytes: vec![4, 5, 6],
        };
        let export_value = serde_json::to_value(CanvasExportDto::from(export.clone())).unwrap();
        assert_eq!(export_value["mimeType"], "image/png");
        assert!(export_value.get("mime_type").is_none());

        let manifest = CanvasManifest::new(Vec::new());
        let draft = codetwo_core::CanvasDraft {
            id: "canvas-1".into(),
            owner: "desktop:test".into(),
            revision: 2,
            title: "Board".into(),
            theme: codetwo_core::CanvasTheme::Dark,
            envelope: CanvasSceneEnvelope::new(2, codetwo_core::CanvasTheme::Dark, scene.clone()),
            manifest: manifest.clone(),
            assets: Vec::new(),
            created_at: 10,
            updated_at: 20,
            tombstoned_at: None,
        };
        let draft_value = serde_json::to_value(CanvasDraftDto::from(draft)).unwrap();
        assert_eq!(draft_value["createdAt"], 10);
        assert_eq!(draft_value["updatedAt"], 20);
        assert!(draft_value.get("created_at").is_none());

        let snapshot = CanvasSnapshot {
            id: "canvas-1".into(),
            revision: 2,
            title: "Board".into(),
            theme: codetwo_core::CanvasTheme::Dark,
            created_at: 10,
            frozen_at: 30,
            object_count: 0,
            envelope: CanvasSceneEnvelope::new(2, codetwo_core::CanvasTheme::Dark, scene),
            manifest,
            assets: Vec::new(),
            summary: String::new(),
            exports: vec![export.clone()],
        };
        let snapshot_value = serde_json::to_value(CanvasSnapshotDto::from(snapshot)).unwrap();
        assert_eq!(snapshot_value["frozenAt"], 30);
        assert_eq!(snapshot_value["exports"][0]["mimeType"], "image/png");
        assert!(snapshot_value.get("frozen_at").is_none());

        let compiled_value = serde_json::to_value(CompiledCanvasDto {
            id: "canvas-1".into(),
            frozen_revision: 2,
            title: "Board".into(),
            summary: "object_count=0".into(),
            exports: vec![CanvasExportDto::from(export)],
        })
        .unwrap();
        assert_eq!(compiled_value["frozenRevision"], 2);
        assert_eq!(compiled_value["exports"][0]["mimeType"], "image/png");
    }
}
