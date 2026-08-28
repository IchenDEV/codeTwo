use codetwo_kernel::{
    async_trait, App, CommandRealm, Context, Loader, LoaderConfig, Plugin, PluginEntry,
    PluginMetadata, PluginRegistry, PluginResult, PluginScopeSupport, Service,
};
use codetwo_plugins::builtins::TerminalPlugin;
use codetwo_plugins::testing::CoreAppTestExt;
use codetwo_plugins::{
    AppConfig, CoreApp, PluginChangeRequest, PluginConfigStore, PluginManager, PluginManagerError,
    PluginOverride, PluginScope,
};
use serde_json::{json, Value};
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::Duration;

struct ScopedPlugin;
struct ScopedService;

impl Service for ScopedService {
    const NAME: &'static str = "terminal";
}

#[async_trait]
impl Plugin for ScopedPlugin {
    fn name(&self) -> &str {
        "scoped"
    }

    fn metadata(&self) -> PluginMetadata {
        PluginMetadata {
            scope_support: vec![PluginScopeSupport::User, PluginScopeSupport::Project],
            ..PluginMetadata::default()
        }
    }

    async fn apply(&self, ctx: Context, config: Value) -> PluginResult {
        if matches!(ctx.command_realm(), CommandRealm::Project(_))
            && config.get("label").and_then(Value::as_str) == Some("fail")
        {
            return Err("project fixture failed".into());
        }
        // `terminal` is intentionally the service isolated by project child graphs. Both the
        // global and project instance must be able to publish it without a conflict.
        ctx.provide(Arc::new(ScopedService))?;
        let label = config
            .get("label")
            .and_then(Value::as_str)
            .unwrap_or("default")
            .to_string();
        let realm = match ctx.command_realm() {
            CommandRealm::Global => "global".to_string(),
            CommandRealm::Project(path) => path.clone(),
        };
        ctx.command("scoped.describe", move |_| {
            let label = label.clone();
            let realm = realm.clone();
            async move { Ok(json!({ "label": label, "realm": realm })) }
        })?;
        ctx.command("scoped.wait", move |args| async move {
            let millis = args.get("millis").and_then(Value::as_u64).unwrap_or(100);
            tokio::time::sleep(Duration::from_millis(millis)).await;
            Ok(Value::Bool(true))
        })?;
        Ok(())
    }
}

struct GlobalOnlyPlugin;

#[async_trait]
impl Plugin for GlobalOnlyPlugin {
    fn name(&self) -> &str {
        "global-only"
    }

    async fn apply(&self, ctx: Context, _config: Value) -> PluginResult {
        ctx.command("global-only.ping", |_| async { Ok(json!("pong")) })?;
        Ok(())
    }
}

fn registry() -> PluginRegistry {
    let mut registry = PluginRegistry::new();
    registry.register(|| ScopedPlugin);
    registry.register(|| GlobalOnlyPlugin);
    registry
}

fn terminal_registry() -> PluginRegistry {
    let mut registry = PluginRegistry::new();
    registry.register(|| TerminalPlugin);
    registry
        .set_metadata(
            "terminal",
            PluginMetadata {
                scope_support: vec![PluginScopeSupport::User, PluginScopeSupport::Project],
                ..PluginMetadata::default()
            },
        )
        .unwrap();
    registry
}

async fn boot(data_dir: &Path) -> CoreApp {
    CoreApp::boot_with(
        AppConfig::bare_in(data_dir)
            .with(
                "scoped",
                PluginEntry::with_config(json!({ "label": "global" })),
            )
            .with("global-only", PluginEntry::default()),
        registry(),
    )
    .await
    .expect("boot project plugin test app")
}

#[tokio::test]
async fn bare_hosts_do_not_auto_enable_available_project_factories() {
    let data = tempfile::tempdir().unwrap();
    let project = tempfile::tempdir().unwrap();
    let app = CoreApp::boot_with(AppConfig::bare_in(data.path()), registry())
        .await
        .unwrap();

    assert!(app
        .call_in_project(project.path(), "scoped.describe", Value::Null)
        .await
        .is_err());
    let catalog = app
        .plugin_manager()
        .catalog(PluginScope::project(project.path()))
        .unwrap();
    let scoped = catalog
        .plugins
        .iter()
        .find(|entry| entry.id == "scoped")
        .unwrap();
    assert!(scoped.available);
    assert!(!scoped.enabled);
    assert!(!scoped.running);
}

#[tokio::test]
async fn project_catalog_uses_global_runtime_and_user_policy_for_global_only_plugins() {
    let data = tempfile::tempdir().unwrap();
    let project = tempfile::tempdir().unwrap();
    let app = boot(data.path()).await;
    change(
        &app,
        "global-only",
        PluginScope::User,
        Some(PluginOverride::Enabled),
        Some(json!({ "source": "user" })),
    )
    .await
    .unwrap();
    assert_eq!(app.plugin_manager().loaded_project_count(), 0);

    let catalog = app
        .plugin_manager()
        .catalog(PluginScope::project(project.path()))
        .unwrap();
    let global_only = catalog
        .plugins
        .iter()
        .find(|entry| entry.id == "global-only")
        .unwrap();
    assert_eq!(global_only.state, PluginOverride::Enabled);
    assert!(global_only.enabled);
    assert!(global_only.running);
    assert_eq!(global_only.status, Some(codetwo_kernel::Status::Active));
    assert_eq!(global_only.config, json!({ "source": "user" }));
    assert_eq!(global_only.commands, ["global-only.ping"]);
    assert!(global_only.services.is_empty());

    let scoped = catalog
        .plugins
        .iter()
        .find(|entry| entry.id == "scoped")
        .unwrap();
    assert!(scoped.enabled);
    assert!(!scoped.running);
    assert_eq!(scoped.status, None);
    assert!(scoped.commands.is_empty());
}

async fn change(
    app: &CoreApp,
    plugin: &str,
    scope: PluginScope,
    state: Option<PluginOverride>,
    config: Option<Value>,
) -> Result<(), PluginManagerError> {
    let plan = app.plugin_manager().plan(PluginChangeRequest {
        plugin: plugin.to_string(),
        scope,
        state,
        config,
        component: None,
    })?;
    app.plugin_manager().apply(&plan.id)?;
    app.flush().await;
    Ok(())
}

#[tokio::test]
async fn project_graph_is_lazy_and_commands_are_independent() {
    let data = tempfile::tempdir().unwrap();
    let project = tempfile::tempdir().unwrap();
    let app = boot(data.path()).await;
    let normalized = project
        .path()
        .canonicalize()
        .unwrap()
        .to_string_lossy()
        .into_owned();

    assert_eq!(app.plugin_manager().loaded_project_count(), 0);
    assert!(!app.commands().iter().any(
        |command| matches!(&command.realm, CommandRealm::Project(path) if path == &normalized)
    ));

    let local = app
        .call_in_project(project.path(), "scoped.describe", Value::Null)
        .await
        .unwrap();
    assert_eq!(local["label"], "global");
    assert_eq!(local["realm"], normalized);
    assert_eq!(app.plugin_manager().loaded_project_count(), 1);

    change(
        &app,
        "scoped",
        PluginScope::project(project.path()),
        None,
        Some(json!({ "label": "project" })),
    )
    .await
    .unwrap();
    let local = app
        .call_in_project(project.path(), "scoped.describe", Value::Null)
        .await
        .unwrap();
    let global = app.call("scoped.describe", Value::Null).await.unwrap();
    assert_eq!(local["label"], "project");
    assert_eq!(global["label"], "global");
    assert_eq!(global["realm"], "global");

    let catalog = app
        .plugin_manager()
        .catalog(PluginScope::project(project.path()))
        .unwrap();
    let entry = catalog
        .plugins
        .into_iter()
        .find(|entry| entry.id == "scoped")
        .unwrap();
    assert!(entry.running);
    assert_eq!(entry.config["label"], "project");
    assert_eq!(entry.commands, ["scoped.describe", "scoped.wait"]);
    assert_eq!(entry.services, ["terminal"]);
}

#[tokio::test]
async fn project_catalog_normalizes_the_scope_before_reading_policy() {
    let data = tempfile::tempdir().unwrap();
    let project = tempfile::tempdir().unwrap();
    let app = boot(data.path()).await;
    change(
        &app,
        "scoped",
        PluginScope::project(project.path()),
        Some(PluginOverride::Disabled),
        Some(json!({ "label": "project-policy" })),
    )
    .await
    .unwrap();

    let equivalent_path = project.path().join(".").to_string_lossy().into_owned();
    let catalog = app
        .plugin_manager()
        .catalog(PluginScope::Project {
            project_path: equivalent_path,
        })
        .unwrap();
    let scoped = catalog
        .plugins
        .iter()
        .find(|entry| entry.id == "scoped")
        .unwrap();

    assert_eq!(scoped.state, PluginOverride::Disabled);
    assert!(!scoped.enabled);
    assert_eq!(scoped.config["label"], "project-policy");
}

#[tokio::test]
async fn a_failed_project_instance_cannot_fall_back_to_the_global_plugin() {
    let data = tempfile::tempdir().unwrap();
    let project = tempfile::tempdir().unwrap();
    let app = boot(data.path()).await;
    app.call_in_project(project.path(), "scoped.describe", Value::Null)
        .await
        .unwrap();

    change(
        &app,
        "scoped",
        PluginScope::project(project.path()),
        None,
        Some(json!({ "label": "fail" })),
    )
    .await
    .unwrap();

    let error = app
        .call_in_project(project.path(), "scoped.describe", Value::Null)
        .await
        .unwrap_err();
    assert!(matches!(
        error,
        codetwo_kernel::KernelError::CommandFallbackBlocked { name, .. }
            if name == "scoped.describe"
    ));
    let catalog = app
        .plugin_manager()
        .catalog(PluginScope::project(project.path()))
        .unwrap();
    let scoped = catalog
        .plugins
        .iter()
        .find(|entry| entry.id == "scoped")
        .unwrap();
    assert_eq!(scoped.status, Some(codetwo_kernel::Status::Failed));
    assert!(scoped
        .error
        .as_deref()
        .unwrap()
        .contains("project fixture failed"));
}

#[tokio::test]
async fn inherit_off_on_and_user_changes_reconcile_loaded_projects() {
    let data = tempfile::tempdir().unwrap();
    let alpha = tempfile::tempdir().unwrap();
    let beta = tempfile::tempdir().unwrap();
    let app = boot(data.path()).await;
    app.call_in_project(alpha.path(), "scoped.describe", Value::Null)
        .await
        .unwrap();
    app.call_in_project(beta.path(), "scoped.describe", Value::Null)
        .await
        .unwrap();

    change(
        &app,
        "scoped",
        PluginScope::User,
        None,
        Some(json!({ "label": "user-v2" })),
    )
    .await
    .unwrap();
    for project in [alpha.path(), beta.path()] {
        let value = app
            .call_in_project(project, "scoped.describe", Value::Null)
            .await
            .unwrap();
        assert_eq!(value["label"], "user-v2");
    }

    change(
        &app,
        "scoped",
        PluginScope::project(alpha.path()),
        Some(PluginOverride::Disabled),
        None,
    )
    .await
    .unwrap();
    let alpha_catalog = app
        .plugin_manager()
        .catalog(PluginScope::project(alpha.path()))
        .unwrap();
    let alpha_entry = alpha_catalog
        .plugins
        .iter()
        .find(|entry| entry.id == "scoped")
        .unwrap();
    assert_eq!(alpha_entry.state, PluginOverride::Disabled);
    assert!(!alpha_entry.enabled);
    assert!(!alpha_entry.running);
    assert!(alpha_entry.commands.is_empty());
    let blocked = app
        .call_in_project(alpha.path(), "scoped.describe", Value::Null)
        .await
        .unwrap_err();
    assert!(matches!(
        blocked,
        codetwo_kernel::KernelError::CommandFallbackBlocked { name, .. }
            if name == "scoped.describe"
    ));

    // Plugins that do not support project scope keep normal global fallback behaviour.
    assert_eq!(
        app.call_in_project(alpha.path(), "global-only.ping", Value::Null)
            .await
            .unwrap(),
        json!("pong")
    );

    change(
        &app,
        "scoped",
        PluginScope::User,
        Some(PluginOverride::Disabled),
        None,
    )
    .await
    .unwrap();
    change(
        &app,
        "scoped",
        PluginScope::project(alpha.path()),
        Some(PluginOverride::Enabled),
        None,
    )
    .await
    .unwrap();
    let explicit_project = app
        .call_in_project(alpha.path(), "scoped.describe", Value::Null)
        .await
        .unwrap();
    assert_eq!(
        explicit_project["realm"],
        alpha
            .path()
            .canonicalize()
            .unwrap()
            .to_string_lossy()
            .into_owned()
    );
    assert!(app.call("scoped.describe", Value::Null).await.is_err());

    change(
        &app,
        "scoped",
        PluginScope::project(alpha.path()),
        Some(PluginOverride::Inherit),
        None,
    )
    .await
    .unwrap();
    let inherited = app
        .plugin_manager()
        .catalog(PluginScope::project(alpha.path()))
        .unwrap();
    let inherited = inherited
        .plugins
        .iter()
        .find(|entry| entry.id == "scoped")
        .unwrap();
    assert_eq!(inherited.state, PluginOverride::Inherit);
    assert!(!inherited.enabled);
}

#[tokio::test]
async fn stale_plans_track_the_relevant_project_graph_exactly() {
    let data = tempfile::tempdir().unwrap();
    let alpha = tempfile::tempdir().unwrap();
    let beta = tempfile::tempdir().unwrap();
    let app = boot(data.path()).await;

    let stale = app
        .plugin_manager()
        .plan(PluginChangeRequest {
            plugin: "scoped".into(),
            scope: PluginScope::project(alpha.path()),
            state: Some(PluginOverride::Disabled),
            config: None,
            component: None,
        })
        .unwrap();
    app.call_in_project(alpha.path(), "scoped.describe", Value::Null)
        .await
        .unwrap();
    assert!(matches!(
        app.plugin_manager().apply(&stale.id),
        Err(PluginManagerError::StalePlan)
    ));

    let alpha_plan = app
        .plugin_manager()
        .plan(PluginChangeRequest {
            plugin: "scoped".into(),
            scope: PluginScope::project(alpha.path()),
            state: Some(PluginOverride::Disabled),
            config: None,
            component: None,
        })
        .unwrap();
    app.call_in_project(beta.path(), "scoped.describe", Value::Null)
        .await
        .unwrap();
    app.plugin_manager().apply(&alpha_plan.id).unwrap();
    app.flush().await;
}

#[tokio::test]
async fn idle_reap_disposes_the_realm_and_the_next_call_reloads_it() {
    let data = tempfile::tempdir().unwrap();
    let project = tempfile::tempdir().unwrap();
    let app = boot(data.path()).await;
    let normalized = project
        .path()
        .canonicalize()
        .unwrap()
        .to_string_lossy()
        .into_owned();
    app.call_in_project(project.path(), "scoped.describe", Value::Null)
        .await
        .unwrap();

    assert_eq!(
        app.plugin_manager()
            .reap_idle_projects_with_ttl(Duration::ZERO),
        1
    );
    app.flush().await;
    assert_eq!(app.plugin_manager().loaded_project_count(), 0);
    assert!(!app.commands().iter().any(
        |command| matches!(&command.realm, CommandRealm::Project(path) if path == &normalized)
    ));

    let value = app
        .call_in_project(project.path(), "scoped.describe", Value::Null)
        .await
        .unwrap();
    assert_eq!(value["realm"], normalized);
    assert_eq!(app.plugin_manager().loaded_project_count(), 1);
}

#[tokio::test]
async fn a_project_command_lease_prevents_reaping_for_the_entire_call() {
    let data = tempfile::tempdir().unwrap();
    let project = tempfile::tempdir().unwrap();
    let app = Arc::new(boot(data.path()).await);
    let running_app = app.clone();
    let project_path = project.path().to_path_buf();
    let command = tokio::spawn(async move {
        running_app
            .call_in_project(project_path, "scoped.wait", json!({ "millis": 200 }))
            .await
    });

    tokio::time::timeout(Duration::from_secs(2), async {
        while app.plugin_manager().loaded_project_count() == 0 {
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap();
    tokio::time::sleep(Duration::from_millis(20)).await;
    assert_eq!(
        app.plugin_manager()
            .reap_idle_projects_with_ttl(Duration::ZERO),
        0
    );
    assert_eq!(app.plugin_manager().loaded_project_count(), 1);
    assert_eq!(command.await.unwrap().unwrap(), Value::Bool(true));

    assert_eq!(
        app.plugin_manager()
            .reap_idle_projects_with_ttl(Duration::ZERO),
        1
    );
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn lease_and_reaper_observe_one_atomic_activity_snapshot() {
    let data = tempfile::tempdir().unwrap();
    let project = tempfile::tempdir().unwrap();
    let app = Arc::new(boot(data.path()).await);
    let (_, lease) = app
        .plugin_manager()
        .lease_project_command(project.path())
        .unwrap();
    app.flush().await;

    let lease_held = Arc::new(tokio::sync::Barrier::new(2));
    let release_lease = Arc::new(tokio::sync::Barrier::new(2));
    let holder = {
        let lease_held = lease_held.clone();
        let release_lease = release_lease.clone();
        tokio::spawn(async move {
            lease_held.wait().await;
            release_lease.wait().await;
            drop(lease);
        })
    };

    lease_held.wait().await;
    assert_eq!(
        app.plugin_manager()
            .reap_idle_projects_with_ttl(Duration::ZERO),
        0
    );
    assert_eq!(app.plugin_manager().loaded_project_count(), 1);

    release_lease.wait().await;
    holder.await.unwrap();
    assert_eq!(
        app.plugin_manager()
            .reap_idle_projects_with_ttl(Duration::ZERO),
        1
    );
}

#[tokio::test]
async fn a_live_project_terminal_holds_a_resource_lease_until_killed() {
    let data = tempfile::tempdir().unwrap();
    let project = tempfile::tempdir().unwrap();
    let app = CoreApp::boot_with(
        AppConfig::bare_in(data.path()).with("terminal", PluginEntry::default()),
        terminal_registry(),
    )
    .await
    .unwrap();

    app.call_in_project(
        project.path(),
        "terminal.spawn",
        json!({
            "id": "lease-terminal",
            "cwd": project.path().to_string_lossy(),
            "rows": 24,
            "cols": 80
        }),
    )
    .await
    .unwrap();
    assert_eq!(
        app.plugin_manager()
            .reap_idle_projects_with_ttl(Duration::ZERO),
        0
    );

    app.call_in_project(
        project.path(),
        "terminal.kill",
        json!({ "id": "lease-terminal" }),
    )
    .await
    .unwrap();
    assert_eq!(
        app.plugin_manager()
            .reap_idle_projects_with_ttl(Duration::ZERO),
        1
    );
}

#[tokio::test]
async fn background_reaper_disposes_a_truly_idle_project_without_an_api_touch() {
    let kernel = App::new();
    let defaults = LoaderConfig::default().with(
        "scoped",
        PluginEntry::with_config(json!({ "label": "global" })),
    );
    let loader = Arc::new(Mutex::new(Loader::new(kernel.ctx(), registry())));
    let config = Arc::new(Mutex::new(PluginConfigStore::ephemeral()));
    let manager = Arc::new(PluginManager::new_with_project_idle_ttl(
        loader.clone(),
        config,
        defaults.clone(),
        kernel.ctx().weak(),
        Duration::from_millis(40),
    ));
    kernel.ctx().provide(manager.clone()).unwrap();
    assert!(loader.lock().unwrap().apply(defaults).is_empty());
    kernel.flush().await;
    manager.start_reaper();

    let project = tempfile::tempdir().unwrap();
    manager.ensure_project(project.path()).unwrap();
    kernel.flush().await;
    assert_eq!(manager.loaded_project_count(), 1);

    tokio::time::timeout(Duration::from_secs(2), async {
        while manager.loaded_project_count() != 0 {
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .expect("background reaper should dispose the idle child graph");
    kernel.flush().await;
    manager.shutdown_projects();
    kernel.stop().await;
}

#[tokio::test]
async fn idle_reap_removes_and_lazy_reload_recreates_fallback_blockers() {
    let data = tempfile::tempdir().unwrap();
    let project = tempfile::tempdir().unwrap();
    let normalized = project
        .path()
        .canonicalize()
        .unwrap()
        .to_string_lossy()
        .into_owned();
    let app = boot(data.path()).await;

    change(
        &app,
        "scoped",
        PluginScope::project(project.path()),
        Some(PluginOverride::Disabled),
        None,
    )
    .await
    .unwrap();
    assert!(matches!(
        app.call_in_project(project.path(), "scoped.describe", Value::Null)
            .await,
        Err(codetwo_kernel::KernelError::CommandFallbackBlocked { .. })
    ));

    assert_eq!(
        app.plugin_manager()
            .reap_idle_projects_with_ttl(Duration::ZERO),
        1
    );
    app.flush().await;

    // Bypassing the manager proves the old scope-owned blocker really was disposed.
    let inherited = app
        .ctx()
        .with_command_realm(CommandRealm::project(normalized))
        .call("scoped.describe", Value::Null)
        .await
        .unwrap();
    assert_eq!(inherited["realm"], "global");

    // The supported host path lazily reconstructs the child graph and its explicit-disable block.
    assert!(matches!(
        app.call_in_project(project.path(), "scoped.describe", Value::Null)
            .await,
        Err(codetwo_kernel::KernelError::CommandFallbackBlocked { .. })
    ));
}

#[tokio::test]
async fn unsupported_scope_is_rejected_and_disable_plan_lists_live_resources() {
    let data = tempfile::tempdir().unwrap();
    let project = tempfile::tempdir().unwrap();
    let app = boot(data.path()).await;

    assert!(matches!(
        app.plugin_manager().plan(PluginChangeRequest {
            plugin: "global-only".into(),
            scope: PluginScope::project(project.path()),
            state: Some(PluginOverride::Disabled),
            config: None,
            component: None,
        }),
        Err(PluginManagerError::UnsupportedProjectScope(plugin)) if plugin == "global-only"
    ));

    let plan = app
        .plugin_manager()
        .plan(PluginChangeRequest {
            plugin: "scoped".into(),
            scope: PluginScope::User,
            state: Some(PluginOverride::Disabled),
            config: None,
            component: None,
        })
        .unwrap();
    assert!(plan.requires_confirmation);
    assert!(plan.active_resources.iter().any(|resource| {
        resource.plugin == "scoped"
            && resource.kind == "plugin_scope"
            && resource.label == "scoped runtime"
    }));
    assert!(plan.active_resources.iter().any(|resource| {
        resource.plugin == "scoped" && resource.kind == "service" && resource.label == "terminal"
    }));
}

#[tokio::test]
async fn project_policy_survives_restart_and_reset_is_live() {
    let data = tempfile::tempdir().unwrap();
    let project = tempfile::tempdir().unwrap();
    {
        let app = boot(data.path()).await;
        app.call_in_project(project.path(), "scoped.describe", Value::Null)
            .await
            .unwrap();
        change(
            &app,
            "scoped",
            PluginScope::project(project.path()),
            Some(PluginOverride::Disabled),
            Some(json!({ "label": "private" })),
        )
        .await
        .unwrap();
        app.stop().await;
    }

    let app = boot(data.path()).await;
    app.plugin_manager().ensure_project(project.path()).unwrap();
    app.flush().await;
    let catalog = app
        .plugin_manager()
        .catalog(PluginScope::project(project.path()))
        .unwrap();
    let entry = catalog
        .plugins
        .iter()
        .find(|entry| entry.id == "scoped")
        .unwrap();
    assert_eq!(entry.state, PluginOverride::Disabled);
    assert!(!entry.running);
    assert_eq!(entry.config["label"], "private");
    assert!(matches!(
        app.call_in_project(project.path(), "scoped.describe", Value::Null)
            .await,
        Err(codetwo_kernel::KernelError::CommandFallbackBlocked { .. })
    ));

    app.plugin_manager()
        .reset(PluginScope::project(project.path()), "scoped")
        .unwrap();
    app.flush().await;
    let value = app
        .call_in_project(project.path(), "scoped.describe", Value::Null)
        .await
        .unwrap();
    assert_eq!(value["label"], "global");
}
