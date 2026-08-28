use crate::app::events::PluginsChanged;
use crate::app::service::PluginHub;
use crate::app::{json, take_args, PluginManager};
use codetwo_kernel::{Context, PluginError, PluginResult, WeakContext};
use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;
use std::path::{Component, Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::sync::{mpsc, oneshot};
use tokio::task::JoinHandle;
use tokio::time::Instant;

const DEVELOPER_MARKER: &str = ".developer-mode";
const RELOAD_DEBOUNCE: Duration = Duration::from_millis(250);

#[derive(Debug, Clone, Serialize)]
pub(crate) struct PluginReloadRecord {
    at: i64,
    plugins: Vec<String>,
    success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub(crate) struct PluginDeveloperStatus {
    enabled: bool,
    watching: bool,
    plugins_dir: String,
    last_reload: Option<PluginReloadRecord>,
}

enum ReloadTarget {
    All,
    Plugins(BTreeSet<String>),
}

enum DevelopmentMessage {
    SetEnabled {
        enabled: bool,
        done: oneshot::Sender<()>,
    },
    Reload {
        target: ReloadTarget,
        done: Option<oneshot::Sender<Result<(), String>>>,
    },
    FileEvent(notify::Result<Event>),
    Shutdown,
}

struct PluginDevelopment {
    marker: PathBuf,
    status: Arc<Mutex<PluginDeveloperStatus>>,
    sender: mpsc::UnboundedSender<DevelopmentMessage>,
    task: Mutex<Option<JoinHandle<()>>>,
}

impl PluginDevelopment {
    async fn new(
        manager: Arc<PluginManager>,
        hub: Arc<PluginHub>,
        context: WeakContext,
    ) -> Result<Arc<Self>, PluginError> {
        std::fs::create_dir_all(&hub.dir).map_err(PluginError::new)?;
        let marker = hub.dir.join(DEVELOPER_MARKER);
        let enabled = marker.is_file();
        let status = Arc::new(Mutex::new(PluginDeveloperStatus {
            enabled,
            watching: false,
            plugins_dir: hub.dir.to_string_lossy().into_owned(),
            last_reload: None,
        }));
        let (sender, receiver) = mpsc::unbounded_channel();
        let task = tokio::spawn(run_development_loop(
            manager,
            hub,
            context,
            status.clone(),
            sender.clone(),
            receiver,
        ));
        let development = Arc::new(Self {
            marker,
            status,
            sender,
            task: Mutex::new(Some(task)),
        });
        development.apply_enabled(enabled).await?;
        Ok(development)
    }

    fn status(&self) -> PluginDeveloperStatus {
        self.status.lock().unwrap().clone()
    }

    async fn set_enabled(&self, enabled: bool) -> Result<PluginDeveloperStatus, PluginError> {
        if enabled {
            std::fs::write(&self.marker, b"enabled\n").map_err(PluginError::new)?;
        } else if let Err(error) = std::fs::remove_file(&self.marker) {
            if error.kind() != std::io::ErrorKind::NotFound {
                return Err(PluginError::new(error));
            }
        }
        self.apply_enabled(enabled).await?;
        Ok(self.status())
    }

    async fn apply_enabled(&self, enabled: bool) -> Result<(), PluginError> {
        let (done, received) = oneshot::channel();
        self.sender
            .send(DevelopmentMessage::SetEnabled { enabled, done })
            .map_err(|_| PluginError::new("plugin development service is unavailable"))?;
        received
            .await
            .map_err(|_| PluginError::new("plugin development service stopped unexpectedly"))
    }

    async fn reload_all(&self) -> Result<PluginDeveloperStatus, PluginError> {
        let (done, received) = oneshot::channel();
        self.sender
            .send(DevelopmentMessage::Reload {
                target: ReloadTarget::All,
                done: Some(done),
            })
            .map_err(|_| PluginError::new("plugin development service is unavailable"))?;
        received
            .await
            .map_err(|_| PluginError::new("plugin development service stopped unexpectedly"))?
            .map_err(PluginError::new)?;
        Ok(self.status())
    }
}

impl Drop for PluginDevelopment {
    fn drop(&mut self) {
        let _ = self.sender.send(DevelopmentMessage::Shutdown);
        if let Some(task) = self.task.lock().unwrap().take() {
            task.abort();
        }
    }
}

pub(crate) async fn register(
    ctx: &Context,
    manager: Arc<PluginManager>,
    hub: Arc<PluginHub>,
) -> PluginResult {
    let development = PluginDevelopment::new(manager, hub, ctx.weak()).await?;

    let status = development.clone();
    ctx.command("plugins.developer_status", move |_| {
        let development = status.clone();
        async move { json(development.status()) }
    })?;

    #[derive(Deserialize)]
    struct DeveloperModeArgs {
        enabled: bool,
    }
    let setting = development.clone();
    ctx.command("plugins.set_developer_mode", move |args| {
        let development = setting.clone();
        async move {
            let args: DeveloperModeArgs = take_args(args)?;
            json(development.set_enabled(args.enabled).await?)
        }
    })?;

    ctx.command("plugins.reload_development", move |_| {
        let development = development.clone();
        async move { json(development.reload_all().await?) }
    })?;
    Ok(())
}

async fn run_development_loop(
    manager: Arc<PluginManager>,
    hub: Arc<PluginHub>,
    context: WeakContext,
    status: Arc<Mutex<PluginDeveloperStatus>>,
    sender: mpsc::UnboundedSender<DevelopmentMessage>,
    mut receiver: mpsc::UnboundedReceiver<DevelopmentMessage>,
) {
    let watch_root = std::fs::canonicalize(&hub.dir).unwrap_or_else(|_| hub.dir.clone());
    let mut _watcher: Option<RecommendedWatcher> = None;
    let mut pending = BTreeSet::new();
    let mut reload_at: Option<Instant> = None;

    loop {
        let scheduled_reload = reload_at;
        let timeout = async move {
            match scheduled_reload {
                Some(at) => tokio::time::sleep_until(at).await,
                None => std::future::pending().await,
            }
        };
        tokio::pin!(timeout);

        tokio::select! {
            message = receiver.recv() => {
                let Some(message) = message else {
                    break;
                };
                match message {
                    DevelopmentMessage::SetEnabled { enabled, done } => {
                        pending.clear();
                        reload_at = None;
                        _watcher = if enabled {
                            match create_watcher(&watch_root, sender.clone()) {
                                Ok(active) => Some(active),
                                Err(error) => {
                                    record_reload(&status, Vec::new(), Err(error));
                                    None
                                }
                            }
                        } else {
                            None
                        };
                        let mut current = status.lock().unwrap();
                        current.enabled = enabled;
                        current.watching = _watcher.is_some();
                        drop(current);
                        let _ = done.send(());
                    }
                    DevelopmentMessage::Reload { target, done } => {
                        let result = reload(&manager, &hub, &context, &status, target).await;
                        if let Some(done) = done {
                            let _ = done.send(result);
                        }
                    }
                    DevelopmentMessage::FileEvent(Ok(event)) => {
                        if !matches!(event.kind, EventKind::Access(_)) {
                            pending.extend(
                                event.paths.iter().filter_map(|path| plugin_id_from_path(&watch_root, path))
                            );
                            if !pending.is_empty() {
                                reload_at = Some(Instant::now() + RELOAD_DEBOUNCE);
                            }
                        }
                    }
                    DevelopmentMessage::FileEvent(Err(error)) => {
                        record_reload(&status, Vec::new(), Err(error.to_string()));
                    }
                    DevelopmentMessage::Shutdown => break,
                }
            }
            _ = &mut timeout => {
                reload_at = None;
                let plugins = std::mem::take(&mut pending);
                let _ = reload(
                    &manager,
                    &hub,
                    &context,
                    &status,
                    ReloadTarget::Plugins(plugins),
                ).await;
            }
        }
    }
}

fn create_watcher(
    plugins_dir: &Path,
    sender: mpsc::UnboundedSender<DevelopmentMessage>,
) -> Result<RecommendedWatcher, String> {
    let mut watcher = notify::recommended_watcher(move |event| {
        let _ = sender.send(DevelopmentMessage::FileEvent(event));
    })
    .map_err(|error| error.to_string())?;
    watcher
        .watch(plugins_dir, RecursiveMode::Recursive)
        .map_err(|error| error.to_string())?;
    Ok(watcher)
}

async fn reload(
    manager: &PluginManager,
    hub: &PluginHub,
    context: &WeakContext,
    status: &Mutex<PluginDeveloperStatus>,
    target: ReloadTarget,
) -> Result<(), String> {
    let _inventory = hub.inventory.lock().await;
    let plugins = match target {
        ReloadTarget::All => hub
            .installed()
            .into_iter()
            .map(|plugin| plugin.id)
            .collect::<BTreeSet<_>>(),
        ReloadTarget::Plugins(plugins) => plugins,
    };
    let listed = plugins.iter().cloned().collect::<Vec<_>>();
    let mut result = manager
        .reload_installed_bundles(&hub.dir, &plugins)
        .map_err(|error| error.to_string());
    if let Some(context) = context.upgrade() {
        record_reload(status, listed, result.clone());
        context.emit(PluginsChanged).await;
        context.flush().await;
    } else {
        result = Err("plugin runtime is unavailable".into());
        record_reload(status, listed, result.clone());
    }
    result
}

fn record_reload(
    status: &Mutex<PluginDeveloperStatus>,
    plugins: Vec<String>,
    result: Result<(), String>,
) {
    let (success, error) = match result {
        Ok(()) => (true, None),
        Err(error) => (false, Some(error)),
    };
    status.lock().unwrap().last_reload = Some(PluginReloadRecord {
        at: codetwo_core::session::now_millis(),
        plugins,
        success,
        error,
    });
}

fn plugin_id_from_path(plugins_dir: &Path, path: &Path) -> Option<String> {
    let relative = path.strip_prefix(plugins_dir).ok()?;
    let Component::Normal(id) = relative.components().next()? else {
        return None;
    };
    let id = id.to_str()?;
    (!id.starts_with('.')).then(|| id.to_string())
}

#[cfg(test)]
mod tests {
    use super::plugin_id_from_path;
    use std::path::Path;

    #[test]
    fn maps_only_visible_top_level_bundle_paths() {
        let root = Path::new("/tmp/plugins");
        assert_eq!(
            plugin_id_from_path(root, Path::new("/tmp/plugins/example/bundle/server.js")),
            Some("example".into())
        );
        assert_eq!(
            plugin_id_from_path(root, Path::new("/tmp/plugins/.data/example/cache")),
            None
        );
        assert_eq!(
            plugin_id_from_path(root, Path::new("/tmp/plugins/.install-stage/file")),
            None
        );
        assert_eq!(
            plugin_id_from_path(root, Path::new("/tmp/plugins/.developer-mode")),
            None
        );
    }
}
