//! Code2 as a plugin graph.
//!
//! # What changed
//!
//! Code2 used to *be* a program with extension points: a `setup()` that constructed subsystems in
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
//! - **One extension surface.** A plugin's commands *are* the app's public API. The Tauri bridge
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

pub mod events;
pub mod plugins;
pub mod protocol;
mod service;

pub use service::{
    CanvasService, CostService, EngineService, EventBus, KeymapService, LoaderService, Paths,
    PluginHub, ProviderService, ProviderSummary, SceneRuntimeService, SceneService, SkillService,
    StoreService, TerminalEvent, TerminalService,
};

use codetwo_kernel::{
    App, CommandInfo, Context, KernelError, Loader, LoaderConfig, PluginEntry, PluginError,
    ScopeInfo, ServiceInfo,
};
use serde::de::DeserializeOwned;
use serde::Serialize;
use serde_json::Value;
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
        AppConfig { plugins }
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

/// A booted Code2: the kernel, the loader, and the root context.
///
/// Frontends hold one of these instead of an `AppState`. What they can do is whatever the loaded
/// plugins registered — discoverable at runtime through [`CoreApp::commands`].
pub struct CoreApp {
    app: App,
    loader: Arc<Mutex<Loader>>,
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
        config: AppConfig,
        registry: codetwo_kernel::PluginRegistry,
    ) -> Result<CoreApp, KernelError> {
        let app = App::new();
        let loader = Arc::new(Mutex::new(Loader::new(app.ctx(), registry)));
        app.ctx().provide(Arc::new(LoaderService(loader.clone())))?;

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
        Ok(CoreApp { app, loader })
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

    /// Invoke a plugin-contributed command. This is the whole app surface.
    pub async fn call(&self, name: &str, args: Value) -> Result<Value, KernelError> {
        self.app.ctx().call(name, args).await
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
        self.app.stop().await;
    }
}
