//! codeTwo desktop bridge: a thin Tauri layer over `codetwo-core`.
//!
//! The core `Engine` is managed in Tauri state. Frontends push `Op`s through commands and receive
//! `Event`s streamed over the `engine-event` channel. Terminal I/O uses the core PTY manager,
//! streamed over `pty-output`.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use codetwo_core::browser::Annotation;
use codetwo_core::git::{self, Checkpoint, GitStatus};
use codetwo_core::keymap::{Action as KeyAction, Keymap};
use codetwo_core::permission::PermissionMode;
use codetwo_core::provider::{default_registry, Provider, ProviderId};
use codetwo_core::skill::{builtin_skills, DocBlock, Skill, SkillKind, SkillLibrary};
use codetwo_core::{Engine, Op, Part, PtySession, Role, Session, Store};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

struct AppState {
    engine: Engine,
    skills_dir: PathBuf,
    keymap: Mutex<Keymap>,
    keymap_path: PathBuf,
    ptys: Mutex<HashMap<u32, PtySession>>,
}

/// Rebuild the live skill library from built-ins + `<data>/skills/*.json` after an add/remove.
fn reload_skills(state: &AppState) {
    let mut v = builtin_skills();
    if let Ok(loaded) = SkillLibrary::load_dir(&state.skills_dir) {
        v.extend(loaded.all().cloned());
    }
    state.engine.set_skills(SkillLibrary::new(v));
}

#[derive(Serialize)]
struct ProviderInfo {
    id: String,
    display_name: String,
    available: bool,
    needs_node: bool,
}

#[derive(Serialize)]
struct SkillInfo {
    id: String,
    name: String,
    description: String,
    icon: Option<String>,
    kind: String,
}

#[derive(Serialize, Clone)]
struct PtyOutput {
    id: u32,
    data: String,
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

fn parse_provider(s: &str) -> ProviderId {
    match s {
        "claude_code" => ProviderId::ClaudeCode,
        "codex" => ProviderId::Codex,
        "grok" => ProviderId::Grok,
        "cursor" => ProviderId::Cursor,
        "opencode" => ProviderId::OpenCode,
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
        })
        .collect()
}

#[tauri::command]
fn list_sessions(state: State<'_, AppState>) -> Vec<Session> {
    state.engine.list_sessions()
}

#[tauri::command]
fn list_skills(state: State<'_, AppState>) -> Vec<SkillInfo> {
    let lib = state.engine.skills();
    let lib = lib.lock().unwrap();
    lib.all()
        .map(|s| SkillInfo {
            id: s.id.clone(),
            name: s.name.clone(),
            description: s.description.clone(),
            icon: s.icon.clone(),
            kind: kind_str(s.kind()),
        })
        .collect()
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
fn get_transcript(state: State<'_, AppState>, session: String) -> Vec<(Role, Part)> {
    state.engine.transcript(&session)
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

// ---- skill market (F5) -----------------------------------------------------------------------

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
fn pty_spawn(
    app: AppHandle,
    state: State<'_, AppState>,
    id: u32,
    cwd: Option<String>,
    rows: u16,
    cols: u16,
) -> Result<(), String> {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "sh".into());
    let (session, mut rx) =
        PtySession::spawn(&shell, &["-l"], cwd.as_deref(), rows, cols).map_err(|e| e.to_string())?;

    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(chunk) = rx.recv().await {
            let data = String::from_utf8_lossy(&chunk).to_string();
            let _ = handle.emit("pty-output", PtyOutput { id, data });
        }
        let _ = handle.emit("pty-exit", id);
    });

    state.ptys.lock().unwrap().insert(id, session);
    Ok(())
}

#[tauri::command]
fn pty_write(state: State<'_, AppState>, id: u32, data: String) -> Result<(), String> {
    let mut map = state.ptys.lock().unwrap();
    match map.get_mut(&id) {
        Some(s) => s.write(data.as_bytes()).map_err(|e| e.to_string()),
        None => Err("no such terminal".into()),
    }
}

#[tauri::command]
fn pty_resize(state: State<'_, AppState>, id: u32, rows: u16, cols: u16) -> Result<(), String> {
    let map = state.ptys.lock().unwrap();
    match map.get(&id) {
        Some(s) => s.resize(rows, cols).map_err(|e| e.to_string()),
        None => Err("no such terminal".into()),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir).ok();

            let db_path = data_dir.join("codetwo.db");
            let store = Arc::new(Store::open(db_path.to_string_lossy().as_ref())?);

            let skills_dir = data_dir.join("skills");
            let mut skill_vec = builtin_skills();
            if let Ok(loaded) = SkillLibrary::load_dir(&skills_dir) {
                skill_vec.extend(loaded.all().cloned());
            }
            let skills = SkillLibrary::new(skill_vec);

            let (engine, mut rx) = Engine::with_store(default_registry(), skills, store);

            // Pump core events to the frontend.
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                while let Some(ev) = rx.recv().await {
                    let _ = handle.emit("engine-event", ev);
                }
            });

            let keymap_path = data_dir.join("keymap.json");
            let keymap = Keymap::load(&keymap_path);

            app.manage(AppState {
                engine,
                skills_dir,
                keymap: Mutex::new(keymap),
                keymap_path,
                ptys: Mutex::new(HashMap::new()),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_providers,
            list_sessions,
            list_skills,
            save_skill,
            delete_skill,
            get_transcript,
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
            market_catalog,
            market_install,
            new_session,
            submit_prompt,
            answer_permission,
            set_permission_mode,
            cancel_turn,
            pty_spawn,
            pty_write,
            pty_resize
        ])
        .run(tauri::generate_context!())
        .expect("error while running codeTwo");
}
