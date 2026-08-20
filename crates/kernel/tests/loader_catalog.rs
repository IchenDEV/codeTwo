use codetwo_kernel::{
    async_trait, App, Context, Injection, KernelError, Loader, LoaderConfig, Plugin,
    PluginCategory, PluginEntry, PluginMetadata, PluginOrigin, PluginRegistry, PluginResult,
    PluginScopeSupport,
};
use serde_json::{json, Value};

struct LegacyPlugin;

#[async_trait]
impl Plugin for LegacyPlugin {
    fn name(&self) -> &str {
        "legacy"
    }

    async fn apply(&self, _ctx: Context, _config: Value) -> PluginResult {
        Ok(())
    }
}

struct ManagedPlugin;

#[async_trait]
impl Plugin for ManagedPlugin {
    fn name(&self) -> &str {
        "managed"
    }

    fn description(&self) -> Option<&str> {
        Some("A protected host plugin")
    }

    fn metadata(&self) -> PluginMetadata {
        PluginMetadata {
            origin: PluginOrigin::Host,
            category: PluginCategory::Foundation,
            scope_support: vec![PluginScopeSupport::User, PluginScopeSupport::Project],
            essential: true,
            default_enabled: true,
        }
    }

    fn inject(&self) -> Injection {
        Injection::required(["loader"]).with_optional(["events"])
    }

    fn schema(&self) -> Option<Value> {
        Some(json!({
            "type": "object",
            "properties": { "label": { "type": "string" } }
        }))
    }

    async fn apply(&self, _ctx: Context, _config: Value) -> PluginResult {
        Ok(())
    }
}

#[tokio::test]
async fn legacy_plugins_get_backward_compatible_catalog_defaults() {
    let mut registry = PluginRegistry::new();
    registry.register(|| LegacyPlugin);

    let factory = registry.get("legacy").expect("registered factory");
    assert_eq!(factory.metadata, PluginMetadata::default());
    assert_eq!(factory.metadata.origin, PluginOrigin::BuiltIn);
    assert_eq!(factory.metadata.category, PluginCategory::Other);
    assert_eq!(factory.metadata.scope_support, [PluginScopeSupport::User]);
    assert!(!factory.metadata.essential);
    assert!(factory.metadata.default_enabled);
    assert_eq!(factory.dependencies, Injection::default());

    let app = App::new();
    let loader = Loader::new(app.ctx(), registry);
    let entry = loader.entries().into_iter().next().expect("catalog entry");
    assert!(entry.available);
    assert!(
        !entry.enabled,
        "catalog defaults do not silently install an available plugin"
    );
    assert_eq!(entry.metadata, PluginMetadata::default());
    assert_eq!(entry.dependencies, Injection::default());
    assert_eq!(entry.schema, None);

    let decoded: PluginMetadata = serde_json::from_value(json!({})).unwrap();
    assert_eq!(decoded, PluginMetadata::default());
}

#[test]
fn registry_metadata_can_be_classified_centrally() {
    let mut registry = PluginRegistry::new();
    registry.register(|| LegacyPlugin);
    let metadata = PluginMetadata {
        origin: PluginOrigin::Host,
        category: PluginCategory::Interface,
        scope_support: vec![PluginScopeSupport::User],
        essential: true,
        default_enabled: false,
    };

    registry.set_metadata("legacy", metadata.clone()).unwrap();
    assert_eq!(registry.get("legacy").unwrap().metadata, metadata);

    let error = registry
        .set_metadata("missing", PluginMetadata::default())
        .unwrap_err();
    assert!(matches!(error, KernelError::UnknownPlugin(name) if name == "missing"));
}

#[tokio::test]
async fn loader_entries_expose_factory_metadata_dependencies_and_schema() {
    let app = App::new();
    let mut registry = PluginRegistry::new();
    registry.register(|| ManagedPlugin);
    let mut loader = Loader::new(app.ctx(), registry);

    assert!(loader
        .apply(LoaderConfig::default().enable(["managed"]))
        .is_empty());
    app.flush().await;

    let entry = loader.entries().into_iter().next().expect("catalog entry");
    assert_eq!(
        entry.description.as_deref(),
        Some("A protected host plugin")
    );
    assert_eq!(entry.metadata.origin, PluginOrigin::Host);
    assert_eq!(entry.metadata.category, PluginCategory::Foundation);
    assert_eq!(
        entry.metadata.scope_support,
        [PluginScopeSupport::User, PluginScopeSupport::Project]
    );
    assert!(entry.metadata.essential);
    assert_eq!(entry.dependencies.required, ["loader"]);
    assert_eq!(entry.dependencies.optional, ["events"]);
    assert_eq!(
        entry.schema.as_ref().unwrap()["properties"]["label"]["type"],
        "string"
    );

    let wire = serde_json::to_value(entry).unwrap();
    assert_eq!(wire["metadata"]["origin"], "host");
    assert_eq!(
        wire["metadata"]["scope_support"],
        json!(["user", "project"])
    );
    assert_eq!(wire["dependencies"]["required"], json!(["loader"]));
}

#[tokio::test]
async fn essential_plugins_cannot_be_disabled_and_revision_tracks_real_changes() {
    let app = App::new();
    let mut registry = PluginRegistry::new();
    registry.register(|| ManagedPlugin);
    let mut loader = Loader::new(app.ctx(), registry);

    assert_eq!(loader.revision(), 0);
    let initial = LoaderConfig::default().with(
        "managed",
        PluginEntry::with_config(json!({ "label": "first" })),
    );
    assert!(loader.apply(initial.clone()).is_empty());
    assert_eq!(loader.revision(), 1);

    assert!(loader.apply(initial).is_empty());
    assert_eq!(
        loader.revision(),
        1,
        "an identical reconciliation is not a change"
    );

    assert!(loader
        .reconfigure("managed", json!({ "label": "second" }))
        .is_empty());
    assert_eq!(loader.revision(), 2);

    let errors = loader.set_enabled("managed", false);
    assert!(matches!(errors.as_slice(), [KernelError::EssentialPlugin(name)] if name == "managed"));
    assert_eq!(loader.revision(), 2);
    assert!(loader.config().plugins["managed"].enabled);

    let errors = loader.apply(LoaderConfig::default());
    assert!(matches!(errors.as_slice(), [KernelError::EssentialPlugin(name)] if name == "managed"));
    assert_eq!(loader.revision(), 2);
    assert!(loader.config().plugins["managed"].enabled);

    app.flush().await;
    let entry = loader.entries().into_iter().next().unwrap();
    assert!(
        entry.running,
        "rejected changes leave the essential plugin loaded"
    );
}

#[tokio::test]
async fn an_essential_plugin_cannot_start_explicitly_disabled() {
    let app = App::new();
    let mut registry = PluginRegistry::new();
    registry.register(|| ManagedPlugin);
    let mut loader = Loader::new(app.ctx(), registry);

    let errors = loader.apply(LoaderConfig::default().with("managed", PluginEntry::disabled()));
    assert!(matches!(errors.as_slice(), [KernelError::EssentialPlugin(name)] if name == "managed"));
    assert_eq!(loader.revision(), 0);
    assert!(!loader.config().plugins.contains_key("managed"));
}
