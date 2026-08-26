//! Workspace files, projects, artifacts, search, and worktree metadata.
//!
//! These commands deliberately live below every host. Path validation and search authorization
//! are product policy, not GUI-framework policy, so the desktop, TUI, and remote server share them.

use crate::app::service::{Paths, StoreService};
use crate::app::{json, take_args};
use crate::artifact::ArtifactStore;
use crate::project::{self, ProjectWorktreeMode};
use crate::workspace;
use crate::workspace_search::{self, WorkspaceSearchCancellation, WorkspaceSearchOptions};
use crate::worktree::{ResolvedWorktreeBaseline, WorktreeBaseline};
use base64::Engine as _;
use codetwo_kernel::{
    async_trait, CommandRealm, Context, Injection, Plugin, PluginError, PluginResult,
};
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
        Some("Workspace files, private prompt attachments, rules, and local worktree baselines.")
    }

    fn inject(&self) -> Injection {
        Injection::required(["paths"])
    }

    async fn apply(&self, ctx: Context, _config: Value) -> PluginResult {
        let paths = ctx.expect::<Paths>()?;
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
        struct ImportAttachmentArgs {
            bytes: Vec<u8>,
            #[serde(default)]
            declared_mime: Option<String>,
            #[serde(default)]
            name: String,
        }
        let attachment_data_dir = paths.data_dir.clone();
        ctx.command("attachments.import", move |args| {
            let data_dir = attachment_data_dir.clone();
            async move {
                let args: ImportAttachmentArgs = take_args(args)?;
                let attachment = crate::attachment::import_prompt_attachment(
                    &data_dir,
                    &args.name,
                    args.declared_mime.as_deref(),
                    &args.bytes,
                    crate::session::now_millis(),
                )
                .map_err(PluginError::new)?;
                json(serde_json::json!({
                    "id": attachment.id,
                    "kind": "attachment",
                    "app_name": "Image",
                    "window_title": attachment.name,
                    "captured_at": "",
                    "text_length": 0,
                    "text_truncated": false,
                    "width": attachment.width,
                    "height": attachment.height,
                    "preview_data_url": format!(
                        "data:{};base64,{}",
                        attachment.mime_type,
                        base64::engine::general_purpose::STANDARD.encode(attachment.bytes),
                    ),
                    "destination": "current",
                }))
            }
        })?;

        #[derive(Deserialize)]
        struct GetAttachmentArgs {
            id: String,
        }
        let attachment_data_dir = paths.data_dir.clone();
        ctx.command("attachments.get", move |args| {
            let data_dir = attachment_data_dir.clone();
            async move {
                let args: GetAttachmentArgs = take_args(args)?;
                let attachment = crate::attachment::load_prompt_attachment(&data_dir, &args.id)
                    .map_err(PluginError::new)?;
                json(serde_json::json!({
                    "id": attachment.id,
                    "kind": "attachment",
                    "app_name": "Image",
                    "window_title": attachment.name,
                    "captured_at": "",
                    "text_length": 0,
                    "text_truncated": false,
                    "width": attachment.width,
                    "height": attachment.height,
                    "preview_data_url": format!(
                        "data:{};base64,{}",
                        attachment.mime_type,
                        base64::engine::general_purpose::STANDARD.encode(attachment.bytes),
                    ),
                    "destination": "current",
                }))
            }
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
        struct SaveScriptArgs {
            cwd: String,
            id: String,
            name: String,
            #[serde(default)]
            kind: crate::project::ProjectActionKind,
            #[serde(default)]
            command: String,
            #[serde(default)]
            prompt: String,
            #[serde(default)]
            keybinding: String,
            #[serde(default)]
            preview_url: String,
            #[serde(default)]
            run_on_worktree_create: bool,
            #[serde(default)]
            open_preview: bool,
        }
        ctx.command("workspace.save_script", |args| async move {
            let args: SaveScriptArgs = take_args(args)?;
            json(project::save_script(
                Path::new(&args.cwd),
                &crate::project::ProjectScript {
                    id: args.id,
                    name: args.name,
                    kind: args.kind,
                    command: args.command,
                    prompt: args.prompt,
                    keybinding: args.keybinding,
                    preview_url: args.preview_url,
                    run_on_worktree_create: args.run_on_worktree_create,
                    open_preview: args.open_preview,
                },
            )?)
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
        Injection::required(["store", "paths"])
    }

    async fn apply(&self, ctx: Context, _config: Value) -> PluginResult {
        let store = ctx.expect::<StoreService>()?;
        let paths = ctx.expect::<Paths>()?;
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

        #[derive(Deserialize)]
        struct AgentDefaultsArgs {
            path: String,
            #[serde(default)]
            provider: Option<String>,
            #[serde(default)]
            model: Option<String>,
            #[serde(default)]
            reasoning_effort: Option<String>,
        }
        let defaults = store.clone();
        ctx.command("projects.set_agent_defaults", move |args| {
            let store = defaults.clone();
            async move {
                let args: AgentDefaultsArgs = take_args(args)?;
                store
                    .set_project_agent_defaults(
                        &args.path,
                        args.provider.as_deref(),
                        args.model.as_deref(),
                        args.reasoning_effort.as_deref(),
                    )
                    .map_err(PluginError::new)?;
                Ok(Value::Bool(true))
            }
        })?;

        #[derive(Deserialize)]
        struct IconArgs {
            path: String,
            #[serde(default)]
            source: Option<String>,
        }
        let icon_store = store.clone();
        let icon_dir = paths.data_dir.join("project-icons");
        ctx.command("projects.set_icon", move |args| {
            let store = icon_store.clone();
            let icon_dir = icon_dir.clone();
            async move {
                let args: IconArgs = take_args(args)?;
                if !store.project_exists(&args.path).map_err(PluginError::new)? {
                    return Err(PluginError::new(format!("unknown project {:?}", args.path)));
                }
                let previous = store
                    .project_icon_path(&args.path)
                    .map_err(PluginError::new)?;
                let Some(source) = args.source else {
                    let revision = store
                        .set_project_icon(&args.path, None, crate::session::now_millis())
                        .map_err(PluginError::new)?;
                    remove_stored_project_icon(&icon_dir, previous.as_deref());
                    return json(revision);
                };
                let source = PathBuf::from(source);
                let bytes = read_bounded_file(&source, MAX_PROJECT_ICON_BYTES, "project icon")?;
                let (mime, extension) = project_icon_format(&source, &bytes)?;
                let _ = mime;
                std::fs::create_dir_all(&icon_dir).map_err(PluginError::new)?;
                let key = blake3::hash(args.path.as_bytes()).to_hex();
                let content = blake3::hash(&bytes).to_hex();
                let destination =
                    icon_dir.join(format!("{}-{}.{extension}", &key[..16], &content[..16]));
                write_private_file(&destination, &bytes)?;
                let destination_text = destination.to_string_lossy().into_owned();
                let revision = match store.set_project_icon(
                    &args.path,
                    Some(&destination_text),
                    crate::session::now_millis(),
                ) {
                    Ok(revision) => revision,
                    Err(error) => {
                        if previous.as_deref() != Some(destination_text.as_str()) {
                            remove_stored_project_icon(&icon_dir, Some(&destination_text));
                        }
                        return Err(PluginError::new(error));
                    }
                };
                if previous.as_deref() != Some(destination_text.as_str()) {
                    remove_stored_project_icon(&icon_dir, previous.as_deref());
                }
                json(revision)
            }
        })?;

        let reading_icon = store.clone();
        let icon_dir = paths.data_dir.join("project-icons");
        ctx.command("projects.icon", move |args| {
            let store = reading_icon.clone();
            let icon_dir = icon_dir.clone();
            async move {
                let args: PathOnly = take_args(args)?;
                let Some(stored) = store
                    .project_icon_path(&args.path)
                    .map_err(PluginError::new)?
                else {
                    return Ok(Value::Null);
                };
                let stored = PathBuf::from(stored);
                let canonical_dir = icon_dir.canonicalize().map_err(PluginError::new)?;
                let canonical_stored = match stored.canonicalize() {
                    Ok(path) => path,
                    Err(_) => return Ok(Value::Null),
                };
                if !path_inside(&canonical_dir, &canonical_stored) {
                    return Err(PluginError::new("project icon path is invalid"));
                }
                let bytes = match read_bounded_file(
                    &canonical_stored,
                    MAX_PROJECT_ICON_BYTES,
                    "project icon",
                ) {
                    Ok(bytes) => bytes,
                    Err(_) => return Ok(Value::Null),
                };
                let (mime_type, _) = project_icon_format(&canonical_stored, &bytes)?;
                json(serde_json::json!({ "mime_type": mime_type, "bytes": bytes }))
            }
        })?;

        let removing = store.clone();
        let icon_dir = paths.data_dir.join("project-icons");
        ctx.command("projects.remove", move |args| {
            let store = removing.clone();
            let icon_dir = icon_dir.clone();
            async move {
                let args: PathOnly = take_args(args)?;
                let icon = store
                    .project_icon_path(&args.path)
                    .map_err(PluginError::new)?;
                store.remove_project(&args.path).map_err(PluginError::new)?;
                remove_stored_project_icon(&icon_dir, icon.as_deref());
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

        #[derive(Deserialize)]
        struct VisualizationArgs {
            path: String,
        }
        ctx.command_with_realm(
            "artifacts.read_visualization",
            move |realm, args| async move {
                let args: VisualizationArgs = take_args(args)?;
                read_visualization(&args.path, &realm).map(Value::String)
            },
        )?;
        Ok(())
    }
}

const MAX_PROJECT_ICON_BYTES: u64 = 2 * 1024 * 1024;
const MAX_VISUALIZATION_BYTES: u64 = 1024 * 1024;

fn path_inside(root: &Path, candidate: &Path) -> bool {
    candidate == root || candidate.starts_with(root)
}

fn read_bounded_file(path: &Path, maximum: u64, label: &str) -> Result<Vec<u8>, PluginError> {
    let metadata = std::fs::metadata(path).map_err(PluginError::new)?;
    if !metadata.is_file() || metadata.len() == 0 || metadata.len() > maximum {
        return Err(PluginError::new(format!(
            "{label} must be a non-empty file no larger than {} MB",
            maximum / (1024 * 1024)
        )));
    }
    std::fs::read(path).map_err(PluginError::new)
}

fn project_icon_format(
    path: &Path,
    bytes: &[u8],
) -> Result<(&'static str, &'static str), PluginError> {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let png = bytes.starts_with(b"\x89PNG\r\n\x1a\n");
    let jpeg = bytes.starts_with(&[0xff, 0xd8, 0xff]);
    let webp = bytes.len() >= 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP";
    match extension.as_str() {
        "png" if png => Ok(("image/png", "png")),
        "jpg" | "jpeg" if jpeg => Ok(("image/jpeg", "jpg")),
        "webp" if webp => Ok(("image/webp", "webp")),
        _ => Err(PluginError::new(
            "project icon must be a PNG, JPEG, or WebP image",
        )),
    }
}

fn write_private_file(path: &Path, bytes: &[u8]) -> Result<(), PluginError> {
    std::fs::write(path, bytes).map_err(PluginError::new)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))
            .map_err(PluginError::new)?;
    }
    Ok(())
}

fn remove_stored_project_icon(icon_dir: &Path, stored: Option<&str>) {
    let Some(stored) = stored else { return };
    let Ok(root) = icon_dir.canonicalize() else {
        return;
    };
    let Ok(stored) = Path::new(stored).canonicalize() else {
        return;
    };
    if path_inside(&root, &stored) {
        let _ = std::fs::remove_file(&stored);
    }
}

fn read_visualization(path: &str, realm: &CommandRealm) -> Result<String, PluginError> {
    let requested = Path::new(path);
    if !requested.is_absolute()
        || requested
            .extension()
            .and_then(|value| value.to_str())
            .map(str::to_ascii_lowercase)
            != Some("html".into())
    {
        return Err(PluginError::new(
            "visualization path must be an absolute .html file",
        ));
    }
    let target = requested.canonicalize().map_err(PluginError::new)?;
    let mut roots = Vec::new();
    if let Some(home) = crate::provider::home_dir() {
        roots.push(home.join(".codex/visualizations"));
    }
    if let Some(home) = std::env::var_os("CODEX_HOME") {
        roots.push(PathBuf::from(home).join("visualizations"));
    }
    roots.push(std::env::temp_dir());
    if let CommandRealm::Project(project) = realm {
        roots.push(PathBuf::from(project));
    }
    let approved = roots
        .into_iter()
        .filter_map(|root| root.canonicalize().ok())
        .any(|root| root.is_dir() && path_inside(&root, &target));
    if !approved {
        return Err(PluginError::new(
            "visualization path is outside approved roots",
        ));
    }
    let metadata = std::fs::metadata(&target).map_err(PluginError::new)?;
    if !metadata.is_file() {
        return Err(PluginError::new("visualization path is not a file"));
    }
    if metadata.len() > MAX_VISUALIZATION_BYTES {
        return Err(PluginError::new("visualization is larger than 1 MB"));
    }
    let bytes = std::fs::read(target).map_err(PluginError::new)?;
    if bytes.contains(&0) {
        return Err(PluginError::new("visualization appears to be binary"));
    }
    String::from_utf8(bytes).map_err(|_| PluginError::new("visualization is not valid UTF-8"))
}

#[cfg(test)]
mod visualization_tests {
    use super::*;

    #[test]
    fn reads_bounded_html_from_temp_and_project_realms() {
        let temporary = tempfile::tempdir().unwrap();
        let temp_html = temporary.path().join("plot.html");
        std::fs::write(&temp_html, "<div>temp</div>").unwrap();
        assert_eq!(
            read_visualization(temp_html.to_str().unwrap(), &CommandRealm::Global).unwrap(),
            "<div>temp</div>"
        );

        let project = tempfile::tempdir_in(std::env::current_dir().unwrap()).unwrap();
        let project_html = project.path().join("plot.html");
        std::fs::write(&project_html, "<div>project</div>").unwrap();
        let realm = CommandRealm::Project(project.path().to_string_lossy().into_owned());
        assert_eq!(
            read_visualization(project_html.to_str().unwrap(), &realm).unwrap(),
            "<div>project</div>"
        );
        assert!(
            read_visualization(project_html.to_str().unwrap(), &CommandRealm::Global)
                .unwrap_err()
                .to_string()
                .contains("outside approved roots")
        );
    }

    #[test]
    fn rejects_wrong_extension_binary_and_oversized_visualizations() {
        let temporary = tempfile::tempdir().unwrap();
        let text = temporary.path().join("plot.txt");
        std::fs::write(&text, "text").unwrap();
        assert!(
            read_visualization(text.to_str().unwrap(), &CommandRealm::Global)
                .unwrap_err()
                .to_string()
                .contains("absolute .html")
        );

        let binary = temporary.path().join("binary.html");
        std::fs::write(&binary, [b'<', 0, b'>']).unwrap();
        assert!(
            read_visualization(binary.to_str().unwrap(), &CommandRealm::Global)
                .unwrap_err()
                .to_string()
                .contains("binary")
        );

        let large = temporary.path().join("large.html");
        std::fs::write(&large, vec![b'x'; MAX_VISUALIZATION_BYTES as usize + 1]).unwrap();
        assert!(
            read_visualization(large.to_str().unwrap(), &CommandRealm::Global)
                .unwrap_err()
                .to_string()
                .contains("larger than 1 MB")
        );
    }

    #[cfg(unix)]
    #[test]
    fn rejects_visualization_symlink_escapes() {
        use std::os::unix::fs::symlink;

        let approved = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir_in(std::env::current_dir().unwrap()).unwrap();
        let target = outside.path().join("outside.html");
        std::fs::write(&target, "<div>outside</div>").unwrap();
        let link = approved.path().join("escaped.html");
        symlink(&target, &link).unwrap();
        assert!(
            read_visualization(link.to_str().unwrap(), &CommandRealm::Global)
                .unwrap_err()
                .to_string()
                .contains("outside approved roots")
        );
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
    crate::provider::home_dir()
}

fn reveal(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let status = std::process::Command::new("/usr/bin/open")
        .arg("-R")
        .arg(path)
        .status();
    #[cfg(windows)]
    let status = std::process::Command::new("explorer.exe")
        .arg(format!("/select,{}", path.display()))
        .status();
    #[cfg(all(not(target_os = "macos"), not(windows)))]
    let status = std::process::Command::new("xdg-open")
        .arg(path.parent().unwrap_or(Path::new(".")))
        .status();
    status
        .map_err(|error| error.to_string())?
        .success()
        .then_some(())
        .ok_or_else(|| "could not reveal artifact".to_string())
}
