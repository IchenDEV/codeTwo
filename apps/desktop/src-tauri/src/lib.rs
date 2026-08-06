//! Code2 desktop bridge: a thin Tauri layer over `codetwo-core`.
//!
//! The core `Engine` is managed in Tauri state. Frontends push `Op`s through commands and receive
//! `Event`s streamed over the `engine-event` channel. Terminals live in the core as real emulators
//! (`codetwo_core::term`) keyed by a stable id; the frontend attaches to one and streams it over
//! `pty-output`.

mod browser;
mod lsp;

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use codetwo_core::browser::Annotation;
use codetwo_core::git::{self, Checkpoint, GitStatus};
use codetwo_core::github_skills;
use codetwo_core::issues::{self, Issue};
use codetwo_core::keymap::{Action as KeyAction, Keymap};
use codetwo_core::event::ModelChoice;
use codetwo_core::models::builtin_models;
use codetwo_core::permission::{PermissionMode, SandboxPolicy};
use codetwo_core::plugin::{self, InstalledPlugin, PluginCounts, PluginScaffold};
use codetwo_core::project::{self, ProjectScript};
use codetwo_core::provider::{default_registry, Provider, ProviderId};
use codetwo_core::harness;
use codetwo_core::skill::{builtin_skills, DocBlock, Skill, SkillKind, SkillLibrary};
use codetwo_core::store::Project;
use codetwo_core::workspace::DirEntry;
use codetwo_core::term::{Scope, TerminalConfig, TerminalHandle, TerminalOutput};
use codetwo_core::{
    Engine, Event, MemoryAccess, MemoryReceipt, MemoryRecord, MemorySettings, MemoryStats, Op, Part,
    Role, Session, Store,
};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::broadcast;

#[derive(Serialize, Clone)]
struct RemoteEndpoint {
    label: String,
    url: String,
}

#[derive(Serialize, Clone)]
struct RemoteStatus {
    port: u16,
    endpoints: Vec<RemoteEndpoint>,
}

#[derive(Serialize)]
struct RemotePairingLink {
    url: String,
    token: String,
    expires_in: u64,
    qr_svg: String,
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
    events: broadcast::Sender<Event>,
    skills_dir: PathBuf,
    plugins_dir: PathBuf,
    /// Last workspace the frontend listed skills for; harness skill discovery scans its
    /// project-level roots (`.claude/skills` …) so a save/delete reload keeps them.
    skills_cwd: Mutex<Option<PathBuf>>,
    keymap: Mutex<Keymap>,
    keymap_path: PathBuf,
    ptys: Mutex<HashMap<String, TerminalHandle>>,
    remote: Mutex<Option<RemoteHandle>>,
    /// Where paired remote devices persist (survives app restarts and server stop/start).
    remote_auth_path: PathBuf,
}

/// Rebuild the live skill library: built-ins + `<data>/skills/*.json` + skills auto-discovered
/// from the harness directories (~/.claude/skills, .codex/skills, …) of the current workspace.
fn reload_skills(state: &AppState) {
    let mut v = builtin_skills();
    if let Ok(loaded) = SkillLibrary::load_dir(&state.skills_dir) {
        v.extend(loaded.all().cloned());
    }
    if let Ok(plugins) = plugin::load_dir(&state.plugins_dir) {
        v.extend(plugins.into_iter().flat_map(|plugin| plugin.components));
    }
    let cwd = state.skills_cwd.lock().unwrap().clone();
    v.extend(harness::discover(cwd.as_deref()));
    state.engine.set_skills(SkillLibrary::new(v));
}

#[derive(Serialize)]
struct ProviderInfo {
    id: String,
    display_name: String,
    available: bool,
    needs_node: bool,
    /// The models we offer for this provider when it reports none of its own over ACP. Empty only
    /// for providers we ship no list for.
    models: Vec<ModelChoice>,
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
    counts: PluginCounts,
    scaffolds: Vec<PluginScaffoldInfo>,
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
            counts: plugin.counts,
            scaffolds: plugin.scaffolds.into_iter().map(Into::into).collect(),
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
fn list_providers() -> Vec<ProviderInfo> {
    default_registry()
        .into_iter()
        .map(|p: Provider| ProviderInfo {
            id: p.id.as_str().to_string(),
            display_name: p.display_name.clone(),
            available: p.is_available(),
            needs_node: p.needs_node,
            models: builtin_models(&p.id),
        })
        .collect()
}

#[tauri::command]
fn list_sessions(state: State<'_, AppState>) -> Vec<Session> {
    state.engine.list_sessions()
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
        .map(|s| SkillInfo {
            id: s.id.clone(),
            name: s.name.clone(),
            description: s.description.clone(),
            icon: s.icon.clone(),
            kind: kind_str(s.kind()),
            source: s.source.clone().or_else(|| harness::source_label(&s.id).map(str::to_string)),
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

#[tauri::command]
fn get_transcript(state: State<'_, AppState>, session: String) -> Vec<(i64, Role, Part)> {
    state.engine.transcript_with_seq(&session)
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

// ---- git quick-view (F1) ---------------------------------------------------------------------

#[tauri::command]
async fn git_status(cwd: String) -> GitStatus {
    git::status(std::path::Path::new(&cwd)).await
}

// checkpoints, diffs, commit/push (F7/F8)

#[tauri::command]
async fn git_checkpoint(cwd: String, message: String) -> Result<Checkpoint, String> {
    git::checkpoint(std::path::Path::new(&cwd), &message).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn git_checkpoints(cwd: String) -> Vec<Checkpoint> {
    git::list_checkpoints(std::path::Path::new(&cwd)).await
}

#[tauri::command]
async fn git_diff(cwd: String, path: Option<String>) -> Result<String, String> {
    git::diff(std::path::Path::new(&cwd), path.as_deref()).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn git_diff_since(cwd: String, commit: String) -> Result<String, String> {
    git::diff_since(std::path::Path::new(&cwd), &commit).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn git_revert(cwd: String, commit: String) -> Result<(), String> {
    git::revert_to(std::path::Path::new(&cwd), &commit).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn git_commit(cwd: String, message: String) -> Result<String, String> {
    git::commit(std::path::Path::new(&cwd), &message, true).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn git_push(cwd: String) -> Result<String, String> {
    git::push(std::path::Path::new(&cwd)).await.map_err(|e| e.to_string())
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
    repository: String,
) -> Result<GitHubImportResult, String> {
    let checkout = github_skills::checkout(&repository).await.map_err(|error| error.to_string())?;
    let bundle = plugin::from_github(&checkout).map_err(|error| error.to_string())?;
    let installed = plugin::install(&state.plugins_dir, bundle).map_err(|error| error.to_string())?;
    reload_skills(&state);
    Ok(GitHubImportResult { plugin: installed.into() })
}

#[tauri::command]
fn uninstall_plugin(state: State<'_, AppState>, id: String) -> Result<(), String> {
    plugin::uninstall(&state.plugins_dir, &id).map_err(|error| error.to_string())?;
    reload_skills(&state);
    Ok(())
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

fn remote_endpoints(port: u16) -> Vec<RemoteEndpoint> {
    let mut v = Vec::new();
    if let Some(ip) = codetwo_server::local_ip() {
        v.push(RemoteEndpoint { label: "LAN".into(), url: format!("http://{ip}:{port}/") });
    }
    v.push(RemoteEndpoint { label: "Loopback".into(), url: format!("http://127.0.0.1:{port}/") });
    v
}

/// The auth state to operate on: the running server's live one, or (when stopped) a fresh view of
/// the persisted device list so pairing management still works.
fn remote_auth(state: &AppState) -> Arc<codetwo_server::AuthState> {
    if let Some(h) = &*state.remote.lock().unwrap() {
        return h.auth.clone();
    }
    Arc::new(codetwo_server::AuthState::load(Some(state.remote_auth_path.clone())))
}

/// Turn on network access (idempotent): serve this app's live engine on all interfaces so a paired
/// device can drive the same sessions. Pairing links are minted separately (`remote_pairing_link`).
#[tauri::command]
async fn start_remote(state: State<'_, AppState>, port: Option<u16>) -> Result<RemoteStatus, String> {
    {
        let guard = state.remote.lock().unwrap();
        if let Some(h) = &*guard {
            return Ok(RemoteStatus { port: h.port, endpoints: remote_endpoints(h.port) });
        }
    }
    let port = port.unwrap_or(4599);
    let addr: std::net::SocketAddr =
        format!("0.0.0.0:{port}").parse().map_err(|e: std::net::AddrParseError| e.to_string())?;
    let auth = Arc::new(codetwo_server::AuthState::load(Some(state.remote_auth_path.clone())));
    let (local, task) =
        codetwo_server::bind_and_serve(state.engine.clone(), state.events.clone(), addr, auth.clone())
            .await
            .map_err(|e| e.to_string())?;
    let status = RemoteStatus { port: local.port(), endpoints: remote_endpoints(local.port()) };
    *state.remote.lock().unwrap() = Some(RemoteHandle { port: local.port(), auth, task });
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
    state
        .remote
        .lock()
        .unwrap()
        .as_ref()
        .map(|h| RemoteStatus { port: h.port, endpoints: remote_endpoints(h.port) })
}

/// Mint a fresh one-time pairing link (URL with the token in the fragment + QR SVG). Each call is a
/// new token; old links keep working until they expire or get used.
#[tauri::command]
fn remote_pairing_link(state: State<'_, AppState>, ttl_secs: Option<u64>) -> Result<RemotePairingLink, String> {
    let guard = state.remote.lock().unwrap();
    let h = guard.as_ref().ok_or("turn on network access first")?;
    let ttl = std::time::Duration::from_secs(ttl_secs.unwrap_or(codetwo_server::DEFAULT_PAIRING_TTL.as_secs()));
    let token = h.auth.issue_pairing_token(ttl);
    let url = codetwo_server::pairing_url(h.port, &token);
    let qr_svg = codetwo_server::pairing_qr_svg(&url).unwrap_or_default();
    Ok(RemotePairingLink { url, token, expires_in: ttl.as_secs(), qr_svg })
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
    issues::list_linear(&token, limit.unwrap_or(30)).await.map_err(|e| e.to_string())
}

#[tauri::command]
fn issue_context(issue: Issue) -> String {
    issue.to_context()
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
}

/// Compile the current document into the prompt that would actually be sent — skills expanded,
/// project rules prepended, `@`-mentioned files and past chats inlined.
#[tauri::command]
fn compile_doc(state: State<'_, AppState>, doc: Vec<DocBlock>, cwd: Option<String>) -> CompiledPromptDto {
    let lib = state.engine.skills();
    let lib = lib.lock().unwrap();
    let path = cwd.as_deref().map(std::path::Path::new);
    // The preview resolves `@`-mentioned chats exactly like the real send in the engine does.
    let store = state.engine.store();
    let resolve = |id: &str| -> Option<String> {
        let store = store.as_ref()?;
        let sess = store.get_session(id).ok().flatten()?;
        let transcript = store.transcript(id).ok()?;
        Some(codetwo_core::session::transcript_context(&sess.title, &transcript))
    };
    let c = codetwo_core::skill::compile_with_sessions(&doc, &lib, path, Some(&resolve));
    CompiledPromptDto {
        prompt: c.prompt,
        mcp_servers: c.mcp_servers.into_iter().map(|s| s.name).collect(),
        agent_skills: c.agent_skills,
        subagents: c.subagents,
        files: c.files,
        sessions: c.sessions,
        unresolved: c.unresolved,
    }
}

/// Workspace file search for `@`-mentions.
#[tauri::command]
fn list_files(cwd: String, query: String, limit: Option<usize>) -> Vec<String> {
    codetwo_core::workspace::list_files(std::path::Path::new(&cwd), &query, limit.unwrap_or(50))
}

/// One directory level, for the file tree in the side dock.
#[tauri::command]
fn list_dir(cwd: String, path: String) -> Result<Vec<DirEntry>, String> {
    codetwo_core::workspace::list_dir(std::path::Path::new(&cwd), &path).map_err(|e| e.to_string())
}

/// Create an empty file in the workspace. Errors rather than overwriting.
#[tauri::command]
fn create_file(cwd: String, path: String) -> Result<(), String> {
    codetwo_core::workspace::create_file(std::path::Path::new(&cwd), &path).map_err(|e| e.to_string())
}

#[tauri::command]
fn create_dir(cwd: String, path: String) -> Result<(), String> {
    codetwo_core::workspace::create_dir(std::path::Path::new(&cwd), &path).map_err(|e| e.to_string())
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
    codetwo_core::workspace::delete_path(std::path::Path::new(&cwd), &path).map_err(|e| e.to_string())
}

/// Newest text per session, for the rail's preview line.
#[tauri::command]
fn session_previews(state: State<'_, AppState>) -> Vec<(String, String)> {
    state.engine.store().and_then(|s| s.last_texts().ok()).unwrap_or_default()
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
    state.engine.store().and_then(|s| s.list_projects().ok()).unwrap_or_default()
}

/// Add a directory to the project list. The path is resolved first so that the same project can't
/// enter the list twice under two spellings of one directory.
#[tauri::command]
fn add_project(state: State<'_, AppState>, path: String, name: Option<String>) -> Result<String, String> {
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
        Some(store) => store.rename_project(&path, &name).map_err(|e| e.to_string()),
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
fn list_archived_sessions(state: State<'_, AppState>) -> Vec<Session> {
    state.engine.list_archived()
}

// ---- PR + commit message (G6) ------------------------------------------------------------------

#[tauri::command]
async fn git_create_pr(cwd: String, title: String, body: String) -> Result<String, String> {
    git::create_pr(std::path::Path::new(&cwd), &title, &body).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn git_suggest_commit(cwd: String) -> String {
    git::suggest_commit_message(std::path::Path::new(&cwd)).await
}

// ---- sandbox + project scripts (G7/G8) ---------------------------------------------------------

#[tauri::command]
async fn set_sandbox(state: State<'_, AppState>, session: String, sandbox: String) -> Result<(), String> {
    let policy = match sandbox.as_str() {
        "read_only" => SandboxPolicy::ReadOnly,
        "danger_full_access" => SandboxPolicy::DangerFullAccess,
        _ => SandboxPolicy::WorkspaceWrite,
    };
    state
        .engine
        .submit(Op::SetSandbox { session, sandbox: policy })
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
async fn set_model(state: State<'_, AppState>, session: String, model: String) -> Result<(), String> {
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
        .submit(Op::SetConfigOption { session, config_id, value })
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
fn usage_report() -> UsageReport {
    let records = codetwo_core::usage::scan_all();
    let now = codetwo_core::session::now_millis();
    let limits = codetwo_core::usage::Limits::from_env();
    UsageReport {
        windows: codetwo_core::usage::windows(&records, now, &limits),
        by_source: codetwo_core::usage::by_source(&records),
        transcripts: records.len(),
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
    let result = codetwo_core::voice::transcribe(&path).await.map_err(|e| e.to_string());
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
    project::run_script(std::path::Path::new(&cwd), &script).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn new_session(
    state: State<'_, AppState>,
    provider: String,
    cwd: String,
    use_worktree: bool,
) -> Result<(), String> {
    state
        .engine
        .submit(Op::NewSession { provider: parse_provider(&provider), cwd, use_worktree })
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn submit_prompt(
    state: State<'_, AppState>,
    session: String,
    doc: Vec<DocBlock>,
) -> Result<(), String> {
    state.engine.submit(Op::Prompt { session, doc }).await.map_err(|e| e.to_string())
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
        .submit(Op::AnswerPermission { session, request_id, option_id })
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
        .submit(Op::SetPermissionMode { session, mode: parse_mode(&mode) })
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn cancel_turn(state: State<'_, AppState>, session: String) -> Result<(), String> {
    state.engine.submit(Op::Cancel { session }).await.map_err(|e| e.to_string())
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
        return Ok(PtyAttach { created: false, restore });
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
                TerminalOutput::Data(data) => {
                    handle.emit("pty-output", PtyOutput { id: stream_id.clone(), data })
                }
                TerminalOutput::Title(title) => {
                    handle.emit("pty-title", PtyTitle { id: stream_id.clone(), title })
                }
            };
        }
        let _ = handle.emit("pty-exit", stream_id);
    });

    state.ptys.lock().unwrap().insert(id, term);
    Ok(PtyAttach { created: true, restore: String::new() })
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

            let db_path = data_dir.join("codetwo.db");
            let store = Arc::new(Store::open(db_path.to_string_lossy().as_ref())?);

            let skills_dir = data_dir.join("skills");
            let plugins_dir = data_dir.join("plugins");
            let mut skill_vec = builtin_skills();
            if let Ok(loaded) = SkillLibrary::load_dir(&skills_dir) {
                skill_vec.extend(loaded.all().cloned());
            }
            if let Ok(plugins) = plugin::load_dir(&plugins_dir) {
                skill_vec.extend(plugins.into_iter().flat_map(|plugin| plugin.components));
            }
            // User-level harness skills only for now; project-level ones join on the first
            // `list_skills` call that carries a workspace.
            skill_vec.extend(harness::discover(None));
            let skills = SkillLibrary::new(skill_vec);

            let (engine, mut rx) = Engine::with_store(default_registry(), skills, store);
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

            let keymap_path = data_dir.join("keymap.json");
            let keymap = Keymap::load(&keymap_path);

            app.manage(AppState {
                engine,
                events,
                skills_dir,
                plugins_dir,
                skills_cwd: Mutex::new(None),
                keymap: Mutex::new(keymap),
                keymap_path,
                ptys: Mutex::new(HashMap::new()),
                remote: Mutex::new(None),
                remote_auth_path: data_dir.join("remote-devices.json"),
            });
            app.manage(lsp::LspState(Mutex::new(HashMap::new())));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_providers,
            list_sessions,
            list_skills,
            save_skill,
            delete_skill,
            get_transcript,
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
            uninstall_plugin,
            apply_plugin_scaffold,
            start_remote,
            stop_remote,
            remote_status,
            remote_pairing_link,
            remote_devices,
            remote_revoke_device,
            tmux_available,
            gh_available,
            list_github_issues,
            list_linear_issues,
            issue_context,
            compile_doc,
            list_files,
            list_dir,
            create_file,
            create_dir,
            read_text,
            read_binary,
            write_text,
            rename_path,
            copy_path,
            delete_path,
            session_previews,
            list_rules,
            rename_session,
            archive_session,
            list_archived_sessions,
            git_create_pr,
            git_suggest_commit,
            set_sandbox,
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
            lsp::lsp_start,
            lsp::lsp_send
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
            }
        });
}
