use codetwo_kernel::{
    async_trait, App, Context, KernelError, Loader, LoaderConfig, Plugin, PluginEntry,
    PluginMetadata, PluginRegistry, PluginResult,
};
use serde_json::{json, Value};

struct VersionedPlugin {
    version: &'static str,
}

#[async_trait]
impl Plugin for VersionedPlugin {
    fn name(&self) -> &str {
        "dynamic"
    }

    async fn apply(&self, ctx: Context, config: Value) -> PluginResult {
        let version = self.version;
        let label = config
            .get("label")
            .and_then(Value::as_str)
            .unwrap_or("unset")
            .to_string();
        ctx.command("dynamic.version", move |_| {
            let label = label.clone();
            async move { Ok(json!({ "version": version, "label": label })) }
        })?;
        Ok(())
    }
}

fn versioned_registry(version: &'static str) -> PluginRegistry {
    let mut registry = PluginRegistry::new();
    registry.register(move || VersionedPlugin { version });
    registry
}

#[tokio::test]
async fn registry_reconcile_rebuilds_a_changed_live_factory_and_bumps_once() {
    let app = App::new();
    let initial = LoaderConfig::default().with(
        "dynamic",
        PluginEntry::with_config(json!({ "label": "one" })),
    );
    let mut loader = Loader::new(app.ctx(), versioned_registry("v1"));
    assert!(loader.apply(initial.clone()).is_empty());
    app.flush().await;
    assert_eq!(loader.revision(), 1);
    assert_eq!(
        app.ctx()
            .call("dynamic.version", Value::Null)
            .await
            .unwrap(),
        json!({ "version": "v1", "label": "one" })
    );

    assert!(loader
        .reconcile_registry(versioned_registry("v2"), ["dynamic"], initial.clone())
        .is_accepted());
    assert_eq!(
        loader.revision(),
        2,
        "a same-name registry-only replacement is observable"
    );
    app.flush().await;
    assert_eq!(
        app.ctx()
            .call("dynamic.version", Value::Null)
            .await
            .unwrap(),
        json!({ "version": "v2", "label": "one" })
    );

    let next = LoaderConfig::default().with(
        "dynamic",
        PluginEntry::with_config(json!({ "label": "two" })),
    );
    assert!(loader
        .reconcile_registry(versioned_registry("v3"), ["dynamic"], next)
        .is_accepted());
    assert_eq!(
        loader.revision(),
        3,
        "one registry+config transaction advances the graph revision once"
    );
    app.flush().await;
    assert_eq!(
        app.ctx()
            .call("dynamic.version", Value::Null)
            .await
            .unwrap(),
        json!({ "version": "v3", "label": "two" })
    );

    let unchanged = loader.registry().clone();
    let unchanged_config = loader.config().clone();
    assert!(loader
        .reconcile_registry(unchanged, std::iter::empty::<String>(), unchanged_config)
        .is_accepted());
    assert_eq!(
        loader.revision(),
        3,
        "an identical desired graph is a no-op"
    );
}

#[tokio::test]
async fn registry_extend_uses_the_later_factory_on_a_name_conflict() {
    let app = App::new();
    let mut desired = versioned_registry("base");
    desired.extend(versioned_registry("source"));
    let mut loader = Loader::new(app.ctx(), desired);

    assert!(loader
        .apply(LoaderConfig::default().with("dynamic", PluginEntry::default()))
        .is_empty());
    app.flush().await;

    assert_eq!(
        app.ctx()
            .call("dynamic.version", Value::Null)
            .await
            .unwrap(),
        json!({ "version": "source", "label": "unset" })
    );
}

#[tokio::test]
async fn unregistering_a_live_factory_unloads_it_and_reports_an_enabled_unknown_entry() {
    let app = App::new();
    let desired_config =
        LoaderConfig::default().with("dynamic", PluginEntry::with_config(Value::Null));
    let mut loader = Loader::new(app.ctx(), versioned_registry("v1"));
    assert!(loader.apply(desired_config.clone()).is_empty());
    app.flush().await;

    let mut desired_registry = loader.registry().clone();
    assert!(desired_registry.unregister("dynamic"));
    assert!(!desired_registry.unregister("dynamic"));
    let outcome = loader.reconcile_registry(
        desired_registry,
        std::iter::empty::<String>(),
        desired_config,
    );

    assert!(
        outcome.is_accepted(),
        "an unknown config entry is an accepted warning, matching legacy apply semantics"
    );
    assert!(matches!(
        outcome.warnings(),
        [KernelError::UnknownPlugin(name)] if name == "dynamic"
    ));
    assert!(outcome.errors().is_empty());
    assert_eq!(loader.revision(), 2, "registry-only removal is observable");
    app.flush().await;
    assert!(matches!(
        app.ctx().call("dynamic.version", Value::Null).await,
        Err(KernelError::UnknownCommand(name)) if name == "dynamic.version"
    ));
}

#[tokio::test]
async fn rejected_essential_factory_removal_leaves_registry_config_and_runtime_unchanged() {
    let app = App::new();
    let mut registry = versioned_registry("essential");
    registry
        .set_metadata(
            "dynamic",
            PluginMetadata {
                essential: true,
                ..PluginMetadata::default()
            },
        )
        .unwrap();
    let config = LoaderConfig::default().with("dynamic", PluginEntry::default());
    let mut loader = Loader::new(app.ctx(), registry);
    assert!(loader.apply(config.clone()).is_empty());
    app.flush().await;

    let mut desired = loader.registry().clone();
    assert!(desired.unregister("dynamic"));
    let outcome = loader.reconcile_registry(
        desired,
        std::iter::empty::<String>(),
        LoaderConfig::default(),
    );

    assert!(!outcome.is_accepted());
    assert!(outcome.warnings().is_empty());
    assert!(matches!(
        outcome.errors(),
        [KernelError::EssentialPlugin(name)] if name == "dynamic"
    ));
    assert_eq!(loader.revision(), 1);
    assert!(loader.registry().get("dynamic").is_some());
    assert_eq!(loader.config(), &config);
    assert_eq!(
        app.ctx()
            .call("dynamic.version", Value::Null)
            .await
            .unwrap(),
        json!({ "version": "essential", "label": "unset" })
    );
}
