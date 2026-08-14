//! The app as a plugin graph: it boots from config, explains itself, and can be reconfigured
//! while it runs.

use codetwo_core::app::{AppConfig, CoreApp, EngineService, StoreService};
use codetwo_kernel::{PluginEntry, Status};
use serde_json::{json, Value};

/// A real store in a temp directory — the production shape. An in-memory store has no blob root,
/// so scene *artifact capture* is impossible there and `scene-runtime` correctly refuses to run;
/// that is a fine configuration to have, but not the one to assert "everything loads" against.
async fn boot() -> (CoreApp, tempfile::TempDir) {
    let dir = tempfile::tempdir().expect("tempdir");
    let app = CoreApp::boot(AppConfig::new(dir.path())).await.expect("boot");
    (app, dir)
}

fn status_of(app: &CoreApp, plugin: &str) -> Status {
    app.scopes()
        .into_iter()
        .find(|scope| scope.plugin == plugin)
        .map(|scope| scope.status)
        .unwrap_or(Status::Disposed)
}

#[tokio::test]
async fn the_default_config_boots_every_builtin() {
    let (app, _dir) = boot().await;

    for plugin in codetwo_core::app::plugins::BUILTIN {
        assert_eq!(status_of(&app, plugin), Status::Active, "{plugin} should be active");
    }
    let services: Vec<String> = app.services().into_iter().map(|s| s.name).collect();
    for expected in ["paths", "store", "bus", "providers", "skills", "scenes", "engine"] {
        assert!(services.contains(&expected.to_string()), "missing service {expected}");
    }
    assert!(app.service::<EngineService>().is_some(), "in-process callers get the real thing");
}

#[tokio::test]
async fn plugins_contribute_the_app_surface() {
    let (app, dir) = boot().await;

    let commands: Vec<String> = app.commands().into_iter().map(|c| c.name).collect();
    for expected in ["git.status", "memory.list", "providers.list", "sessions.list", "skills.list"]
    {
        assert!(commands.contains(&expected.to_string()), "missing command {expected}");
    }

    // A command with no dependencies at all.
    let status = app
        .call("git.status", json!({ "cwd": dir.path().to_string_lossy() }))
        .await
        .expect("git.status");
    assert!(status.get("files").is_some());

    // One that reads an injected service.
    let providers = app.call("providers.list", Value::Null).await.expect("providers.list");
    assert!(providers.as_array().is_some_and(|list| !list.is_empty()));

    // And one that writes through it.
    let record = app
        .call(
            "memory.add",
            json!({ "project_path": "/tmp/demo", "category": "note", "content": "remember this" }),
        )
        .await
        .expect("memory.add");
    assert_eq!(record["content"], "remember this");
    let listed = app.call("memory.list", json!({ "project_path": "/tmp/demo" })).await.unwrap();
    assert_eq!(listed.as_array().map(Vec::len), Some(1));
}

#[tokio::test]
async fn an_unknown_command_is_an_error_not_a_panic() {
    let (app, _dir) = boot().await;
    let error = app.call("nope.missing", Value::Null).await.unwrap_err();
    assert!(error.to_string().contains("nope.missing"));
}

#[tokio::test]
async fn bad_arguments_are_reported_against_the_command() {
    let (app, _dir) = boot().await;
    let error = app.call("git.status", json!({ "wrong": 1 })).await.unwrap_err();
    assert!(error.to_string().contains("git.status"), "{error}");
}

#[tokio::test]
async fn turning_storage_off_takes_everything_downstream_with_it() {
    let (app, _dir) = boot().await;
    assert_eq!(status_of(&app, "engine"), Status::Active);

    app.call("kernel.set_enabled", json!({ "name": "store", "value": false })).await.unwrap();
    app.flush().await;

    assert_eq!(status_of(&app, "store"), Status::Disposed);
    assert_eq!(status_of(&app, "engine"), Status::Pending, "the engine needs a store");
    assert_eq!(status_of(&app, "memory"), Status::Pending);
    assert_eq!(status_of(&app, "git"), Status::Active, "git never needed one");
    assert!(app.service::<StoreService>().is_none());
    assert!(
        app.call("memory.list", json!({ "project_path": "/tmp/demo" })).await.is_err(),
        "the surface goes away with the plugin instead of failing at call time"
    );

    // And back again, with no restart.
    app.call("kernel.set_enabled", json!({ "name": "store", "value": true })).await.unwrap();
    app.flush().await;
    assert_eq!(status_of(&app, "engine"), Status::Active);
    assert!(app.call("memory.list", json!({ "project_path": "/tmp/demo" })).await.is_ok());
}

#[tokio::test]
async fn reconfiguring_a_dependency_rebuilds_what_was_built_on_it() {
    let (app, dir) = boot().await;
    let first = app.service::<EngineService>().expect("engine");

    let db = dir.path().join("moved.db");
    app.call(
        "kernel.configure",
        json!({ "name": "store", "config": { "path": db.to_string_lossy() } }),
    )
    .await
    .unwrap();
    app.flush().await;

    assert_eq!(status_of(&app, "engine"), Status::Active);
    let second = app.service::<EngineService>().expect("engine");
    assert!(
        !std::sync::Arc::ptr_eq(&first, &second),
        "the engine was rebuilt against the new store rather than left holding the old one"
    );
    assert!(db.exists());
}

#[tokio::test]
async fn the_graph_reports_what_it_is_waiting_for() {
    let dir = tempfile::tempdir().unwrap();
    // A config with an engine but no store: a legitimate configuration, not a crash.
    let config = AppConfig::in_memory(dir.path()).without("store");
    let app = CoreApp::boot(config).await.unwrap();

    assert_eq!(status_of(&app, "engine"), Status::Pending);
    let engine = app.scopes().into_iter().find(|s| s.plugin == "engine").unwrap();
    assert_eq!(engine.missing, ["store"]);

    let listed = app.call("kernel.scopes", Value::Null).await.unwrap();
    let reported = listed
        .as_array()
        .unwrap()
        .iter()
        .find(|scope| scope["plugin"] == "engine")
        .expect("engine in kernel.scopes");
    assert_eq!(reported["status"], "pending");
    assert_eq!(reported["missing"][0], "store");
}

#[tokio::test]
async fn a_minimal_host_can_run_two_plugins_and_nothing_else() {
    let dir = tempfile::tempdir().unwrap();
    let config = AppConfig::bare()
        .with("git", PluginEntry::default())
        .with("market", PluginEntry::default());
    let app = CoreApp::boot(config).await.unwrap();
    let _ = dir;

    let commands: Vec<String> = app.commands().into_iter().map(|c| c.name).collect();
    assert!(commands.contains(&"git.status".to_string()));
    assert!(commands.contains(&"market.catalog".to_string()));
    assert!(!commands.iter().any(|name| name.starts_with("sessions.")));
    // Only the loader itself, which the root provides so a plugin manager has something to manage.
    let services: Vec<String> = app.services().into_iter().map(|s| s.name).collect();
    assert_eq!(services, ["loader"], "neither plugin publishes a service");
}

#[tokio::test]
async fn the_plugin_manager_lists_what_is_installable_with_its_schema() {
    let (app, _dir) = boot().await;
    let entries = app.call("kernel.plugins", Value::Null).await.unwrap();
    let entries = entries.as_array().unwrap();

    let store = entries.iter().find(|entry| entry["name"] == "store").unwrap();
    assert_eq!(store["running"], true);
    assert_eq!(store["status"], "active");
    assert!(store["schema"]["properties"]["path"].is_object(), "a settings form can be generated");

    let installed = app.call("plugins.list", Value::Null).await.unwrap();
    assert_eq!(installed.as_array().map(Vec::len), Some(0), "no bundles installed in a temp dir");
}

#[tokio::test]
async fn stopping_unloads_the_whole_graph() {
    let (app, _dir) = boot().await;
    app.stop().await;
    let services: Vec<String> = app.services().into_iter().map(|s| s.name).collect();
    assert_eq!(services, ["loader"], "everything but the root's own service is gone");
    assert!(app.commands().is_empty());
}
