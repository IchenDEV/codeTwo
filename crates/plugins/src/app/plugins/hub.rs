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
use crate::app::plugins::plugin_development;
use crate::app::service::{LoaderService, Paths, PluginHub};
use crate::app::{json, take_args, PluginChangeRequest, PluginManager, PluginScope};
use crate::bundle as plugin;
use crate::bundle::{InstalledPlugin, PluginCounts, PluginScaffold};
use crate::marketplace::{self as plugin_marketplace, MarketplacePluginSource};
use codetwo_core::github_skills;
use codetwo_kernel::{
    async_trait, CommandRealm, Context, Injection, Plugin, PluginError, PluginResult,
    PluginScopeSupport, WeakContext,
};
use serde::{Deserialize, Serialize};
use serde_json::{json as jval, Value};
use std::path::{Path, PathBuf};
use std::sync::Arc;

#[derive(Deserialize)]
struct IdArgs {
    id: String,
    #[serde(default)]
    keep_data: bool,
}

#[derive(Serialize)]
struct PluginScaffoldInfo {
    id: String,
    name: String,
    description: String,
    files: usize,
}

impl From<PluginScaffold> for PluginScaffoldInfo {
    fn from(scaffold: PluginScaffold) -> Self {
        Self {
            id: scaffold.id,
            name: scaffold.name,
            description: scaffold.description,
            files: scaffold.files,
        }
    }
}

#[derive(Serialize)]
struct PluginInfo {
    id: String,
    name: String,
    version: String,
    description: String,
    author: String,
    source: String,
    repository: String,
    standard_version: String,
    enabled: bool,
    trusted: bool,
    scope: plugin::PluginInstallScope,
    counts: PluginCounts,
    scaffolds: Vec<PluginScaffoldInfo>,
    extension_components: Vec<plugin::PluginExtensionComponent>,
    #[serde(skip_serializing_if = "Option::is_none")]
    runtime_commands: Option<Vec<plugin::PluginRuntimeCommand>>,
    ui_contributions: Vec<plugin::PluginUiContribution>,
    lsp_servers: Vec<plugin::PluginLspServer>,
    diagnostics: Vec<plugin::PluginDiagnostic>,
}

impl From<InstalledPlugin> for PluginInfo {
    fn from(plugin: InstalledPlugin) -> Self {
        Self {
            id: plugin.id,
            name: plugin.name,
            version: plugin.version,
            description: plugin.description,
            author: plugin.author,
            source: plugin.source,
            repository: plugin.repository,
            standard_version: plugin.standard_version,
            enabled: plugin.enabled,
            trusted: plugin.trusted,
            scope: plugin.scope,
            counts: plugin.counts,
            scaffolds: plugin.scaffolds.into_iter().map(Into::into).collect(),
            extension_components: plugin.extension_components,
            runtime_commands: plugin.runtime_commands,
            ui_contributions: plugin.ui_contributions,
            lsp_servers: plugin.lsp_servers,
            diagnostics: plugin.diagnostics,
        }
    }
}

#[derive(Serialize)]
struct PluginImportResult {
    plugin: PluginInfo,
}

#[derive(Deserialize)]
struct FlagArgs {
    id: String,
    value: bool,
}

async fn reconcile_and_announce(
    manager: &PluginManager,
    hub: &PluginHub,
    context: &WeakContext,
) -> PluginResult {
    manager
        .sync_installed_bundles(&hub.dir)
        .map_err(PluginError::new)?;
    if let Some(context) = context.upgrade() {
        context.emit(PluginsChanged).await;
        context.flush().await;
    }
    Ok(())
}

fn validate_marketplace_identity(
    catalog_name: &str,
    catalog_version: &str,
    bundle_name: &str,
    bundle_version: &str,
) -> PluginResult {
    if bundle_name != catalog_name {
        return Err(PluginError::new(format!(
            "Marketplace plugin name {catalog_name} does not match bundle name {bundle_name}"
        )));
    }
    if bundle_version != catalog_version {
        return Err(PluginError::new(format!(
            "Marketplace version {catalog_version} does not match bundle version {bundle_version}"
        )));
    }
    Ok(())
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
        Injection::required(["paths", "plugin-manager"])
    }

    async fn apply(&self, ctx: Context, _config: Value) -> PluginResult {
        let paths = ctx.expect::<Paths>()?;
        let manager = ctx.expect::<PluginManager>()?;
        let hub = Arc::new(PluginHub {
            dir: paths.plugins(),
            inventory: tokio::sync::Mutex::new(()),
        });
        ctx.provide(hub.clone())?;
        {
            let _inventory = hub.inventory.lock().await;
            manager
                .sync_installed_bundles(&hub.dir)
                .map_err(PluginError::new)?;
        }
        plugin_development::register(&ctx, manager.clone(), hub.clone()).await?;
        let reconcile_context = ctx.weak();

        let listed = hub.clone();
        ctx.command("plugins.list", move |_| {
            let hub = listed.clone();
            async move {
                let _inventory = hub.inventory.lock().await;
                json(
                    hub.installed()
                        .into_iter()
                        .map(PluginInfo::from)
                        .collect::<Vec<_>>(),
                )
            }
        })?;

        #[derive(Deserialize)]
        struct InvokeUiArgs {
            plugin_id: String,
            contribution_id: String,
            #[serde(default)]
            context: Value,
        }
        let invoking = hub.clone();
        let invoke_context = ctx.weak();
        ctx.command_with_realm("plugins.invoke_ui", move |caller_realm, args| {
            let hub = invoking.clone();
            let context = invoke_context.clone();
            async move {
                let args: InvokeUiArgs = take_args(args)?;
                let plugin = {
                    let _inventory = hub.inventory.lock().await;
                    hub.installed()
                        .into_iter()
                        .find(|plugin| plugin.id == args.plugin_id)
                }
                .ok_or_else(|| PluginError::new(format!("unknown plugin `{}`", args.plugin_id)))?;
                if !plugin.enabled || !plugin.trusted {
                    return Err(PluginError::new(format!(
                        "plugin `{}` is not enabled and trusted",
                        plugin.id
                    )));
                }
                let runtime = plugin.runtime.as_ref().ok_or_else(|| {
                    PluginError::new(format!("plugin `{}` has no process runtime", plugin.id))
                })?;
                let contribution = plugin
                    .ui_contributions
                    .iter()
                    .find(|contribution| contribution.id == args.contribution_id)
                    .ok_or_else(|| {
                        PluginError::new(format!(
                            "unknown UI contribution `{}` for plugin `{}`",
                            args.contribution_id, plugin.id
                        ))
                    })?;
                let target_realm = match caller_realm {
                    CommandRealm::Project(project)
                        if runtime.scope_support.contains(&PluginScopeSupport::Project) =>
                    {
                        CommandRealm::Project(project)
                    }
                    _ => CommandRealm::Global,
                };
                let context = context
                    .upgrade()
                    .ok_or_else(|| PluginError::new("plugin runtime is unavailable"))?;
                let owner = format!("bundle:{}", plugin.id);
                let registered = context.runtime().commands().into_iter().any(|command| {
                    command.name == contribution.command
                        && command.realm == target_realm
                        && command.plugin == owner
                });
                if !registered {
                    return Err(PluginError::new(format!(
                        "UI contribution `{}` does not reference an active command owned by plugin `{}` in this scope",
                        contribution.id, plugin.id
                    )));
                }
                let activation_context = match args.context {
                    Value::Object(context) => Value::Object(context),
                    _ => Value::Object(Default::default()),
                };
                context
                    .with_command_realm(target_realm)
                    .call(
                        &contribution.command,
                        jval!({
                            "context": activation_context,
                            "input": contribution.input,
                        }),
                    )
                    .await
                    .map_err(PluginError::new)
            }
        })?;

        #[derive(Deserialize)]
        struct ImportArgs {
            repository: String,
        }
        let importing = hub.clone();
        let import_manager = manager.clone();
        let import_context = reconcile_context.clone();
        ctx.command("plugins.import_github", move |args| {
            let hub = importing.clone();
            let manager = import_manager.clone();
            let context = import_context.clone();
            async move {
                let args: ImportArgs = take_args(args)?;
                let checkout = github_skills::checkout(&args.repository)
                    .await
                    .map_err(PluginError::new)?;
                let bundle = plugin::from_github(&checkout).map_err(PluginError::new)?;
                let _inventory = hub.inventory.lock().await;
                let installed = plugin::install(&hub.dir, bundle).map_err(PluginError::new)?;
                reconcile_and_announce(&manager, &hub, &context).await?;
                json(PluginImportResult {
                    plugin: installed.into(),
                })
            }
        })?;

        #[derive(Deserialize)]
        struct MarketplacePathArgs {
            path: String,
        }
        ctx.command("plugins.read_marketplace", move |args| async move {
            let args: MarketplacePathArgs = take_args(args)?;
            json(plugin_marketplace::load(Path::new(&args.path)).map_err(PluginError::new)?)
        })?;

        #[derive(Deserialize)]
        struct MarketplaceInstallArgs {
            marketplace_path: String,
            plugin_name: String,
        }
        let marketplace_hub = hub.clone();
        let marketplace_manager = manager.clone();
        let marketplace_context = reconcile_context.clone();
        ctx.command("plugins.install_marketplace", move |args| {
            let hub = marketplace_hub.clone();
            let manager = marketplace_manager.clone();
            let context = marketplace_context.clone();
            async move {
                let args: MarketplaceInstallArgs = take_args(args)?;
                let marketplace = plugin_marketplace::load(Path::new(&args.marketplace_path))
                    .map_err(PluginError::new)?;
                let entry = plugin_marketplace::plugin(&marketplace, &args.plugin_name)
                    .map_err(PluginError::new)?;
                if !entry.installable {
                    return Err(PluginError::new(entry.diagnostic.clone().unwrap_or_else(
                        || "Marketplace plugin source is not installable".into(),
                    )));
                }
                let source_label = format!("Marketplace · {}", marketplace.display_name);
                let mut bundle = match &entry.source {
                    MarketplacePluginSource::Local { .. } => {
                        let root =
                            plugin_marketplace::resolve_local_source(&marketplace, &entry.source)
                                .map_err(PluginError::new)?;
                        plugin::from_local(
                            &root,
                            &source_label,
                            &format!("{}:{}", marketplace.manifest_path, entry.name),
                        )
                        .map_err(PluginError::new)?
                    }
                    MarketplacePluginSource::Github {
                        repository,
                        reference,
                        sha,
                    } => {
                        let mut spec = github_skills::parse_repository(repository)
                            .map_err(PluginError::new)?;
                        spec.reference = sha.clone().or_else(|| reference.clone());
                        let checkout = github_skills::checkout_spec(spec)
                            .await
                            .map_err(PluginError::new)?;
                        plugin::from_github(&checkout).map_err(PluginError::new)?
                    }
                    MarketplacePluginSource::Git {
                        url,
                        path,
                        reference,
                        sha,
                    } => {
                        let mut spec =
                            github_skills::parse_repository(url).map_err(PluginError::new)?;
                        spec.reference = sha.clone().or_else(|| reference.clone());
                        spec.subpath = path
                            .as_deref()
                            .map(|path| PathBuf::from(path.strip_prefix("./").unwrap_or(path)));
                        let checkout = github_skills::checkout_spec(spec)
                            .await
                            .map_err(PluginError::new)?;
                        plugin::from_github(&checkout).map_err(PluginError::new)?
                    }
                    _ => {
                        return Err(PluginError::new(
                            "Marketplace plugin source is not installable",
                        ))
                    }
                };
                validate_marketplace_identity(
                    &entry.name,
                    &entry.version,
                    &bundle.plugin.name,
                    &bundle.plugin.version,
                )?;
                bundle.plugin.source = source_label;
                bundle.plugin.enabled = entry.default_enabled;
                let _inventory = hub.inventory.lock().await;
                let installed = plugin::install(&hub.dir, bundle).map_err(PluginError::new)?;
                reconcile_and_announce(&manager, &hub, &context).await?;
                json(PluginImportResult {
                    plugin: installed.into(),
                })
            }
        })?;

        let enabled = hub.clone();
        let enable_manager = manager.clone();
        let enable_context = reconcile_context.clone();
        ctx.command("plugins.set_enabled", move |args| {
            let hub = enabled.clone();
            let manager = enable_manager.clone();
            let context = enable_context.clone();
            async move {
                let args: FlagArgs = take_args(args)?;
                let _inventory = hub.inventory.lock().await;
                let plugin = plugin::set_enabled(&hub.dir, &args.id, args.value)
                    .map_err(PluginError::new)?;
                reconcile_and_announce(&manager, &hub, &context).await?;
                json(PluginInfo::from(plugin))
            }
        })?;

        let trusted = hub.clone();
        let trust_manager = manager.clone();
        let trust_context = reconcile_context.clone();
        ctx.command("plugins.set_trusted", move |args| {
            let hub = trusted.clone();
            let manager = trust_manager.clone();
            let context = trust_context.clone();
            async move {
                let args: FlagArgs = take_args(args)?;
                let _inventory = hub.inventory.lock().await;
                let plugin = plugin::set_trusted(&hub.dir, &args.id, args.value)
                    .map_err(PluginError::new)?;
                reconcile_and_announce(&manager, &hub, &context).await?;
                json(PluginInfo::from(plugin))
            }
        })?;

        let removed = hub.clone();
        let remove_manager = manager.clone();
        let remove_context = reconcile_context.clone();
        ctx.command("plugins.uninstall", move |args| {
            let hub = removed.clone();
            let manager = remove_manager.clone();
            let context = remove_context.clone();
            async move {
                let args: IdArgs = take_args(args)?;
                let _inventory = hub.inventory.lock().await;
                // Remove explicit runtime overrides before revoking trust. Otherwise an explicit
                // Enabled policy would keep the factory enabled just long enough for its hard
                // trust gate to fail the reconcile, preventing uninstall from reaching teardown.
                manager
                    .forget_installed_bundle_policy(&args.id)
                    .map_err(PluginError::new)?;
                plugin::set_trusted(&hub.dir, &args.id, false).map_err(PluginError::new)?;
                reconcile_and_announce(&manager, &hub, &context).await?;
                plugin::uninstall_with_options(&hub.dir, &args.id, args.keep_data)
                    .map_err(PluginError::new)?;
                reconcile_and_announce(&manager, &hub, &context).await?;
                Ok(Value::Bool(true))
            }
        })?;

        #[derive(Deserialize)]
        struct ScaffoldArgs {
            plugin_id: String,
            scaffold_id: String,
            cwd: String,
        }
        let scaffolding = hub.clone();
        ctx.command("plugins.apply_scaffold", move |args| {
            let hub = scaffolding.clone();
            async move {
                let args: ScaffoldArgs = take_args(args)?;
                json(
                    plugin::apply_scaffold(
                        &hub.dir,
                        &args.plugin_id,
                        &args.scaffold_id,
                        Path::new(&args.cwd),
                    )
                    .map_err(PluginError::new)?,
                )
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

/// Exposes the runtime-module graph to trusted hosts: what is loaded, what is waiting, and what each
/// module contributed. Extension policy cannot change modules classified as Core.
pub struct KernelPlugin;

#[async_trait]
impl Plugin for KernelPlugin {
    fn name(&self) -> &str {
        "kernel"
    }

    fn description(&self) -> Option<&str> {
        Some("Inspect and control managed runtime modules.")
    }

    fn inject(&self) -> Injection {
        Injection::required(["loader", "plugin-manager"])
    }

    async fn apply(&self, ctx: Context, _config: Value) -> PluginResult {
        let loader = ctx.expect::<LoaderService>()?;
        let manager = ctx.expect::<PluginManager>()?;

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
        struct CatalogArgs {
            #[serde(default)]
            scope: Option<PluginScope>,
        }
        let catalogued = manager.clone();
        ctx.command_described(
            "plugins.catalog",
            Some("Unified built-in and host plugin catalog for one user or project scope."),
            move |args| {
                let manager = catalogued.clone();
                async move {
                    let args: CatalogArgs = take_args(args)?;
                    json(
                        manager
                            .catalog(args.scope.unwrap_or(PluginScope::User))
                            .map_err(PluginError::new)?,
                    )
                }
            },
        )?;

        let planned = manager.clone();
        ctx.command_described(
            "plugins.plan_change",
            Some("Plan one revision-bound plugin or component change and its cascade."),
            move |args| {
                let manager = planned.clone();
                async move {
                    let request: PluginChangeRequest = take_args(args)?;
                    json(manager.plan(request).map_err(PluginError::new)?)
                }
            },
        )?;

        #[derive(Deserialize)]
        struct PlanIdArgs {
            id: String,
        }
        let applied = manager.clone();
        ctx.command_described(
            "plugins.apply_change",
            Some("Stop affected work, apply one planned change, and wait for the graph to settle."),
            move |args| {
                let manager = applied.clone();
                async move {
                    let args: PlanIdArgs = take_args(args)?;
                    let result = manager.apply(&args.id).map_err(PluginError::new)?;
                    manager
                        .settle_and_mark_last_good(&result)
                        .await
                        .map_err(PluginError::new)?;
                    json(result)
                }
            },
        )?;

        #[derive(Deserialize)]
        struct ResetArgs {
            plugin: String,
            #[serde(default)]
            scope: Option<PluginScope>,
        }
        let reset = manager.clone();
        ctx.command_described(
            "plugins.reset",
            Some("Reset one plugin to the default for a user or project scope."),
            move |args| {
                let manager = reset.clone();
                async move {
                    let args: ResetArgs = take_args(args)?;
                    let result = manager
                        .reset(args.scope.unwrap_or(PluginScope::User), &args.plugin)
                        .map_err(PluginError::new)?;
                    manager
                        .settle_and_mark_last_good(&result)
                        .await
                        .map_err(PluginError::new)?;
                    json(result)
                }
            },
        )?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::validate_marketplace_identity;

    #[test]
    fn marketplace_entry_must_match_bundle_identity() {
        validate_marketplace_identity("review-tools", "1.2.3", "review-tools", "1.2.3").unwrap();

        let name = validate_marketplace_identity("review-tools", "1.2.3", "other-tools", "1.2.3")
            .unwrap_err();
        assert!(name.to_string().contains("does not match bundle name"));

        let version =
            validate_marketplace_identity("review-tools", "1.2.3", "review-tools", "1.2.4")
                .unwrap_err();
        assert!(version
            .to_string()
            .contains("does not match bundle version"));
    }
}
