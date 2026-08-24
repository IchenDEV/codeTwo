//! C2 as a plugin graph.
//!
//! # What changed
//!
//! C2 used to *be* a program with extension points: a `setup()` that constructed subsystems in
//! a fixed order into one `AppState` struct, plus a large hand-written command-wrapper layer that
//! reached into it. That wrapper layer has been removed: adding or removing a feature now changes
//! the plugin graph instead of the middle of the application.
//!
//! Following [cordis](https://github.com/cordiverse/cordis), it is now a graph. Each subsystem is
//! a [`Plugin`](codetwo_kernel::Plugin) that publishes a [`Service`](codetwo_kernel::Service) and
//! contributes commands. Each declares what it needs; the kernel decides the order, waits for
//! dependencies, and tears a plugin's whole world down when it unloads. The boot sequence is a
//! config file:
//!
//! ```text
//! paths ──┬─→ store ──┬─→ scenes ──────┬─→ scene-commands
//!         │           ├─→ engine ──────┤
//!         │           ├─→ memory       ├─→ scene-runtime
//!         │           ├─→ projects     └─→ cost
//!         │           ├─→ canvas ────────→ document
//!         │           └─→ (artifacts, workspace-search, issues)
//!         ├─→ plugin-hub ─→ (skills, extensions)
//!         └─→ keymap
//! providers ─→ engine       skills ─→ (engine, market, document)
//! (git, workspace, usage, voice, terminal: no dependencies)
//! ```
//!
//! # What that buys
//!
//! - **Deletability.** Turn `store` off and everything downstream goes pending rather than
//!   half-working. That configuration is now a real one, exercised by tests.
//! - **Reloadability.** Reconfigure `store` and the engine — which was built against it — is torn
//!   down and rebuilt automatically. Nothing holds a stale handle, because nothing is asked to
//!   handle its dependencies changing.
//! - **One extension surface.** A plugin's commands *are* the app's public API. The desktop bridge
//!   exposes only [`CoreApp::call`]; in-process hosts can additionally consume typed services for
//!   streaming protocols without constructing a second copy of the subsystem.
//! - **Plugins that are not ours.** [`protocol`] lets a plugin be a process in any language, whose
//!   commands land in the same registry. "Plugin" stops meaning "how we organised our code".
//!
//! # Booting
//!
//! ```no_run
//! # use codetwo_core::app::{AppConfig, CoreApp};
//! # async fn demo() -> Result<(), Box<dyn std::error::Error>> {
//! let app = CoreApp::boot(AppConfig::new("/home/me/.codetwo")).await?;
//! let status = app.call("git.status", serde_json::json!({ "cwd": "/repo" })).await?;
//! # Ok(())
//! # }
//! ```

mod bundle_runtime;
pub mod events;
mod plugin_config;
mod plugin_manager;
pub mod plugins;
pub mod protocol;
mod service;

pub use events::TerminalOutputEvent;
pub use plugin_config::{
    normalize_project_path, PluginConfigDocument, PluginConfigError, PluginConfigStore,
    PluginOverride, PluginPolicy, PluginRecoveryState, PluginScope,
};
pub use plugin_manager::{
    PluginActiveResource, PluginCatalog, PluginCatalogEntry, PluginChangePlan, PluginChangeRequest,
    PluginChangeResult, PluginManager, PluginManagerError, ProjectActivityLease,
};

pub use service::{
    CanvasService, CostService, EngineService, EventBus, HandoffService, KeymapService,
    LoaderService, MemoryService, Paths, PluginConfigService, PluginHub, ProviderService,
    ProviderSummary, SceneRuntimeService, SceneService, SkillService, StoreService, TerminalEvent,
    TerminalService,
};

use codetwo_kernel::{
    App, CommandInfo, CommandRealm, Context, KernelError, Loader, LoaderConfig, PluginEntry,
    PluginError, ScopeInfo, ServiceInfo, Status,
};
use serde::de::DeserializeOwned;
use serde::Serialize;
use serde_json::Value;
use std::collections::BTreeSet;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

/// Deserialize a command's arguments. A missing payload is an empty object, so commands that take
/// only optional fields can be called with no arguments at all.
pub(crate) fn take_args<T: DeserializeOwned>(value: Value) -> Result<T, PluginError> {
    let value = if value.is_null() {
        Value::Object(Default::default())
    } else {
        value
    };
    serde_json::from_value(value)
        .map_err(|error| PluginError::new(format!("bad arguments: {error}")))
}

/// Serialize a command's result.
pub(crate) fn json<T: Serialize>(value: T) -> Result<Value, PluginError> {
    serde_json::to_value(value).map_err(PluginError::new)
}

/// What to boot: where the data lives, and which plugins to run with what config.
#[derive(Debug, Clone)]
pub struct AppConfig {
    pub plugins: LoaderConfig,
    data_dir: Option<PathBuf>,
}

impl AppConfig {
    /// Every built-in, storing under `data_dir`.
    pub fn new(data_dir: impl Into<PathBuf>) -> AppConfig {
        let data_dir = data_dir.into();
        let plugins = LoaderConfig::default()
            .enable(plugins::BUILTIN.iter().copied())
            .with(
                "paths",
                PluginEntry::with_config(
                    serde_json::json!({ "data_dir": data_dir.to_string_lossy() }),
                ),
            );
        AppConfig {
            plugins,
            data_dir: Some(data_dir),
        }
    }

    /// The same graph over an ephemeral database.
    ///
    /// Note what this genuinely cannot do: an in-memory store has no blob root, so scene artifact
    /// capture is unavailable and `scene-runtime` refuses to load. That is the graph reporting a
    /// real limitation rather than half-working, but it means this is not the config to use when
    /// you want every plugin running.
    pub fn in_memory(data_dir: impl Into<PathBuf>) -> AppConfig {
        let mut config = AppConfig::new(data_dir);
        config.plugins.plugins.insert(
            "store".into(),
            PluginEntry::with_config(serde_json::json!({ "path": ":memory:" })),
        );
        config
    }

    /// Start from nothing and pick. Useful for a headless host that wants `git` and `market` but
    /// no agent loop.
    pub fn bare() -> AppConfig {
        AppConfig {
            plugins: LoaderConfig::default(),
            data_dir: None,
        }
    }

    /// Start from an empty graph while keeping durable app configuration under `data_dir`.
    /// Useful for small hosts that still want plugin policy to survive restarts.
    pub fn bare_in(data_dir: impl Into<PathBuf>) -> AppConfig {
        AppConfig {
            plugins: LoaderConfig::default(),
            data_dir: Some(data_dir.into()),
        }
    }

    pub fn with(mut self, name: impl Into<String>, entry: PluginEntry) -> AppConfig {
        self.plugins = self.plugins.with(name, entry);
        self
    }

    /// Drop a plugin from the boot set.
    pub fn without(mut self, name: &str) -> AppConfig {
        self.plugins.plugins.remove(name);
        self
    }
}

/// A booted C2: the kernel, the loader, and the root context.
///
/// Frontends hold one of these instead of an `AppState`. What they can do is whatever the loaded
/// plugins registered — discoverable at runtime through [`CoreApp::commands`].
pub struct CoreApp {
    app: App,
    loader: Arc<Mutex<Loader>>,
    plugin_config: Arc<Mutex<PluginConfigStore>>,
    plugin_manager: Arc<PluginManager>,
}

impl CoreApp {
    /// Boot the graph and wait for it to settle.
    ///
    /// Config entries naming plugins nobody registered are logged and skipped: one stale line in a
    /// user's config must not stop the app from starting.
    pub async fn boot(config: AppConfig) -> Result<CoreApp, KernelError> {
        CoreApp::boot_with(config, plugins::builtin_registry()).await
    }

    /// Boot with a customized registry — a host replaces a built-in by registering its own plugin
    /// under the same name, or adds plugins of its own that the config can then enable.
    pub async fn boot_with(
        mut config: AppConfig,
        registry: codetwo_kernel::PluginRegistry,
    ) -> Result<CoreApp, KernelError> {
        let app = App::new();
        let plugin_config = Arc::new(Mutex::new(match &config.data_dir {
            Some(data_dir) => {
                PluginConfigStore::open(data_dir).map_err(|error| KernelError::Config {
                    name: "plugin-manager".into(),
                    message: error.to_string(),
                })?
            }
            None => PluginConfigStore::ephemeral(),
        }));

        let default_plugins = config.plugins.clone();
        let essential = safe_mode_entries(&registry, &default_plugins);
        apply_persisted_user_policy(
            &mut config.plugins,
            &registry,
            &plugin_config.lock().unwrap(),
        );
        if matches!(
            plugin_config.lock().unwrap().recovery(),
            PluginRecoveryState::SafeMode { .. }
        ) {
            config
                .plugins
                .plugins
                .retain(|name, _| essential.iter().any(|(essential, _)| essential == name));
            for (name, entry) in &essential {
                config.plugins.plugins.insert(name.clone(), entry.clone());
            }
        }

        let loader = Arc::new(Mutex::new(Loader::new(app.ctx(), registry)));
        app.ctx().provide(Arc::new(LoaderService(loader.clone())))?;
        app.ctx()
            .provide(Arc::new(PluginConfigService(plugin_config.clone())))?;
        let plugin_manager = Arc::new(PluginManager::new(
            loader.clone(),
            plugin_config.clone(),
            default_plugins,
            app.ctx().weak(),
        ));
        plugin_manager.start_reaper();
        app.ctx().provide(plugin_manager.clone())?;

        let errors = loader.lock().unwrap().apply(config.plugins);
        for error in errors {
            tracing::warn!("plugin config: {error}");
        }
        app.flush().await;

        for scope in app.runtime().scopes() {
            if let Some(error) = &scope.error {
                tracing::warn!(plugin = %scope.plugin, "plugin failed: {error}");
            }
        }
        let scopes = app.runtime().scopes();
        let configured = loader.lock().unwrap().config().clone();
        let unhealthy = configured
            .plugins
            .iter()
            .filter(|(_, entry)| entry.enabled)
            .filter_map(|(name, _)| {
                let instance = scopes.iter().find(|scope| {
                    scope.plugin == *name && scope.command_realm == CommandRealm::Global
                });
                (!instance.is_some_and(|scope| scope.status == Status::Active)).then(|| {
                    let detail = instance
                        .and_then(|scope| scope.error.clone())
                        .unwrap_or_else(|| {
                            instance
                                .map(|scope| format!("status is {:?}", scope.status))
                                .unwrap_or_else(|| "no runtime instance was created".into())
                        });
                    (name.clone(), detail)
                })
            })
            .collect::<Vec<_>>();
        let recovery = plugin_config.lock().unwrap().recovery().clone();
        if unhealthy.is_empty() && matches!(recovery, PluginRecoveryState::Normal) {
            if let Err(error) = plugin_config.lock().unwrap().mark_last_good() {
                tracing::warn!("could not save last known-good plugin config: {error}");
            }
        } else if unhealthy.is_empty() {
            tracing::warn!(
                recovery = ?recovery,
                "plugin config is still in recovery mode; preserving the existing last-known-good snapshot until an explicit reset"
            );
        } else {
            for (plugin, error) in unhealthy {
                tracing::warn!(
                    plugin = %plugin,
                    "plugin did not become active at startup; preserving the previous last-known-good config: {error}"
                );
            }
        }
        Ok(CoreApp {
            app,
            loader,
            plugin_config,
            plugin_manager,
        })
    }

    /// The root context — load your own plugins into this.
    pub fn ctx(&self) -> Context {
        self.app.ctx()
    }

    pub fn kernel(&self) -> &App {
        &self.app
    }

    pub fn loader(&self) -> &Arc<Mutex<Loader>> {
        &self.loader
    }

    pub fn plugin_config(&self) -> &Arc<Mutex<PluginConfigStore>> {
        &self.plugin_config
    }

    pub fn plugin_manager(&self) -> &Arc<PluginManager> {
        &self.plugin_manager
    }

    /// Invoke a plugin-contributed command. This is the whole app surface.
    pub async fn call(&self, name: &str, args: Value) -> Result<Value, KernelError> {
        self.app.ctx().call(name, args).await
    }

    /// Invoke through one project's command realm, falling back to global commands when the
    /// project has no override. Project child loaders populate the realm lazily.
    pub async fn call_in_project(
        &self,
        project_path: impl AsRef<std::path::Path>,
        name: &str,
        args: Value,
    ) -> Result<Value, KernelError> {
        let (project_path, _activity) = self
            .plugin_manager
            .lease_project_command(project_path)
            .map_err(|error| KernelError::Config {
                name: "plugin-manager".into(),
                message: error.to_string(),
            })?;
        // Child-loader reconciliation is synchronous, while plugin application runs on the
        // shared kernel driver. Settle it before dispatch so the first project call is real.
        self.app.flush().await;
        self.app
            .ctx()
            .with_command_realm(CommandRealm::project(project_path))
            .call(name, args)
            .await
    }

    /// Look a service up by type — for in-process callers (the TUI, tests) that would rather have
    /// the real thing than a JSON round trip.
    pub fn service<S: codetwo_kernel::Service>(&self) -> Option<Arc<S>> {
        self.app.ctx().get::<S>()
    }

    /// Wait for the graph to settle after a change.
    pub async fn flush(&self) {
        self.app.flush().await;
    }

    /// Every plugin instance and its status.
    pub fn scopes(&self) -> Vec<ScopeInfo> {
        self.app.runtime().scopes()
    }

    /// Every live service.
    pub fn services(&self) -> Vec<ServiceInfo> {
        self.app.runtime().services()
    }

    /// Every command the running graph offers.
    pub fn commands(&self) -> Vec<CommandInfo> {
        self.app.runtime().commands()
    }

    /// Unload everything, in reverse.
    pub async fn stop(&self) {
        self.plugin_manager.shutdown_projects();
        self.app.stop().await;
    }
}

/// The smallest graph that can keep every management-plane plugin alive in safe mode.
///
/// Required injection names that also name a registered factory are plugin dependencies and are
/// followed transitively. Names with no factory are root/host-provided services. Optional
/// injections and unrelated default-enabled plugins deliberately stay outside safe mode.
fn safe_mode_entries(
    registry: &codetwo_kernel::PluginRegistry,
    defaults: &LoaderConfig,
) -> Vec<(String, PluginEntry)> {
    let mut included = registry
        .factories()
        .filter(|factory| factory.metadata.essential || factory.name == "kernel")
        .map(|factory| factory.name.clone())
        .collect::<BTreeSet<_>>();

    loop {
        let required = included
            .iter()
            .filter_map(|name| registry.get(name))
            .flat_map(|factory| factory.dependencies.required.iter())
            .filter(|name| registry.get(name).is_some())
            .cloned()
            .collect::<Vec<_>>();
        let before = included.len();
        included.extend(required);
        if included.len() == before {
            break;
        }
    }

    included
        .into_iter()
        .map(|name| {
            let mut entry = defaults.plugins.get(&name).cloned().unwrap_or_default();
            entry.enabled = true;
            (name, entry)
        })
        .collect()
}

fn apply_persisted_user_policy(
    config: &mut LoaderConfig,
    registry: &codetwo_kernel::PluginRegistry,
    store: &PluginConfigStore,
) {
    for factory in registry.factories() {
        let base = config
            .plugins
            .get(&factory.name)
            .map(|entry| entry.enabled)
            .unwrap_or(false);
        let policy = store.policy(&PluginScope::User, &factory.name);
        let enabled = policy.state.resolve(base);
        if base || policy.state != PluginOverride::Inherit || policy.config.is_some() {
            let entry = config.plugins.entry(factory.name.clone()).or_default();
            entry.enabled = if factory.metadata.essential {
                true
            } else {
                enabled
            };
            if let Some(plugin_config) = policy.config {
                entry.config = plugin_config;
            }
        }
    }
}
