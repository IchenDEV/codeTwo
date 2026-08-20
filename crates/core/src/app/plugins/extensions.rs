//! Third-party plugins: the bridge between installed bundles and the running graph.
//!
//! This is where the two senses of "plugin" finally meet. `plugin-hub` manages *bundles* — data a
//! user installed from GitHub. This plugin looks through them for the ones that ship a `runtime`
//! block, and loads each as a real member of the kernel graph over
//! [the plugin protocol](crate::app::protocol).
//!
//! It also publishes the host's typed events onto the JSON bus, because a plugin in another
//! process cannot listen for a Rust type. That republication is deliberately explicit and small:
//! it is the app's public event surface, and it should be chosen rather than leaked.

use crate::app::bundle_runtime::ExtensionRuntimeHost;
use crate::app::events::{EngineEvent, PluginsChanged, ScenesChanged, SkillsChanged};
use crate::app::json;
use crate::app::service::PluginHub;
use crate::app::PluginManager;
use codetwo_kernel::{async_trait, Context, Injection, Plugin, PluginResult};
use serde::Deserialize;
use serde_json::{json as jval, Value};
use std::sync::Arc;

#[derive(Debug, Deserialize)]
struct Config {
    /// Run plugins the user has not marked trusted. Off, and it should stay off outside
    /// development: a bundle's `runtime` block is arbitrary code.
    #[serde(default)]
    allow_untrusted: bool,
}

impl Default for Config {
    fn default() -> Self {
        Config {
            allow_untrusted: false,
        }
    }
}

pub struct ExtensionsPlugin;

#[async_trait]
impl Plugin for ExtensionsPlugin {
    fn name(&self) -> &str {
        "extensions"
    }

    fn description(&self) -> Option<&str> {
        Some("Runs installed plugin bundles that ship a process, over the plugin protocol.")
    }

    fn inject(&self) -> Injection {
        Injection::required(["plugin-hub", "plugin-manager"])
    }

    fn schema(&self) -> Option<Value> {
        Some(jval!({
            "type": "object",
            "properties": {
                "allow_untrusted": {
                    "type": "boolean",
                    "default": false,
                    "title": "Run untrusted plugins",
                    "description": "Development only. A bundle's runtime block is arbitrary code."
                }
            }
        }))
    }

    async fn apply(&self, ctx: Context, config: Value) -> PluginResult {
        let config: Config = serde_json::from_value(config).unwrap_or_default();
        let hub = ctx.expect::<PluginHub>()?;
        let manager = ctx.expect::<PluginManager>()?;

        ctx.provide(Arc::new(ExtensionRuntimeHost))?;
        publish_host_events(&ctx);
        if config.allow_untrusted {
            tracing::warn!(
                "extensions.allow_untrusted is deprecated; trust remains a hard execution gate"
            );
        }
        {
            let _inventory = hub.inventory.lock().await;
            manager
                .sync_installed_bundles(&hub.dir)
                .map_err(codetwo_kernel::PluginError::new)?;
        }

        let runtime = ctx.runtime().clone();
        let listed_hub = hub.clone();
        ctx.command_described(
            "extensions.list",
            Some("Bundles that ship a process: which are running, which are waiting for trust."),
            move |_| {
                let runtime = runtime.clone();
                let hub = listed_hub.clone();
                async move {
                    let installed = hub.installed();
                    let running = runtime
                        .scopes()
                        .into_iter()
                        .filter(|scope| {
                            scope.status == codetwo_kernel::Status::Active
                                && scope.command_realm == codetwo_kernel::CommandRealm::Global
                                && scope.plugin.starts_with("bundle:")
                        })
                        .filter_map(|scope| {
                            scope.plugin.strip_prefix("bundle:").map(str::to_string)
                        })
                        .collect::<Vec<_>>();
                    let untrusted = installed
                        .into_iter()
                        .filter(|plugin| plugin.runtime.is_some() && !plugin.trusted)
                        .map(|plugin| plugin.id)
                        .collect::<Vec<_>>();
                    json(jval!({ "running": running, "untrusted": untrusted }))
                }
            },
        )?;

        // The installed directory is an external desired set. Reconcile it into ordinary loader
        // factories so plans, project realms, fallback blockers and teardown all use one path.
        let manager = manager.clone();
        let hub = hub.clone();
        ctx.on::<PluginsChanged, _>(move |_| {
            // Hub mutations hold this lock through their own reconcile and flush, so their
            // notification is already current. An independently emitted notification acquires
            // the lock here and reconciles one stable filesystem snapshot.
            let Ok(_inventory) = hub.inventory.try_lock() else {
                return None;
            };
            if let Err(error) = manager.sync_installed_bundles(&hub.dir) {
                tracing::error!(%error, "could not reconcile installed plugin runtimes");
            }
            None
        });
        Ok(())
    }
}

/// The host's public event surface, in the form a process in another language can consume.
///
/// Typed Rust events do not cross a pipe. Each of these is a deliberate choice to expose one —
/// the list is the contract, and adding to it is an API decision.
fn publish_host_events(ctx: &Context) {
    let weak = ctx.weak();
    ctx.on_async::<EngineEvent, _, _>(move |event| {
        let weak = weak.clone();
        async move {
            let Some(ctx) = weak.upgrade() else {
                return None;
            };
            if let Ok(payload) = serde_json::to_value(&event.0) {
                ctx.emit_json("engine/event", payload).await;
            }
            None
        }
    });

    let weak = ctx.weak();
    ctx.on_async::<SkillsChanged, _, _>(move |_| {
        let weak = weak.clone();
        async move {
            if let Some(ctx) = weak.upgrade() {
                ctx.emit_json("skills/changed", Value::Null).await;
            }
            None
        }
    });

    let weak = ctx.weak();
    ctx.on_async::<ScenesChanged, _, _>(move |_| {
        let weak = weak.clone();
        async move {
            if let Some(ctx) = weak.upgrade() {
                ctx.emit_json("scenes/changed", Value::Null).await;
            }
            None
        }
    });
}
