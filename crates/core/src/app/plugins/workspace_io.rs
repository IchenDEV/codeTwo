//! Workspace files, projects, artifacts, search, and worktree metadata.
//!
//! These commands deliberately live below every host. Path validation and search authorization
//! are product policy, not GUI-framework policy, so the desktop, TUI, and remote server share them.

use crate::app::service::StoreService;
use crate::app::{json, take_args};
use crate::artifact::ArtifactStore;
use crate::project::{self, ProjectWorktreeMode};
use crate::workspace;
use crate::workspace_search::{self, WorkspaceSearchCancellation, WorkspaceSearchOptions};
use crate::worktree::{ResolvedWorktreeBaseline, WorktreeBaseline};
use codetwo_kernel::{async_trait, Context, Injection, Plugin, PluginError, PluginResult};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

#[derive(Deserialize)]
struct CwdArgs {
    cwd: String,
}

pub struct WorkspacePlugin;

#[async_trait]
impl Plugin for WorkspacePlugin {
    fn name(&self) -> &str {
        "workspace"
    }

    fn description(&self) -> Option<&str> {
        Some("Workspace files, rules, project scripts, and local worktree baselines.")
    }

    async fn apply(&self, ctx: Context, _config: Value) -> PluginResult {
        #[derive(Deserialize)]
        struct ListFilesArgs {
            cwd: String,
            #[serde(default)]
            query: String,
            #[serde(default)]
            limit: Option<usize>,
        }
        ctx.command("workspace.list_files", |args| async move {
            let args: ListFilesArgs = take_args(args)?;
            json(workspace::list_files(
                Path::new(&args.cwd),
                &args.query,
                args.limit.unwrap_or(50),
            ))
        })?;

        #[derive(Deserialize)]
        struct PathArgs {
            cwd: String,
            path: String,
        }
        ctx.command("workspace.list_dir", |args| async move {
            let args: PathArgs = take_args(args)?;
            json(workspace::list_dir(Path::new(&args.cwd), &args.path)?)
        })?;
        ctx.command("workspace.create_file", |args| async move {
            let args: PathArgs = take_args(args)?;
            workspace::create_file(Path::new(&args.cwd), &args.path)?;
            Ok(Value::Bool(true))
        })?;
        ctx.command("workspace.create_dir", |args| async move {
            let args: PathArgs = take_args(args)?;
            workspace::create_dir(Path::new(&args.cwd), &args.path)?;
            Ok(Value::Bool(true))
        })?;
        ctx.command("workspace.read_text", |args| async move {
            let args: PathArgs = take_args(args)?;
            json(workspace::read_text(Path::new(&args.cwd), &args.path)?)
        })?;
        ctx.command("workspace.read_binary", |args| async move {
            let args: PathArgs = take_args(args)?;
            json(workspace::read_binary(Path::new(&args.cwd), &args.path)?)
        })?;

        #[derive(Deserialize)]
        struct WriteArgs {
            cwd: String,
            path: String,
            content: String,
        }
        ctx.command("workspace.write_text", |args| async move {
            let args: WriteArgs = take_args(args)?;
            workspace::write_text(Path::new(&args.cwd), &args.path, &args.content)?;
            Ok(Value::Bool(true))
        })?;

        #[derive(Deserialize)]
        struct MoveArgs {
            cwd: String,
            from: String,
            to: String,
        }
        ctx.command("workspace.rename", |args| async move {
            let args: MoveArgs = take_args(args)?;
            workspace::rename_path(Path::new(&args.cwd), &args.from, &args.to)?;
            Ok(Value::Bool(true))
        })?;
        ctx.command("workspace.copy", |args| async move {
            let args: MoveArgs = take_args(args)?;
            workspace::copy_file(Path::new(&args.cwd), &args.from, &args.to)?;
            Ok(Value::Bool(true))
        })?;
        ctx.command("workspace.delete", |args| async move {
            let args: PathArgs = take_args(args)?;
            workspace::delete_path(Path::new(&args.cwd), &args.path)?;
            Ok(Value::Bool(true))
        })?;

        ctx.command("workspace.rules", |args| async move {
            let args: CwdArgs = take_args(args)?;
            json(
                crate::rules::load(Path::new(&args.cwd))
                    .into_iter()
                    .map(|rule| rule.path)
                    .collect::<Vec<_>>(),
            )
        })?;

        ctx.command("workspace.source_control", |args| async move {
            let args: CwdArgs = take_args(args)?;
            json(
                crate::source_control::inspect(Path::new(&args.cwd))
                    .await
                    .map_err(PluginError::new)?,
            )
        })?;

        ctx.command("workspace.scripts", |args| async move {
            let args: CwdArgs = take_args(args)?;
            json(project::load(Path::new(&args.cwd)).scripts)
        })?;

        #[derive(Deserialize)]
        struct ScriptArgs {
            cwd: String,
            id: String,
        }
        ctx.command("workspace.run_script", |args| async move {
            let args: ScriptArgs = take_args(args)?;
            let script = project::load(Path::new(&args.cwd))
                .scripts
                .into_iter()
                .find(|script| script.id == args.id)
                .ok_or_else(|| PluginError::new(format!("unknown script: {}", args.id)))?;
            json(
                project::run_script(Path::new(&args.cwd), &script)
                    .await
                    .map_err(PluginError::new)?,
            )
        })?;

        ctx.command("workspace.default_cwd", |_| async move {
            let cwd = std::env::current_dir().ok();
            let usable = cwd.filter(|path| path.parent().is_some());
            json(
                usable
                    .or_else(home_dir)
                    .map(|path| path.to_string_lossy().into_owned())
                    .unwrap_or_else(|| ".".to_string()),
            )
        })?;

        ctx.command("worktrees.baselines", |args| async move {
            let args: CwdArgs = take_args(args)?;
            json(resolve_baselines(Path::new(&args.cwd)).await)
        })?;
        Ok(())
    }
}

#[derive(Serialize)]
struct WorktreeBaselineOption {
    kind: WorktreeBaseline,
    resolved: Option<ResolvedWorktreeBaseline>,
    unavailable_reason: Option<String>,
}

async fn resolve_baselines(cwd: &Path) -> Vec<WorktreeBaselineOption> {
    let (current, origin_default) = tokio::join!(
        crate::worktree::resolve_baseline(cwd, WorktreeBaseline::Current),
        crate::worktree::resolve_baseline(cwd, WorktreeBaseline::OriginDefault),
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

pub struct ProjectsPlugin;

#[async_trait]
impl Plugin for ProjectsPlugin {
    fn name(&self) -> &str {
        "projects"
    }

    fn description(&self) -> Option<&str> {
        Some("Persistent project registry and per-project worktree defaults.")
    }

    fn inject(&self) -> Injection {
        Injection::required(["store"])
    }

    async fn apply(&self, ctx: Context, _config: Value) -> PluginResult {
        let store = ctx.expect::<StoreService>()?;
        let listing = store.clone();
        ctx.command("projects.list", move |_| {
            let store = listing.clone();
            async move { json(store.list_projects().map_err(PluginError::new)?) }
        })?;

        #[derive(Deserialize)]
        struct AddArgs {
            path: String,
            #[serde(default)]
            name: Option<String>,
        }
        let adding = store.clone();
        ctx.command("projects.add", move |args| {
            let store = adding.clone();
            async move {
                let args: AddArgs = take_args(args)?;
                let resolved = Path::new(&args.path).canonicalize().map_err(|error| {
                    PluginError::new(format!("can't open “{}”: {error}", args.path))
                })?;
                if !resolved.is_dir() {
                    return Err(PluginError::new(format!(
                        "“{}” is not a directory",
                        resolved.display()
                    )));
                }
                let path = resolved.to_string_lossy().into_owned();
                store
                    .add_project(&path, args.name.as_deref(), crate::session::now_millis())
                    .map_err(PluginError::new)?;
                json(path)
            }
        })?;

        #[derive(Deserialize)]
        struct PathOnly {
            path: String,
        }
        let opening = store.clone();
        ctx.command("projects.open", move |args| {
            let store = opening.clone();
            async move {
                let args: PathOnly = take_args(args)?;
                store
                    .touch_project(&args.path, crate::session::now_millis())
                    .map_err(PluginError::new)?;
                Ok(Value::Bool(true))
            }
        })?;

        #[derive(Deserialize)]
        struct RenameArgs {
            path: String,
            name: String,
        }
        let renaming = store.clone();
        ctx.command("projects.rename", move |args| {
            let store = renaming.clone();
            async move {
                let args: RenameArgs = take_args(args)?;
                store
                    .rename_project(&args.path, &args.name)
                    .map_err(PluginError::new)?;
                Ok(Value::Bool(true))
            }
        })?;

        #[derive(Deserialize)]
        struct ModeArgs {
            path: String,
            #[serde(default)]
            mode: Option<ProjectWorktreeMode>,
        }
        let worktree_mode = store.clone();
        ctx.command("projects.set_worktree_mode", move |args| {
            let store = worktree_mode.clone();
            async move {
                let args: ModeArgs = take_args(args)?;
                store
                    .set_project_worktree_mode(&args.path, args.mode)
                    .map_err(PluginError::new)?;
                Ok(Value::Bool(true))
            }
        })?;

        ctx.command("projects.remove", move |args| {
            let store = store.clone();
            async move {
                let args: PathOnly = take_args(args)?;
                store.remove_project(&args.path).map_err(PluginError::new)?;
                Ok(Value::Bool(true))
            }
        })?;
        Ok(())
    }
}

pub struct ArtifactsPlugin;

#[async_trait]
impl Plugin for ArtifactsPlugin {
    fn name(&self) -> &str {
        "artifacts"
    }

    fn description(&self) -> Option<&str> {
        Some("Durable tool artifacts addressed by opaque IDs.")
    }

    fn inject(&self) -> Injection {
        Injection::required(["store"])
    }

    async fn apply(&self, ctx: Context, _config: Value) -> PluginResult {
        let store = ctx.expect::<StoreService>()?;
        let artifacts = Arc::new(
            ArtifactStore::from_store(store.0.clone())
                .ok_or_else(|| PluginError::new("artifact storage is unavailable"))?,
        );

        #[derive(Deserialize)]
        struct IdArgs {
            id: String,
        }
        let reading = artifacts.clone();
        ctx.command("artifacts.get", move |args| {
            let artifacts = reading.clone();
            async move {
                let args: IdArgs = take_args(args)?;
                json(artifacts.get(&args.id).map_err(PluginError::new)?)
            }
        })?;

        #[derive(Deserialize)]
        struct SaveArgs {
            id: String,
            destination: String,
        }
        let saving = artifacts.clone();
        ctx.command("artifacts.save_as", move |args| {
            let artifacts = saving.clone();
            async move {
                let args: SaveArgs = take_args(args)?;
                artifacts
                    .save_as(&args.id, Path::new(&args.destination))
                    .map_err(PluginError::new)?;
                Ok(Value::Bool(true))
            }
        })?;

        ctx.command("artifacts.reveal", move |args| {
            let artifacts = artifacts.clone();
            async move {
                let args: IdArgs = take_args(args)?;
                let path = artifacts
                    .path_for_reveal(&args.id)
                    .map_err(PluginError::new)?;
                reveal(&path).map_err(PluginError::new)?;
                Ok(Value::Bool(true))
            }
        })?;
        Ok(())
    }
}

pub struct WorkspaceSearchPlugin;

#[async_trait]
impl Plugin for WorkspaceSearchPlugin {
    fn name(&self) -> &str {
        "workspace-search"
    }

    fn description(&self) -> Option<&str> {
        Some("Bounded, cancellable content search over known workspaces.")
    }

    fn inject(&self) -> Injection {
        Injection::required(["store"])
    }

    async fn apply(&self, ctx: Context, _config: Value) -> PluginResult {
        let store = ctx.expect::<StoreService>()?;
        let searches: Arc<Mutex<HashMap<String, WorkspaceSearchCancellation>>> =
            Arc::new(Mutex::new(HashMap::new()));
        let cleanup = searches.clone();
        ctx.effect(move || {
            for cancellation in cleanup.lock().unwrap().values() {
                cancellation.cancel();
            }
        });

        #[derive(Deserialize)]
        struct SearchArgs {
            cwd: String,
            query: String,
            options: WorkspaceSearchOptions,
            #[serde(default)]
            limit: Option<usize>,
            request_id: String,
        }
        let active = searches.clone();
        ctx.command("workspace.search", move |args| {
            let store = store.clone();
            let searches = active.clone();
            async move {
                let args: SearchArgs = take_args(args)?;
                validate_request_id(&args.request_id)?;
                let root = authorized_workspace_root(&store, &args.cwd)?;
                let cancellation = WorkspaceSearchCancellation::new();
                {
                    let mut active = searches.lock().unwrap();
                    if active.contains_key(&args.request_id) {
                        return Err(PluginError::new(
                            "workspace search request id is already active",
                        ));
                    }
                    if active.len() >= 8 {
                        return Err(PluginError::new("too many workspace searches are active"));
                    }
                    active.insert(args.request_id.clone(), cancellation.clone());
                }
                let result = workspace_search::search_contents_with_cancellation(
                    &root,
                    &args.query,
                    args.options,
                    args.limit.unwrap_or(200),
                    &cancellation,
                )
                .await;
                searches.lock().unwrap().remove(&args.request_id);
                json(result.map_err(PluginError::new)?)
            }
        })?;

        #[derive(Deserialize)]
        struct CancelArgs {
            request_id: String,
        }
        ctx.command("workspace.cancel_search", move |args| {
            let searches = searches.clone();
            async move {
                let args: CancelArgs = take_args(args)?;
                let cancellation = searches.lock().unwrap().remove(&args.request_id);
                if let Some(cancellation) = cancellation {
                    cancellation.cancel();
                    Ok(Value::Bool(true))
                } else {
                    Ok(Value::Bool(false))
                }
            }
        })?;
        Ok(())
    }
}

fn validate_request_id(request_id: &str) -> Result<(), PluginError> {
    if request_id.is_empty() || request_id.len() > 128 || request_id.chars().any(char::is_control) {
        return Err(PluginError::new("workspace search request id is invalid"));
    }
    Ok(())
}

fn authorized_workspace_root(store: &StoreService, cwd: &str) -> Result<PathBuf, PluginError> {
    let mut roots: Vec<String> = store
        .list_projects()
        .map_err(PluginError::new)?
        .into_iter()
        .map(|project| project.path)
        .collect();
    let sessions = store.list_sessions().map_err(PluginError::new)?;
    let archived = store.list_archived_sessions().map_err(PluginError::new)?;
    for session in sessions.into_iter().chain(archived) {
        roots.push(session.cwd);
        roots.extend(session.project_path);
        roots.extend(session.worktree_path);
    }
    resolve_known_workspace_root(cwd, &roots)
}

fn resolve_known_workspace_root(cwd: &str, roots: &[String]) -> Result<PathBuf, PluginError> {
    let requested = Path::new(cwd)
        .canonicalize()
        .map_err(|error| PluginError::new(format!("can't open workspace {cwd}: {error}")))?;
    let authorized = roots.iter().any(|root| {
        let root = Path::new(root);
        std::fs::symlink_metadata(root).is_ok_and(|metadata| {
            metadata.is_dir() && !metadata.file_type().is_symlink() && root == requested
        })
    });
    if !authorized {
        return Err(PluginError::new(
            "workspace content search is limited to project and session roots known to C2",
        ));
    }
    Ok(requested)
}

fn home_dir() -> Option<PathBuf> {
    std::env::var_os("HOME").map(PathBuf::from)
}

fn reveal(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let status = std::process::Command::new("/usr/bin/open")
        .arg("-R")
        .arg(path)
        .status();
    #[cfg(not(target_os = "macos"))]
    let status = std::process::Command::new("xdg-open")
        .arg(path.parent().unwrap_or(Path::new(".")))
        .status();
    status
        .map_err(|error| error.to_string())?
        .success()
        .then_some(())
        .ok_or_else(|| "could not reveal artifact".to_string())
}
