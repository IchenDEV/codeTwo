use codetwo_kernel::{PluginEntry, Status};
use codetwo_plugins::{AppConfig, CoreApp};
use serde_json::{json, Value};

#[tokio::test]
async fn an_enabled_unknown_entry_does_not_fail_bundle_hosts_during_registry_reconcile() {
    let data = tempfile::tempdir().unwrap();
    let app = CoreApp::boot(
        AppConfig::bare_in(data.path())
            .with(
                "paths",
                PluginEntry::with_config(json!({ "data_dir": data.path() })),
            )
            .with("ghost", PluginEntry::default())
            .with("plugin-hub", PluginEntry::default())
            .with("extensions", PluginEntry::default()),
    )
    .await
    .unwrap();

    for plugin in ["plugin-hub", "extensions"] {
        let scope = app
            .scopes()
            .into_iter()
            .find(|scope| scope.plugin == plugin)
            .unwrap_or_else(|| panic!("{plugin} scope should exist"));
        assert_eq!(
            scope.status,
            Status::Active,
            "{plugin} should survive the accepted ghost warning: {:?}",
            scope.error
        );
    }
    assert!(app.call("plugins.list", Value::Null).await.is_ok());
    assert!(app.call("extensions.list", Value::Null).await.is_ok());
}
