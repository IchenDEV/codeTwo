//! Two plugin managers, one for each meaning of the word.
//!
//! [`HubPlugin`] manages **installed bundles** — the data packages users get from GitHub (skills,
//! subagents, MCP servers, scenes, scaffolds). Nothing in them executes in this process.
//!
//! [`KernelPlugin`] manages **running plugins** — the kernel graph itself, exposed as commands so
//! the app can show what is loaded, why something is pending, and turn pieces of itself on and off
//! while it runs. Cordis calls this the loader's inspector; it is the thing that makes a plugin
//! system feel like one rather than like a build-time convention.

use crate::app::events::PluginsChanged;
use crate::app::service::{LoaderService, Paths, PluginHub};
use crate::app::{json, take_args};
use crate::plugin;
use codetwo_kernel::{async_trait, Context, Injection, Plugin, PluginError, PluginResult};
use serde::Deserialize;
use serde_json::{json as jval, Value};
use std::sync::Arc;

#[derive(Deserialize)]
struct IdArgs {
    id: String,
}

#[derive(Deserialize)]
struct FlagArgs {
    id: String,
    value: bool,
}

// ---- installed bundles ------------------------------------------------------------------------

pub struct HubPlugin;

#[async_trait]
impl Plugin for HubPlugin {
    fn name(&self) -> &str {
        "plugin-hub"
    }

    fn description(&self) -> Option<&str> {
        Some("Installed plugin bundles: skills, subagents, MCP servers, scenes, scaffolds.")
    }

    fn inject(&self) -> Injection {
        Injection::required(["paths"])
    }

    async fn apply(&self, ctx: Context, _config: Value) -> PluginResult {
        let paths = ctx.expect::<Paths>()?;
        let hub = Arc::new(PluginHub { dir: paths.plugins() });
        ctx.provide(hub.clone())?;

        // Changing the installed set invalidates the skill and scene libraries; they listen.
        let announce = {
            let weak = ctx.weak();
            move || {
                let weak = weak.clone();
                tokio::spawn(async move {
                    if let Some(ctx) = weak.upgrade() {
                        ctx.emit(PluginsChanged).await;
                    }
                });
            }
        };

        let listed = hub.clone();
        ctx.command("plugins.list", move |_| {
            let hub = listed.clone();
            async move { json(hub.installed()) }
        })?;

        let enabled = hub.clone();
        let after_enable = announce.clone();
        ctx.command("plugins.set_enabled", move |args| {
            let hub = enabled.clone();
            let announce = after_enable.clone();
            async move {
                let args: FlagArgs = take_args(args)?;
                let plugin = plugin::set_enabled(&hub.dir, &args.id, args.value)
                    .map_err(PluginError::new)?;
                announce();
                json(plugin)
            }
        })?;

        let trusted = hub.clone();
        ctx.command("plugins.set_trusted", move |args| {
            let hub = trusted.clone();
            async move {
                let args: FlagArgs = take_args(args)?;
                json(
                    plugin::set_trusted(&hub.dir, &args.id, args.value)
                        .map_err(PluginError::new)?,
                )
            }
        })?;

        let removed = hub.clone();
        ctx.command("plugins.uninstall", move |args| {
            let hub = removed.clone();
            let announce = announce.clone();
            async move {
                let args: IdArgs = take_args(args)?;
                plugin::uninstall(&hub.dir, &args.id).map_err(PluginError::new)?;
                announce();
                Ok(Value::Bool(true))
            }
        })?;

        ctx.command("plugins.scene_dirs", move |_| {
            let hub = hub.clone();
            async move {
                json(
                    hub.scene_dirs()
                        .into_iter()
                        .map(|(id, dir)| jval!({ "id": id, "dir": dir }))
                        .collect::<Vec<_>>(),
                )
            }
        })?;
        Ok(())
    }
}

// ---- the running graph ------------------------------------------------------------------------

/// Exposes the kernel to the app: what is loaded, what is waiting, what each plugin contributed,
/// and the switches to change it without a restart.
pub struct KernelPlugin;

#[async_trait]
impl Plugin for KernelPlugin {
    fn name(&self) -> &str {
        "kernel"
    }

    fn description(&self) -> Option<&str> {
        Some("Inspect and control the running plugin graph.")
    }

    fn inject(&self) -> Injection {
        Injection::required(["loader"])
    }

    async fn apply(&self, ctx: Context, _config: Value) -> PluginResult {
        let loader = ctx.expect::<LoaderService>()?;

        let runtime = ctx.runtime().clone();
        ctx.command_described(
            "kernel.scopes",
            Some("Every plugin instance, its status, and why it is pending."),
            move |_| {
                let runtime = runtime.clone();
                async move { json(runtime.scopes()) }
            },
        )?;

        let runtime = ctx.runtime().clone();
        ctx.command("kernel.services", move |_| {
            let runtime = runtime.clone();
            async move { json(runtime.services()) }
        })?;

        let runtime = ctx.runtime().clone();
        ctx.command("kernel.commands", move |_| {
            let runtime = runtime.clone();
            async move { json(runtime.commands()) }
        })?;

        let listed = loader.clone();
        ctx.command_described(
            "kernel.plugins",
            Some("Everything installable, running or not, with its config schema."),
            move |_| {
                let loader = listed.clone();
                async move {
                    let entries = loader.0.lock().unwrap().entries();
                    json(entries)
                }
            },
        )?;

        #[derive(Deserialize)]
        struct EnableArgs {
            name: String,
            value: bool,
        }
        let toggled = loader.clone();
        ctx.command_described(
            "kernel.set_enabled",
            Some("Load or unload one plugin, live."),
            move |args| {
                let loader = toggled.clone();
                async move {
                    let args: EnableArgs = take_args(args)?;
                    let errors = loader.0.lock().unwrap().set_enabled(&args.name, args.value);
                    report(errors)
                }
            },
        )?;

        #[derive(Deserialize)]
        struct ConfigureArgs {
            name: String,
            config: Value,
        }
        ctx.command_described(
            "kernel.configure",
            Some("Replace one plugin's config; it reloads, nothing else does."),
            move |args| {
                let loader = loader.clone();
                async move {
                    let args: ConfigureArgs = take_args(args)?;
                    let errors = loader.0.lock().unwrap().reconfigure(&args.name, args.config);
                    report(errors)
                }
            },
        )?;
        Ok(())
    }
}

/// A config edit that names a plugin nobody registered is reported, not fatal — the rest of the
/// edit still applied.
fn report(errors: Vec<codetwo_kernel::KernelError>) -> Result<Value, PluginError> {
    if errors.is_empty() {
        return Ok(Value::Bool(true));
    }
    Err(PluginError::new(
        errors.iter().map(ToString::to_string).collect::<Vec<_>>().join("; "),
    ))
}
