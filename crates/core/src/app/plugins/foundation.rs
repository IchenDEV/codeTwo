//! The bottom of the graph: paths, storage, the event bus, and the provider registry.
//!
//! Nothing here is new behaviour. It is the same construction the old desktop setup did in a fixed
//! order, split into four plugins that declare what they need and are free to load in any order —
//! or not at all. An app without `store` is a real configuration now, not a code path nobody
//! tested: everything that needs storage simply stays pending.

use crate::app::service::{EventBus, Paths, ProviderService, StoreService};
use crate::app::{json, take_args};
use crate::host_tools::HostToolDiscovery;
use crate::provider::default_registry;
use crate::provider_lifecycle::{ProviderLifecycleAction, ProviderLifecycleManager};
use crate::store::Store;
use codetwo_kernel::{async_trait, Context, Injection, Plugin, PluginError, PluginResult};
use serde::Deserialize;
use serde_json::{json as jval, Value};
use std::sync::Arc;

pub(crate) fn now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// ---- paths ------------------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
struct PathsConfig {
    data_dir: String,
}

/// Publishes the data directory every other plugin derives its paths from.
pub struct PathsPlugin;

#[async_trait]
impl Plugin for PathsPlugin {
    fn name(&self) -> &str {
        "paths"
    }

    fn description(&self) -> Option<&str> {
        Some("Where C2 keeps its data on disk.")
    }

    fn schema(&self) -> Option<Value> {
        Some(jval!({
            "type": "object",
            "required": ["data_dir"],
            "properties": { "data_dir": { "type": "string", "title": "Data directory" } }
        }))
    }

    async fn apply(&self, ctx: Context, config: Value) -> PluginResult {
        let config: PathsConfig = serde_json::from_value(config)
            .map_err(|error| PluginError::new(format!("paths needs a data_dir: {error}")))?;
        std::fs::create_dir_all(&config.data_dir)?;
        ctx.provide(Arc::new(Paths::new(config.data_dir)))?;
        Ok(())
    }
}

// ---- store ------------------------------------------------------------------------------------

#[derive(Debug, Default, Deserialize)]
struct StoreConfig {
    /// Overrides `<data_dir>/codetwo.db`. `":memory:"` gives an ephemeral store — which is how
    /// tests boot the whole app without touching disk.
    #[serde(default)]
    path: Option<String>,
}

/// SQLite: sessions, transcripts, project memory, artifacts, usage.
pub struct StorePlugin;

#[async_trait]
impl Plugin for StorePlugin {
    fn name(&self) -> &str {
        "store"
    }

    fn description(&self) -> Option<&str> {
        Some("Persistent storage for sessions, transcripts, memory and artifacts.")
    }

    fn inject(&self) -> Injection {
        Injection::required(["paths"])
    }

    fn schema(&self) -> Option<Value> {
        Some(jval!({
            "type": "object",
            "properties": {
                "path": { "type": "string", "title": "Database file", "description": "`:memory:` for an ephemeral store" }
            }
        }))
    }

    async fn apply(&self, ctx: Context, config: Value) -> PluginResult {
        let config: StoreConfig = serde_json::from_value(config).unwrap_or_default();
        let paths = ctx.expect::<Paths>()?;
        let path = config
            .path
            .unwrap_or_else(|| paths.db().to_string_lossy().into_owned());

        let store = if path == ":memory:" {
            Store::open_in_memory()
        } else {
            Store::open(&path)
        }
        .map_err(|error| PluginError::new(format!("couldn't open {path}: {error}")))?;
        let store = Arc::new(store);

        if let Err(error) = store.purge_expired_canvases(now_millis()) {
            tracing::warn!("canvas tombstone cleanup failed: {error}");
        }
        // Any run still marked active belongs to a process that is gone. Saying so at startup is
        // the honest reconciliation; leaving it "running" forever is not.
        if let Err(error) = store.interrupt_active_automation_runs(now_millis()) {
            tracing::warn!("automation startup reconciliation failed: {error}");
        }
        if let Err(error) = store.purge_transient_sessions() {
            tracing::warn!("transient session startup cleanup failed: {error}");
        }

        ctx.provide(Arc::new(StoreService(store.clone())))?;

        let sessions = store.clone();
        ctx.command("store.sessions", move |_| {
            let store = sessions.clone();
            async move { json(store.list_sessions().map_err(PluginError::new)?) }
        })?;

        #[derive(Deserialize)]
        struct SessionArgs {
            id: String,
        }
        ctx.command("store.session", move |args| {
            let store = store.clone();
            async move {
                let args: SessionArgs = take_args(args)?;
                json(store.get_session(&args.id).map_err(PluginError::new)?)
            }
        })?;
        Ok(())
    }
}

// ---- event bus --------------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
struct BusConfig {
    #[serde(default = "default_capacity")]
    capacity: usize,
}

fn default_capacity() -> usize {
    1024
}

impl Default for BusConfig {
    fn default() -> Self {
        BusConfig {
            capacity: default_capacity(),
        }
    }
}

/// The agent-loop event fan-out. Separate from the engine on purpose: subscribers (the desktop
/// pump, the remote server, the cost tracker) attach to the bus, not to the engine, so the engine
/// can reload underneath them.
pub struct BusPlugin;

#[async_trait]
impl Plugin for BusPlugin {
    fn name(&self) -> &str {
        "bus"
    }

    fn description(&self) -> Option<&str> {
        Some("Broadcast fan-out for engine events.")
    }

    fn schema(&self) -> Option<Value> {
        Some(jval!({
            "type": "object",
            "properties": { "capacity": { "type": "integer", "minimum": 16, "default": 1024 } }
        }))
    }

    async fn apply(&self, ctx: Context, config: Value) -> PluginResult {
        let config: BusConfig = serde_json::from_value(config).unwrap_or_default();
        ctx.provide(Arc::new(EventBus::new(config.capacity)))?;
        Ok(())
    }
}

// ---- providers --------------------------------------------------------------------------------

/// The provider registry — one immutable startup snapshot, as before. Reconfiguring this plugin is
/// how you re-probe, instead of restarting the app.
pub struct ProvidersPlugin;

#[async_trait]
impl Plugin for ProvidersPlugin {
    fn name(&self) -> &str {
        "providers"
    }

    fn description(&self) -> Option<&str> {
        Some("Which coding CLIs can be launched, and what they can do.")
    }

    fn inject(&self) -> Injection {
        Injection::required(["paths"])
    }

    async fn apply(&self, ctx: Context, _config: Value) -> PluginResult {
        let paths = ctx.expect::<Paths>()?;
        let host_tools = HostToolDiscovery::detect(&paths.data_dir);
        let lifecycle = ProviderLifecycleManager::open(&paths.data_dir);
        let providers = lifecycle.prepare_registry(default_registry());
        let service = Arc::new(ProviderService::new(providers, host_tools, lifecycle));

        #[derive(Deserialize)]
        struct ProviderListArgs {
            #[serde(default)]
            check_updates: bool,
        }
        let listed = service.clone();
        ctx.command("providers.list", move |args| {
            let service = listed.clone();
            async move {
                let args: ProviderListArgs = take_args(args)?;
                json(service.summaries_with_updates(args.check_updates).await)
            }
        })?;

        #[derive(Deserialize)]
        struct ProviderEnabledArgs {
            provider: String,
            enabled: bool,
        }
        #[derive(Deserialize)]
        struct ProviderActionArgs {
            provider: String,
        }

        let enabled_service = service.clone();
        let enabled_context = ctx.clone();
        ctx.command("providers.set_enabled", move |args| {
            let service = enabled_service.clone();
            let context = enabled_context.clone();
            async move {
                let args: ProviderEnabledArgs = take_args(args)?;
                service
                    .lifecycle()
                    .set_enabled(&args.provider, args.enabled)
                    .map_err(PluginError::new)?;
                let summaries = service.summaries().await;
                context.reload();
                json(summaries)
            }
        })?;

        let install_service = service.clone();
        let install_context = ctx.clone();
        ctx.command("providers.install", move |args| {
            let service = install_service.clone();
            let context = install_context.clone();
            async move {
                let args: ProviderActionArgs = take_args(args)?;
                service
                    .lifecycle()
                    .apply(&args.provider, ProviderLifecycleAction::Install)
                    .await
                    .map_err(PluginError::new)?;
                let summaries = service.summaries().await;
                context.reload();
                json(summaries)
            }
        })?;

        let upgrade_service = service.clone();
        let upgrade_context = ctx.clone();
        ctx.command("providers.upgrade", move |args| {
            let service = upgrade_service.clone();
            let context = upgrade_context.clone();
            async move {
                let args: ProviderActionArgs = take_args(args)?;
                service
                    .lifecycle()
                    .apply(&args.provider, ProviderLifecycleAction::Upgrade)
                    .await
                    .map_err(PluginError::new)?;
                let summaries = service.summaries().await;
                context.reload();
                json(summaries)
            }
        })?;

        let settings = service.clone();
        ctx.command("computer_use.settings", move |_| {
            let settings = settings.clone();
            async move { json(settings.computer_use_settings()) }
        })?;

        #[derive(Deserialize)]
        struct ComputerUseSelectionArgs {
            backend: String,
        }
        #[derive(Deserialize)]
        struct BrowserUseSelectionArgs {
            backend: String,
        }
        let selection_path = paths.data_dir.clone();
        let selected = service.clone();
        ctx.command("computer_use.select", move |args| {
            let path = selection_path.clone();
            let selected = selected.clone();
            async move {
                let args: ComputerUseSelectionArgs = take_args(args)?;
                HostToolDiscovery::select_computer_use_backend(&path, &args.backend)
                    .map_err(PluginError::new)?;
                selected.refresh_host_tools(HostToolDiscovery::detect(&path));
                json(selected.computer_use_settings())
            }
        })?;

        let browser_settings = service.clone();
        ctx.command("browser_use.settings", move |_| {
            let settings = browser_settings.clone();
            async move { json(settings.browser_use_settings()) }
        })?;

        let browser_selection_path = paths.data_dir.clone();
        let browser_selected = service.clone();
        ctx.command("browser_use.select", move |args| {
            let path = browser_selection_path.clone();
            let selected = browser_selected.clone();
            async move {
                let args: BrowserUseSelectionArgs = take_args(args)?;
                HostToolDiscovery::select_browser_use_backend(&path, &args.backend)
                    .map_err(PluginError::new)?;
                selected.refresh_host_tools(HostToolDiscovery::detect(&path));
                json(selected.browser_use_settings())
            }
        })?;

        ctx.provide(service)?;
        Ok(())
    }
}
