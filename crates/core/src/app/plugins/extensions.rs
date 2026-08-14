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

use crate::app::events::{EngineEvent, PluginsChanged, ScenesChanged, SkillsChanged};
use crate::app::json;
use crate::app::protocol::ProtocolPlugin;
use crate::app::service::PluginHub;
use codetwo_kernel::{async_trait, Context, Injection, Plugin, PluginResult};
use serde::Deserialize;
use serde_json::{json as jval, Value};

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
        Injection::required(["plugin-hub"])
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

        publish_host_events(&ctx);

        let mut started = Vec::new();
        let mut skipped = Vec::new();
        for installed in hub.installed() {
            let Some(spec) = installed.runtime.clone() else {
                continue;
            };
            if !installed.enabled {
                continue;
            }
            if !installed.trusted && !config.allow_untrusted {
                // Not an error: this is the system working. Say it out loud so the UI can offer
                // the one action that changes it.
                skipped.push(installed.id.clone());
                tracing::info!(
                    plugin = %installed.id,
                    "ships a process but is not trusted — not started"
                );
                continue;
            }
            let bundle_dir = hub.dir.join(&installed.id).join("bundle");
            let data_dir = hub.dir.join(".data").join(&installed.id);
            // Loaded as a *child* of this scope, so unloading `extensions` — or losing the hub —
            // stops every third-party process with it.
            ctx.plugin(
                ProtocolPlugin::from_spec(&installed.id, &spec, bundle_dir, data_dir)
                    .with_description(installed.description.clone()),
                Value::Null,
            );
            started.push(installed.id);
        }

        let report_started = started.clone();
        let report_skipped = skipped.clone();
        ctx.command_described(
            "extensions.list",
            Some("Bundles that ship a process: which are running, which are waiting for trust."),
            move |_| {
                let started = report_started.clone();
                let skipped = report_skipped.clone();
                async move { json(jval!({ "running": started, "untrusted": skipped })) }
            },
        )?;

        // Installing, removing, enabling or trusting a bundle changes what should be running.
        // Rather than reconciling by hand, ask for the rebuild the kernel already knows how to do.
        let weak = ctx.weak();
        ctx.on::<PluginsChanged, _>(move |_| {
            if let Some(ctx) = weak.upgrade() {
                ctx.reload();
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
