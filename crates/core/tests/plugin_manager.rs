use codetwo_core::app::events::PluginsChanged;
use codetwo_core::app::plugins::KernelPlugin;
use codetwo_core::app::{
    AppConfig, CoreApp, PluginChangeRequest, PluginConfigStore, PluginManagerError, PluginOverride,
    PluginPolicy, PluginRecoveryState, PluginScope,
};
use codetwo_kernel::{
    async_trait, Context, Injection, Plugin, PluginCategory, PluginEntry, PluginMetadata,
    PluginRegistry, PluginResult, PluginScopeSupport, Service, Status,
};
use serde_json::{json, Value};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Arc;

struct ConfigurablePlugin;
struct PendingPlugin;
struct ProviderPlugin;
struct DependentPlugin;
struct ConfigurableService;

struct RollbackFailurePlugin {
    fail_next_stable_apply: Arc<AtomicBool>,
}
struct SafeModeEssentialPlugin;
struct SafeModeRequiredPlugin;
struct SafeModeLeafPlugin;
struct SafeModeOptionalPlugin;
struct SafeModeRequiredService;
struct SafeModeLeafService;
struct SafeModeOptionalService;

impl Service for ConfigurableService {
    const NAME: &'static str = "configurable-service";
}

#[async_trait]
impl Plugin for RollbackFailurePlugin {
    fn name(&self) -> &str {
        "rollback-failure"
    }

    async fn apply(&self, ctx: Context, config: Value) -> PluginResult {
        let label = config["label"].as_str().unwrap_or("stable").to_string();
        if label == "reject-change" {
            self.fail_next_stable_apply.store(true, Ordering::SeqCst);
            return Err("requested change failed asynchronously".into());
        }
        if self.fail_next_stable_apply.swap(false, Ordering::SeqCst) {
            return Err("rollback restoration failed asynchronously".into());
        }
        ctx.command("rollback-failure.value", move |_| {
            let label = label.clone();
            async move { Ok(Value::String(label)) }
        })?;
        Ok(())
    }
}

impl Service for SafeModeRequiredService {
    const NAME: &'static str = "safe-required";
}

impl Service for SafeModeLeafService {
    const NAME: &'static str = "safe-leaf";
}

impl Service for SafeModeOptionalService {
    const NAME: &'static str = "safe-optional";
}

#[async_trait]
impl Plugin for SafeModeEssentialPlugin {
    fn name(&self) -> &str {
        "safe-essential"
    }

    fn inject(&self) -> Injection {
        Injection::required([SafeModeRequiredService::NAME])
            .with_optional([SafeModeOptionalService::NAME])
    }

    async fn apply(&self, ctx: Context, _config: Value) -> PluginResult {
        ctx.command("safe-essential.ping", |_| async { Ok(json!(true)) })?;
        Ok(())
    }
}

#[async_trait]
impl Plugin for SafeModeRequiredPlugin {
    fn name(&self) -> &str {
        SafeModeRequiredService::NAME
    }

    fn inject(&self) -> Injection {
        Injection::required([SafeModeLeafService::NAME])
    }

    async fn apply(&self, ctx: Context, _config: Value) -> PluginResult {
        ctx.provide(Arc::new(SafeModeRequiredService))?;
        ctx.command("safe-required.ping", |_| async { Ok(json!(true)) })?;
        Ok(())
    }
}

#[async_trait]
impl Plugin for SafeModeLeafPlugin {
    fn name(&self) -> &str {
        SafeModeLeafService::NAME
    }

    async fn apply(&self, ctx: Context, _config: Value) -> PluginResult {
        ctx.provide(Arc::new(SafeModeLeafService))?;
        ctx.command("safe-leaf.ping", |_| async { Ok(json!(true)) })?;
        Ok(())
    }
}

#[async_trait]
impl Plugin for SafeModeOptionalPlugin {
    fn name(&self) -> &str {
        SafeModeOptionalService::NAME
    }

    async fn apply(&self, ctx: Context, _config: Value) -> PluginResult {
        ctx.provide(Arc::new(SafeModeOptionalService))?;
        ctx.command("safe-optional.ping", |_| async { Ok(json!(true)) })?;
        Ok(())
    }
}

#[async_trait]
impl Plugin for ConfigurablePlugin {
    fn name(&self) -> &str {
        "configurable"
    }

    fn description(&self) -> Option<&str> {
        Some("A small managed plugin used to exercise the public command seam.")
    }

    fn schema(&self) -> Option<Value> {
        Some(json!({
            "type": "object",
            "additionalProperties": false,
            "required": ["label"],
            "properties": {
                "label": { "type": "string" }
            }
        }))
    }

    async fn apply(&self, ctx: Context, config: Value) -> PluginResult {
        let label = config["label"].as_str().unwrap_or("missing").to_string();
        if label == "fail"
            || (label == "project-fail"
                && matches!(
                    ctx.command_realm(),
                    codetwo_kernel::CommandRealm::Project(_)
                ))
        {
            return Err("configured fixture failed".into());
        }
        ctx.command("configurable.value", move |_| {
            let label = label.clone();
            async move { Ok(Value::String(label)) }
        })?;
        Ok(())
    }
}

#[async_trait]
impl Plugin for ProviderPlugin {
    fn name(&self) -> &str {
        "provider"
    }

    async fn apply(&self, ctx: Context, _config: Value) -> PluginResult {
        ctx.provide(Arc::new(ConfigurableService))?;
        ctx.command("provider.ping", |_| async { Ok(json!("provider")) })?;
        Ok(())
    }
}

#[async_trait]
impl Plugin for DependentPlugin {
    fn name(&self) -> &str {
        "dependent"
    }

    fn inject(&self) -> Injection {
        Injection::required([ConfigurableService::NAME])
    }

    async fn apply(&self, ctx: Context, _config: Value) -> PluginResult {
        ctx.command("dependent.ping", |_| async { Ok(json!("pong")) })?;
        Ok(())
    }
}

#[async_trait]
impl Plugin for PendingPlugin {
    fn name(&self) -> &str {
        "pending"
    }

    fn inject(&self) -> Injection {
        Injection::required(["never-provided"])
    }

    async fn apply(&self, _ctx: Context, _config: Value) -> PluginResult {
        Ok(())
    }
}

fn registry() -> PluginRegistry {
    let mut registry = PluginRegistry::new();
    registry.register(|| ConfigurablePlugin);
    registry.register(|| PendingPlugin);
    registry.register(|| ProviderPlugin);
    registry.register(|| DependentPlugin);
    registry.register(|| KernelPlugin);
    registry
        .set_metadata(
            "configurable",
            PluginMetadata {
                scope_support: vec![PluginScopeSupport::User, PluginScopeSupport::Project],
                ..PluginMetadata::default()
            },
        )
        .unwrap();
    registry
        .set_metadata(
            "kernel",
            PluginMetadata {
                category: PluginCategory::Foundation,
                essential: true,
                ..PluginMetadata::default()
            },
        )
        .unwrap();
    registry
}

fn config(data: &std::path::Path) -> AppConfig {
    AppConfig::bare_in(data)
        .with(
            "configurable",
            PluginEntry::with_config(json!({ "label": "default" })),
        )
        .with("pending", PluginEntry::disabled())
        .with("provider", PluginEntry::disabled())
        .with("dependent", PluginEntry::disabled())
        .with("kernel", PluginEntry::default())
}

fn safe_mode_dependency_registry() -> PluginRegistry {
    let mut registry = PluginRegistry::new();
    registry.register(|| ConfigurablePlugin);
    registry.register(|| SafeModeEssentialPlugin);
    registry.register(|| SafeModeRequiredPlugin);
    registry.register(|| SafeModeLeafPlugin);
    registry.register(|| SafeModeOptionalPlugin);
    registry.register(|| KernelPlugin);
    registry
        .set_metadata(
            "safe-essential",
            PluginMetadata {
                category: PluginCategory::Foundation,
                essential: true,
                ..PluginMetadata::default()
            },
        )
        .unwrap();
    registry
}

fn safe_mode_dependency_config(data: &std::path::Path) -> AppConfig {
    AppConfig::bare_in(data)
        .with(
            "configurable",
            PluginEntry::with_config(json!({ "label": "ordinary-default" })),
        )
        .with("safe-essential", PluginEntry::default())
        .with("safe-required", PluginEntry::default())
        .with("safe-leaf", PluginEntry::default())
        .with("safe-optional", PluginEntry::default())
        .with("kernel", PluginEntry::default())
}

#[tokio::test]
async fn public_management_commands_apply_live_and_survive_restart() {
    let data = tempfile::tempdir().unwrap();
    {
        let app = CoreApp::boot_with(config(data.path()), registry())
            .await
            .unwrap();
        assert_eq!(
            app.call("configurable.value", Value::Null).await.unwrap(),
            json!("default")
        );

        let catalog = app
            .call("plugins.catalog", json!({ "scope": { "kind": "user" } }))
            .await
            .unwrap();
        let entry = catalog["plugins"]
            .as_array()
            .unwrap()
            .iter()
            .find(|entry| entry["id"] == "configurable")
            .unwrap();
        assert_eq!(entry["state"], "inherit");
        assert_eq!(entry["running"], true);
        assert_eq!(entry["commands"], json!(["configurable.value"]));

        let plan = app
            .call(
                "plugins.plan_change",
                json!({
                    "plugin": "configurable",
                    "scope": { "kind": "user" },
                    "state": "disabled"
                }),
            )
            .await
            .unwrap();
        assert_eq!(plan["requires_confirmation"], true);
        assert!(plan["active_resources"]
            .as_array()
            .unwrap()
            .iter()
            .any(|resource| resource["kind"] == "plugin_scope"));
        app.call(
            "plugins.apply_change",
            json!({ "id": plan["id"].as_str().unwrap() }),
        )
        .await
        .unwrap();
        assert!(app.call("configurable.value", Value::Null).await.is_err());
        app.stop().await;
    }

    let app = CoreApp::boot_with(config(data.path()), registry())
        .await
        .unwrap();
    assert!(app.call("configurable.value", Value::Null).await.is_err());
    app.call(
        "plugins.reset",
        json!({ "plugin": "configurable", "scope": { "kind": "user" } }),
    )
    .await
    .unwrap();
    assert_eq!(
        app.call("configurable.value", Value::Null).await.unwrap(),
        json!("default")
    );
}

#[tokio::test]
async fn plans_validate_schema_and_protect_the_management_plane() {
    let data = tempfile::tempdir().unwrap();
    let app = CoreApp::boot_with(config(data.path()), registry())
        .await
        .unwrap();

    let missing = app
        .call(
            "plugins.plan_change",
            json!({
                "plugin": "configurable",
                "scope": { "kind": "user" },
                "config": {}
            }),
        )
        .await
        .unwrap_err()
        .to_string();
    assert!(missing.contains("`label` is required"), "{missing}");

    let extra = app
        .call(
            "plugins.plan_change",
            json!({
                "plugin": "configurable",
                "scope": { "kind": "user" },
                "config": { "label": "ok", "surprise": true }
            }),
        )
        .await
        .unwrap_err()
        .to_string();
    assert!(
        extra.contains("`surprise` is not an allowed property"),
        "{extra}"
    );

    let plan = app
        .call(
            "plugins.plan_change",
            json!({
                "plugin": "configurable",
                "scope": { "kind": "user" },
                "config": { "label": "reloaded" }
            }),
        )
        .await
        .unwrap();
    app.call(
        "plugins.apply_change",
        json!({ "id": plan["id"].as_str().unwrap() }),
    )
    .await
    .unwrap();
    assert_eq!(
        app.call("configurable.value", Value::Null).await.unwrap(),
        json!("reloaded")
    );

    let essential = app
        .call(
            "plugins.plan_change",
            json!({
                "plugin": "kernel",
                "scope": { "kind": "user" },
                "state": "disabled"
            }),
        )
        .await
        .unwrap_err()
        .to_string();
    assert!(essential.contains("cannot be disabled"), "{essential}");
    assert!(app
        .commands()
        .iter()
        .any(|command| command.name == "plugins.reset"));
}

#[tokio::test]
async fn numeric_schema_bounds_are_rejected_before_a_plugin_can_panic() {
    let data = tempfile::tempdir().unwrap();
    let app = CoreApp::boot(AppConfig::new(data.path())).await.unwrap();

    let error = app
        .call(
            "plugins.plan_change",
            json!({
                "plugin": "bus",
                "scope": { "kind": "user" },
                "config": { "capacity": 0 }
            }),
        )
        .await
        .unwrap_err()
        .to_string();
    assert!(error.contains("at least 16"), "{error}");

    assert!(
        app.call("providers.list", Value::Null).await.is_ok(),
        "the live graph remains available after rejection"
    );
}

#[tokio::test]
async fn managed_policy_changes_do_not_announce_an_installed_bundle_change() {
    let data = tempfile::tempdir().unwrap();
    let app = CoreApp::boot_with(config(data.path()), registry())
        .await
        .unwrap();
    let bundle_changes = Arc::new(AtomicUsize::new(0));
    let observed = bundle_changes.clone();
    app.ctx().on::<PluginsChanged, _>(move |_| {
        observed.fetch_add(1, Ordering::SeqCst);
        None
    });

    let component_plan = app
        .call(
            "plugins.plan_change",
            json!({
                "plugin": "configurable",
                "scope": { "kind": "user" },
                "state": "disabled",
                "component": "configurable.surface"
            }),
        )
        .await
        .unwrap();
    app.call(
        "plugins.apply_change",
        json!({ "id": component_plan["id"].as_str().unwrap() }),
    )
    .await
    .unwrap();

    let plugin_plan = app
        .call(
            "plugins.plan_change",
            json!({
                "plugin": "configurable",
                "scope": { "kind": "user" },
                "state": "disabled"
            }),
        )
        .await
        .unwrap();
    app.call(
        "plugins.apply_change",
        json!({ "id": plugin_plan["id"].as_str().unwrap() }),
    )
    .await
    .unwrap();

    assert_eq!(bundle_changes.load(Ordering::SeqCst), 0);
}

#[tokio::test]
async fn failed_or_pending_apply_rolls_back_primary_and_runtime_without_advancing_last_good() {
    let data = tempfile::tempdir().unwrap();
    let app = CoreApp::boot_with(config(data.path()), registry())
        .await
        .unwrap();
    let last_good_path = data.path().join("plugin-config.last-good.json");
    let original_last_good = std::fs::read(&last_good_path).unwrap();

    let failed = app
        .call(
            "plugins.plan_change",
            json!({
                "plugin": "configurable",
                "scope": { "kind": "user" },
                "state": "enabled",
                "config": { "label": "fail" }
            }),
        )
        .await
        .unwrap();
    let error = app
        .call(
            "plugins.apply_change",
            json!({ "id": failed["id"].as_str().unwrap() }),
        )
        .await
        .unwrap_err()
        .to_string();
    assert!(error.contains("did not settle"), "{error}");
    assert_eq!(
        app.call("configurable.value", Value::Null).await.unwrap(),
        json!("default")
    );
    assert_eq!(
        app.plugin_config()
            .lock()
            .unwrap()
            .policy(&PluginScope::User, "configurable"),
        PluginPolicy::default()
    );
    assert_eq!(std::fs::read(&last_good_path).unwrap(), original_last_good);
    assert_eq!(
        PluginConfigStore::open(data.path())
            .unwrap()
            .policy(&PluginScope::User, "configurable"),
        PluginPolicy::default()
    );

    let pending = app
        .call(
            "plugins.plan_change",
            json!({
                "plugin": "pending",
                "scope": { "kind": "user" },
                "state": "enabled"
            }),
        )
        .await
        .unwrap();
    let error = app
        .call(
            "plugins.apply_change",
            json!({ "id": pending["id"].as_str().unwrap() }),
        )
        .await
        .unwrap_err()
        .to_string();
    assert!(error.contains("did not settle"), "{error}");
    assert!(error.contains("never-provided"), "{error}");
    assert_eq!(
        app.plugin_config()
            .lock()
            .unwrap()
            .policy(&PluginScope::User, "pending")
            .state,
        PluginOverride::Inherit
    );
    assert_eq!(std::fs::read(last_good_path).unwrap(), original_last_good);
    assert_eq!(
        PluginConfigStore::open(data.path())
            .unwrap()
            .policy(&PluginScope::User, "pending"),
        PluginPolicy::default()
    );
}

#[tokio::test]
async fn settle_rejects_an_external_global_loader_change_as_stale() {
    let data = tempfile::tempdir().unwrap();
    let app = CoreApp::boot_with(config(data.path()), registry())
        .await
        .unwrap();
    let plan = app
        .plugin_manager()
        .plan(PluginChangeRequest {
            plugin: "configurable".into(),
            scope: PluginScope::User,
            state: Some(PluginOverride::Enabled),
            config: Some(json!({ "label": "managed" })),
            component: None,
        })
        .unwrap();
    let result = app.plugin_manager().apply(&plan.id).unwrap();

    let mut external = app.loader().lock().unwrap().config().clone();
    external.plugins.get_mut("configurable").unwrap().config = json!({ "label": "external" });
    assert!(app.loader().lock().unwrap().apply(external).is_empty());

    assert!(matches!(
        app.plugin_manager()
            .settle_and_mark_last_good(&result)
            .await,
        Err(PluginManagerError::StalePlan)
    ));
}

#[tokio::test]
async fn rollback_does_not_overwrite_a_loader_change_after_failure_was_validated() {
    let data = tempfile::tempdir().unwrap();
    let app = CoreApp::boot_with(config(data.path()), registry())
        .await
        .unwrap();
    let plan = app
        .plugin_manager()
        .plan(PluginChangeRequest {
            plugin: "configurable".into(),
            scope: PluginScope::User,
            state: Some(PluginOverride::Enabled),
            config: Some(json!({ "label": "fail" })),
            component: None,
        })
        .unwrap();
    let result = app.plugin_manager().apply(&plan.id).unwrap();

    let loader = app.loader().clone();
    app.plugin_manager()
        .install_before_rollback_test_hook(move || {
            let mut external = loader.lock().unwrap().config().clone();
            external.plugins.get_mut("configurable").unwrap().config =
                json!({ "label": "external-between-check-and-rollback" });
            assert!(loader.lock().unwrap().apply(external).is_empty());
        });

    assert!(matches!(
        app.plugin_manager()
            .settle_and_mark_last_good(&result)
            .await,
        Err(PluginManagerError::StalePlan)
    ));
    assert_eq!(
        app.loader().lock().unwrap().config().plugins["configurable"].config,
        json!({ "label": "external-between-check-and-rollback" })
    );
    assert_eq!(
        app.plugin_config()
            .lock()
            .unwrap()
            .policy(&PluginScope::User, "configurable")
            .config,
        Some(json!({ "label": "fail" }))
    );
    assert_eq!(
        app.call("configurable.value", Value::Null).await.unwrap(),
        json!("external-between-check-and-rollback")
    );
}

#[tokio::test]
async fn asynchronous_rollback_failure_is_reported_after_restoration_is_flushed() {
    let data = tempfile::tempdir().unwrap();
    let fail_next_stable_apply = Arc::new(AtomicBool::new(false));
    let mut test_registry = registry();
    test_registry.register({
        let fail_next_stable_apply = fail_next_stable_apply.clone();
        move || RollbackFailurePlugin {
            fail_next_stable_apply: fail_next_stable_apply.clone(),
        }
    });
    let app = CoreApp::boot_with(
        config(data.path()).with(
            "rollback-failure",
            PluginEntry::with_config(json!({ "label": "stable" })),
        ),
        test_registry,
    )
    .await
    .unwrap();
    assert_eq!(
        app.call("rollback-failure.value", Value::Null)
            .await
            .unwrap(),
        json!("stable")
    );

    let plan = app
        .plugin_manager()
        .plan(PluginChangeRequest {
            plugin: "rollback-failure".into(),
            scope: PluginScope::User,
            state: Some(PluginOverride::Enabled),
            config: Some(json!({ "label": "reject-change" })),
            component: None,
        })
        .unwrap();
    let result = app.plugin_manager().apply(&plan.id).unwrap();
    let error = app
        .plugin_manager()
        .settle_and_mark_last_good(&result)
        .await
        .unwrap_err()
        .to_string();

    assert!(
        error.contains("requested change failed asynchronously"),
        "{error}"
    );
    assert!(error.contains("rollback failed"), "{error}");
    assert!(
        error.contains("rollback restoration failed asynchronously"),
        "{error}"
    );
}

#[tokio::test]
async fn an_enabled_affected_dependent_must_settle_before_last_good_advances() {
    let data = tempfile::tempdir().unwrap();
    let app = CoreApp::boot_with(
        config(data.path())
            .with("provider", PluginEntry::default())
            .with("dependent", PluginEntry::default()),
        registry(),
    )
    .await
    .unwrap();
    assert_eq!(
        app.call("dependent.ping", Value::Null).await.unwrap(),
        json!("pong")
    );
    let last_good_path = data.path().join("plugin-config.last-good.json");
    let original_last_good = std::fs::read(&last_good_path).unwrap();

    let plan = app
        .call(
            "plugins.plan_change",
            json!({
                "plugin": "provider",
                "scope": { "kind": "user" },
                "state": "disabled"
            }),
        )
        .await
        .unwrap();
    assert!(plan["affected"]
        .as_array()
        .unwrap()
        .iter()
        .any(|plugin| plugin == "dependent"));
    let error = app
        .call(
            "plugins.apply_change",
            json!({ "id": plan["id"].as_str().unwrap() }),
        )
        .await
        .unwrap_err()
        .to_string();

    assert!(error.contains("dependent"), "{error}");
    assert!(error.contains("Pending"), "{error}");
    assert_eq!(
        app.call("provider.ping", Value::Null).await.unwrap(),
        json!("provider")
    );
    assert_eq!(
        app.call("dependent.ping", Value::Null).await.unwrap(),
        json!("pong")
    );
    assert_eq!(std::fs::read(last_good_path).unwrap(), original_last_good);
}

#[tokio::test]
async fn startup_failure_preserves_the_previous_last_good_snapshot() {
    let data = tempfile::tempdir().unwrap();
    let app = CoreApp::boot_with(config(data.path()), registry())
        .await
        .unwrap();
    app.stop().await;
    let last_good_path = data.path().join("plugin-config.last-good.json");
    let original_last_good = std::fs::read(&last_good_path).unwrap();

    let mut persisted = PluginConfigStore::open(data.path()).unwrap();
    persisted
        .set_policy(
            PluginScope::User,
            "configurable",
            PluginPolicy {
                state: PluginOverride::Enabled,
                config: Some(json!({ "label": "fail" })),
                ..PluginPolicy::default()
            },
        )
        .unwrap();

    let app = CoreApp::boot_with(config(data.path()), registry())
        .await
        .unwrap();
    assert!(app
        .scopes()
        .iter()
        .any(|scope| { scope.plugin == "configurable" && scope.status == Status::Failed }));
    assert_eq!(std::fs::read(last_good_path).unwrap(), original_last_good);
}

#[tokio::test]
async fn safe_mode_does_not_create_a_last_good_snapshot_or_escape_on_restart() {
    let data = tempfile::tempdir().unwrap();
    std::fs::write(data.path().join("plugin-config.json"), b"{not-json").unwrap();
    let last_good_path = data.path().join("plugin-config.last-good.json");

    let app = CoreApp::boot_with(config(data.path()), registry())
        .await
        .unwrap();
    assert!(matches!(
        app.plugin_config().lock().unwrap().recovery(),
        PluginRecoveryState::SafeMode { .. }
    ));
    assert!(app.call("configurable.value", Value::Null).await.is_err());
    assert!(!last_good_path.exists());
    app.stop().await;

    let app = CoreApp::boot_with(config(data.path()), registry())
        .await
        .unwrap();
    assert!(matches!(
        app.plugin_config().lock().unwrap().recovery(),
        PluginRecoveryState::SafeMode { .. }
    ));
    assert!(app.call("configurable.value", Value::Null).await.is_err());
    assert!(!last_good_path.exists());
}

#[tokio::test]
async fn bare_host_safe_mode_keeps_the_essential_management_plane_available() {
    let data = tempfile::tempdir().unwrap();
    std::fs::write(data.path().join("plugin-config.json"), b"{not-json").unwrap();
    let app = CoreApp::boot_with(AppConfig::bare_in(data.path()), registry())
        .await
        .unwrap();

    assert!(matches!(
        app.plugin_config().lock().unwrap().recovery(),
        PluginRecoveryState::SafeMode { .. }
    ));
    assert!(app
        .commands()
        .iter()
        .any(|command| command.name == "plugins.reset"));
    app.call(
        "plugins.reset",
        json!({ "plugin": "configurable", "scope": { "kind": "user" } }),
    )
    .await
    .unwrap();
    assert!(matches!(
        app.plugin_config().lock().unwrap().recovery(),
        PluginRecoveryState::Normal
    ));
}

#[tokio::test]
async fn safe_mode_keeps_the_transitive_required_closure_but_not_optional_or_ordinary_defaults() {
    let data = tempfile::tempdir().unwrap();
    std::fs::write(data.path().join("plugin-config.json"), b"{not-json").unwrap();
    let app = CoreApp::boot_with(
        safe_mode_dependency_config(data.path()),
        safe_mode_dependency_registry(),
    )
    .await
    .unwrap();

    assert_eq!(
        app.call("safe-essential.ping", Value::Null).await.unwrap(),
        json!(true)
    );
    assert_eq!(
        app.call("safe-required.ping", Value::Null).await.unwrap(),
        json!(true)
    );
    assert_eq!(
        app.call("safe-leaf.ping", Value::Null).await.unwrap(),
        json!(true)
    );
    assert!(app.call("safe-optional.ping", Value::Null).await.is_err());
    assert!(app.call("configurable.value", Value::Null).await.is_err());
}

#[tokio::test]
async fn project_settle_checks_and_rolls_back_the_project_realm_not_the_global_instance() {
    let data = tempfile::tempdir().unwrap();
    let project = tempfile::tempdir().unwrap();
    let app = CoreApp::boot_with(config(data.path()), registry())
        .await
        .unwrap();
    assert_eq!(
        app.call_in_project(project.path(), "configurable.value", Value::Null)
            .await
            .unwrap(),
        json!("default")
    );

    let plan = app
        .call(
            "plugins.plan_change",
            json!({
                "plugin": "configurable",
                "scope": {
                    "kind": "project",
                    "project_path": project.path().to_string_lossy()
                },
                "config": { "label": "fail" }
            }),
        )
        .await
        .unwrap();
    let error = app
        .call(
            "plugins.apply_change",
            json!({ "id": plan["id"].as_str().unwrap() }),
        )
        .await
        .unwrap_err()
        .to_string();
    assert!(error.contains("did not settle"), "{error}");
    assert!(error.contains("Project"), "{error}");
    assert_eq!(
        app.call_in_project(project.path(), "configurable.value", Value::Null)
            .await
            .unwrap(),
        json!("default")
    );
    assert_eq!(
        app.call("configurable.value", Value::Null).await.unwrap(),
        json!("default")
    );
}

#[tokio::test]
async fn project_change_is_validated_in_its_realm_even_when_the_graph_was_not_loaded() {
    let data = tempfile::tempdir().unwrap();
    let project = tempfile::tempdir().unwrap();
    let app = CoreApp::boot_with(config(data.path()), registry())
        .await
        .unwrap();
    assert_eq!(app.plugin_manager().loaded_project_count(), 0);

    let plan = app
        .call(
            "plugins.plan_change",
            json!({
                "plugin": "configurable",
                "scope": {
                    "kind": "project",
                    "project_path": project.path().to_string_lossy()
                },
                "config": { "label": "fail" }
            }),
        )
        .await
        .unwrap();
    let error = app
        .call(
            "plugins.apply_change",
            json!({ "id": plan["id"].as_str().unwrap() }),
        )
        .await
        .unwrap_err()
        .to_string();

    assert!(error.contains("did not settle"), "{error}");
    assert!(error.contains("Project"), "{error}");
    assert_eq!(
        app.plugin_config()
            .lock()
            .unwrap()
            .policy(&PluginScope::project(project.path()), "configurable"),
        PluginPolicy::default()
    );
    assert_eq!(
        app.call_in_project(project.path(), "configurable.value", Value::Null)
            .await
            .unwrap(),
        json!("default")
    );
}

#[tokio::test]
async fn failed_change_rolls_back_a_project_graph_created_after_the_apply_snapshot() {
    let data = tempfile::tempdir().unwrap();
    let project = tempfile::tempdir().unwrap();
    let app = CoreApp::boot_with(config(data.path()), registry())
        .await
        .unwrap();
    let plan = app
        .plugin_manager()
        .plan(PluginChangeRequest {
            plugin: "configurable".into(),
            scope: PluginScope::User,
            state: Some(PluginOverride::Enabled),
            config: Some(json!({ "label": "fail" })),
            component: None,
        })
        .unwrap();
    let result = app.plugin_manager().apply(&plan.id).unwrap();

    assert!(app
        .call_in_project(project.path(), "configurable.value", Value::Null)
        .await
        .is_err());
    assert_eq!(app.plugin_manager().loaded_project_count(), 1);
    assert!(matches!(
        app.plugin_manager()
            .settle_and_mark_last_good(&result)
            .await,
        Err(PluginManagerError::Settle(_))
    ));

    assert_eq!(
        app.call_in_project(project.path(), "configurable.value", Value::Null)
            .await
            .unwrap(),
        json!("default")
    );
}

#[tokio::test]
async fn finalize_validates_a_project_graph_created_after_global_apply_succeeded() {
    let data = tempfile::tempdir().unwrap();
    let project = tempfile::tempdir().unwrap();
    let app = CoreApp::boot_with(config(data.path()), registry())
        .await
        .unwrap();
    let plan = app
        .plugin_manager()
        .plan(PluginChangeRequest {
            plugin: "configurable".into(),
            scope: PluginScope::User,
            state: Some(PluginOverride::Enabled),
            config: Some(json!({ "label": "project-fail" })),
            component: None,
        })
        .unwrap();
    let result = app.plugin_manager().apply(&plan.id).unwrap();
    app.flush().await;
    assert_eq!(
        app.call("configurable.value", Value::Null).await.unwrap(),
        json!("project-fail")
    );
    assert!(app
        .call_in_project(project.path(), "configurable.value", Value::Null)
        .await
        .is_err());

    assert!(matches!(
        app.plugin_manager()
            .settle_and_mark_last_good(&result)
            .await,
        Err(PluginManagerError::Settle(_))
    ));
    assert_eq!(
        app.call("configurable.value", Value::Null).await.unwrap(),
        json!("default")
    );
    assert_eq!(
        app.call_in_project(project.path(), "configurable.value", Value::Null)
            .await
            .unwrap(),
        json!("default")
    );
}

#[tokio::test]
async fn component_and_project_changes_cannot_bless_an_unrelated_failed_global_plugin() {
    let data = tempfile::tempdir().unwrap();
    let project = tempfile::tempdir().unwrap();
    let app = CoreApp::boot_with(config(data.path()), registry())
        .await
        .unwrap();
    app.stop().await;
    let last_good_path = data.path().join("plugin-config.last-good.json");
    let original_last_good = std::fs::read(&last_good_path).unwrap();
    let mut persisted = PluginConfigStore::open(data.path()).unwrap();
    persisted
        .set_policy(
            PluginScope::User,
            "configurable",
            PluginPolicy {
                state: PluginOverride::Enabled,
                config: Some(json!({ "label": "fail" })),
                ..PluginPolicy::default()
            },
        )
        .unwrap();
    let app = CoreApp::boot_with(config(data.path()), registry())
        .await
        .unwrap();

    let component = app
        .call(
            "plugins.plan_change",
            json!({
                "plugin": "dependent",
                "scope": { "kind": "user" },
                "component": "dependent.surface",
                "state": "disabled"
            }),
        )
        .await
        .unwrap();
    let error = app
        .call(
            "plugins.apply_change",
            json!({ "id": component["id"].as_str().unwrap() }),
        )
        .await
        .unwrap_err()
        .to_string();
    assert!(error.contains("configurable"), "{error}");
    assert_eq!(std::fs::read(&last_good_path).unwrap(), original_last_good);

    let project_change = app
        .call(
            "plugins.plan_change",
            json!({
                "plugin": "configurable",
                "scope": {
                    "kind": "project",
                    "project_path": project.path().to_string_lossy()
                },
                "config": { "label": "project-ok" }
            }),
        )
        .await
        .unwrap();
    let error = app
        .call(
            "plugins.apply_change",
            json!({ "id": project_change["id"].as_str().unwrap() }),
        )
        .await
        .unwrap_err()
        .to_string();
    assert!(error.contains("configurable"), "{error}");
    assert!(error.contains("Global"), "{error}");
    assert_eq!(std::fs::read(last_good_path).unwrap(), original_last_good);
}
