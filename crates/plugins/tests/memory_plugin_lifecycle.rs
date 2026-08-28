//! Memory is an optional, revocable engine capability rather than part of persistence itself.

use codetwo_plugins::{AppConfig, CoreApp, MemoryService};
use serde_json::{json, Value};

#[tokio::test]
async fn disabling_memory_keeps_the_engine_and_store_online() {
    let data = tempfile::tempdir().unwrap();
    let mut config = AppConfig::in_memory(data.path());
    config.plugins.plugins.retain(|name, _| {
        matches!(
            name.as_str(),
            "paths" | "store" | "bus" | "providers" | "skills" | "memory" | "engine" | "kernel"
        )
    });
    let app = CoreApp::boot(config).await.unwrap();
    assert!(app.service::<MemoryService>().is_some());
    assert!(app.call("memory.settings", Value::Null).await.is_ok());
    assert!(app
        .commands()
        .iter()
        .any(|command| command.name == "engine.submit"));

    let plan = app
        .call(
            "plugins.plan_change",
            json!({
                "plugin": "memory",
                "scope": { "kind": "user" },
                "state": "disabled"
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

    assert!(app.service::<MemoryService>().is_none());
    assert!(app.call("memory.settings", Value::Null).await.is_err());
    assert!(app
        .commands()
        .iter()
        .any(|command| command.name == "engine.submit"));
    let catalog = app
        .call("plugins.catalog", json!({ "scope": { "kind": "user" } }))
        .await
        .unwrap();
    let plugins = catalog["plugins"].as_array().unwrap();
    let memory = plugins
        .iter()
        .find(|entry| entry["id"] == "memory")
        .unwrap();
    let engine = plugins
        .iter()
        .find(|entry| entry["id"] == "engine")
        .unwrap();
    assert_eq!(memory["running"], false);
    assert_eq!(engine["running"], true);
}
