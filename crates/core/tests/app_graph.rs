//! The app as a plugin graph: it boots from config, explains itself, and can be reconfigured
//! while it runs.

use base64::Engine as _;
use codetwo_core::app::plugins::{EngineInputs, EnginePlugin};
use codetwo_core::app::{AppConfig, CoreApp, EngineService, StoreService};
use codetwo_core::Engine;
use codetwo_kernel::{CommandVisibility, KernelError, PluginEntry, Status};
use serde_json::{json, Value};
use std::sync::Arc;

/// A real store in a temp directory — the production shape. An in-memory store has no blob root,
/// so scene *artifact capture* is impossible there and `scene-runtime` correctly refuses to run;
/// that is a fine configuration to have, but not the one to assert "everything loads" against.
async fn boot() -> (CoreApp, tempfile::TempDir) {
    let dir = tempfile::tempdir().expect("tempdir");
    let app = CoreApp::boot(AppConfig::new(dir.path()))
        .await
        .expect("boot");
    (app, dir)
}

fn status_of(app: &CoreApp, plugin: &str) -> Status {
    app.scopes()
        .into_iter()
        .find(|scope| scope.plugin == plugin)
        .map(|scope| scope.status)
        .unwrap_or(Status::Disposed)
}

async fn change_plugin(
    app: &CoreApp,
    plugin: &str,
    state: Option<&str>,
    config: Option<Value>,
) -> Result<Value, KernelError> {
    let plan = app
        .call(
            "plugins.plan_change",
            json!({
                "plugin": plugin,
                "scope": { "kind": "user" },
                "state": state,
                "config": config,
            }),
        )
        .await?;
    app.call(
        "plugins.apply_change",
        json!({ "id": plan["id"].as_str().expect("plan id") }),
    )
    .await
}

#[tokio::test]
async fn the_default_config_boots_every_builtin() {
    let (app, _dir) = boot().await;

    for plugin in codetwo_core::app::plugins::BUILTIN {
        assert_eq!(
            status_of(&app, plugin),
            Status::Active,
            "{plugin} should be active"
        );
    }
    let services: Vec<String> = app.services().into_iter().map(|s| s.name).collect();
    for expected in [
        "paths",
        "store",
        "bus",
        "providers",
        "skills",
        "scenes",
        "engine",
        "handoff",
    ] {
        assert!(
            services.contains(&expected.to_string()),
            "missing service {expected}"
        );
    }
    assert!(
        app.service::<EngineService>().is_some(),
        "in-process callers get the real thing"
    );
}

#[tokio::test]
async fn plugins_contribute_the_app_surface() {
    let (app, dir) = boot().await;

    let commands: Vec<String> = app.commands().into_iter().map(|c| c.name).collect();
    for expected in [
        "artifacts.get",
        "attachments.import",
        "canvas.feature_state",
        "document.compile",
        "engine.answer_elicitation",
        "git.status",
        "handoff.transfer_pairing",
        "issues.delegations",
        "market.catalog",
        "memory.list",
        "pipelines.start",
        "projects.list",
        "browser_use.settings",
        "browser_use.select",
        "computer_use.settings",
        "computer_use.select",
        "providers.list",
        "scenes.apply",
        "sessions.list",
        "skills.list",
        "terminal.spawn",
        "usage.report",
        "voice.available",
        "workspace.list_files",
        "workspace.search",
        "worktrees.list",
    ] {
        assert!(
            commands.contains(&expected.to_string()),
            "missing command {expected}"
        );
    }

    // A command with no dependencies at all.
    let status = app
        .call("git.status", json!({ "cwd": dir.path().to_string_lossy() }))
        .await
        .expect("git.status");
    assert!(status.get("files").is_some());
    let git_status = app
        .commands()
        .into_iter()
        .find(|command| command.name == "git.status")
        .unwrap();
    assert_eq!(git_status.visibility, CommandVisibility::ExtensionPublic);
    let extension_commands = app
        .ctx()
        .extension_public_commands()
        .into_iter()
        .map(|command| command.name)
        .collect::<Vec<_>>();
    assert!(extension_commands.contains(&"git.status".to_string()));
    assert!(
        !extension_commands.contains(&"git.push".to_string()),
        "mutating Git commands stay out of the extension interface"
    );

    // One that reads an injected service.
    let providers = app
        .call("providers.list", Value::Null)
        .await
        .expect("providers.list");
    assert!(providers.as_array().is_some_and(|list| !list.is_empty()));

    // And one that writes through it.
    let record = app
        .call(
            "memory.add",
            json!({ "project_path": "/tmp/demo", "category": "fact", "content": "remember this" }),
        )
        .await
        .expect("memory.add");
    assert_eq!(record["content"], "remember this");
    let listed = app
        .call("memory.list", json!({ "project_path": "/tmp/demo" }))
        .await
        .unwrap();
    assert_eq!(listed.as_array().map(Vec::len), Some(1));

    let canvas = app.call("canvas.feature_state", Value::Null).await.unwrap();
    assert_eq!(canvas["feature"], "CODETWO_CANVAS_INPUT_V1");
    assert_eq!(canvas["enabled"], false);
    assert_eq!(canvas["status"], "not production-enabled");

    let png = base64::engine::general_purpose::STANDARD
        .decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=")
        .unwrap();
    let attachment = app
        .call(
            "attachments.import",
            json!({ "bytes": png, "declared_mime": "image/png", "name": "pasted.png" }),
        )
        .await
        .expect("attachments.import");
    assert_eq!(attachment["kind"], "attachment");
    assert_eq!(attachment["window_title"], "pasted.png");
    assert!(attachment["preview_data_url"]
        .as_str()
        .is_some_and(|value| value.starts_with("data:image/png;base64,")));
}

#[tokio::test]
async fn browser_use_selection_is_global() {
    let (app, _dir) = boot().await;
    let settings = app
        .call("browser_use.select", json!({ "backend": "automatic" }))
        .await
        .expect("browser_use.select");

    assert_eq!(settings["selections"]["*"], "automatic");
}

#[tokio::test]
async fn a_legacy_work_automation_database_keeps_store_commands_available() {
    let dir = tempfile::tempdir().expect("tempdir");
    {
        let conn = rusqlite::Connection::open(dir.path().join("codetwo.db")).expect("database");
        conn.execute_batch(
            "CREATE TABLE automations (
               id TEXT PRIMARY KEY,
               task_id TEXT NOT NULL,
               trigger TEXT NOT NULL,
               configuration_json TEXT NOT NULL,
               enabled INTEGER NOT NULL DEFAULT 1,
               non_overlapping INTEGER NOT NULL DEFAULT 1,
               created_at INTEGER NOT NULL,
               updated_at INTEGER NOT NULL
             );
             CREATE TABLE automation_runs (
               id TEXT PRIMARY KEY,
               automation_id TEXT NOT NULL REFERENCES automations(id),
               status TEXT NOT NULL,
               scheduled_at INTEGER NOT NULL,
               metadata_json TEXT NOT NULL
             );",
        )
        .expect("legacy schema");
    }

    let app = CoreApp::boot(AppConfig::new(dir.path()))
        .await
        .expect("boot with legacy automation schema");

    app.call(
        "projects.add",
        json!({ "path": dir.path().to_string_lossy() }),
    )
    .await
    .expect("projects.add");
    for plugin in ["store", "memory", "engine", "projects"] {
        assert_eq!(
            status_of(&app, plugin),
            Status::Active,
            "{plugin} should remain active"
        );
    }
    app.call("memory.settings", Value::Null)
        .await
        .expect("memory.settings");
    app.call("memory.list", json!({ "project_path": "/tmp/demo" }))
        .await
        .expect("memory.list");
    app.call("sessions.list", Value::Null)
        .await
        .expect("sessions.list");
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
    let error = app
        .call("git.status", json!({ "wrong": 1 }))
        .await
        .unwrap_err();
    assert!(error.to_string().contains("git.status"), "{error}");
}

#[tokio::test]
async fn core_storage_cannot_be_disabled_through_extension_policy() {
    let (app, _dir) = boot().await;
    assert_eq!(status_of(&app, "engine"), Status::Active);

    let error = change_plugin(&app, "store", Some("disabled"), None)
        .await
        .unwrap_err()
        .to_string();
    assert!(error.contains("core module `store`"), "{error}");
    assert!(error.contains("host configuration"), "{error}");
    app.flush().await;

    assert_eq!(status_of(&app, "store"), Status::Active);
    assert_eq!(status_of(&app, "engine"), Status::Active);
    assert_eq!(status_of(&app, "memory"), Status::Active);
    for plugin in [
        "artifacts",
        "canvas",
        "cost",
        "document",
        "issues",
        "projects",
        "scene-commands",
        "scene-runtime",
        "scenes",
        "workspace-search",
    ] {
        assert_eq!(
            status_of(&app, plugin),
            Status::Active,
            "{plugin} should be restored by the rejected transaction"
        );
    }
    assert_eq!(
        status_of(&app, "git"),
        Status::Active,
        "git never needed one"
    );
    assert!(app.service::<StoreService>().is_some());
    assert!(
        app.call("memory.list", json!({ "project_path": "/tmp/demo" }))
            .await
            .is_ok(),
        "rollback restores the command surface"
    );
}

#[tokio::test]
async fn disabling_a_leaf_removes_its_service_and_command_surface() {
    let (app, _dir) = boot().await;
    assert!(app
        .call("terminal.tmux_available", Value::Null)
        .await
        .is_ok());

    change_plugin(&app, "terminal", Some("disabled"), None)
        .await
        .unwrap();
    app.flush().await;

    assert_eq!(status_of(&app, "terminal"), Status::Disposed);
    assert!(!app
        .services()
        .into_iter()
        .any(|service| service.name == "terminal"));
    assert!(app
        .call("terminal.tmux_available", Value::Null)
        .await
        .is_err());
}

#[tokio::test]
async fn disabling_a_required_host_capability_rolls_back_the_transaction() {
    let dir = tempfile::tempdir().unwrap();
    let mut registry = codetwo_core::app::plugins::builtin_registry();
    registry.register_arc(Box::new(|| {
        Arc::new(EnginePlugin::with_builder_and_required(
            Arc::new(|inputs: EngineInputs| {
                Engine::with_store(inputs.providers, inputs.skills, inputs.store)
            }),
            ["terminal"],
        ))
    }));
    let app = CoreApp::boot_with(AppConfig::new(dir.path()), registry)
        .await
        .unwrap();
    assert_eq!(status_of(&app, "engine"), Status::Active);

    let error = change_plugin(&app, "terminal", Some("disabled"), None)
        .await
        .unwrap_err()
        .to_string();
    assert!(error.contains("did not settle"), "{error}");
    assert!(error.contains("Pending"), "{error}");
    app.flush().await;

    assert_eq!(status_of(&app, "terminal"), Status::Active);
    assert_eq!(status_of(&app, "engine"), Status::Active);
    assert!(app.service::<EngineService>().is_some());
}

#[tokio::test]
async fn host_configuration_can_rebuild_a_core_dependency() {
    let (app, dir) = boot().await;
    let first = app.service::<EngineService>().expect("engine");

    let db = dir.path().join("moved.db");
    let mut next = app.loader().lock().unwrap().config().clone();
    next.plugins.get_mut("store").unwrap().config = json!({ "path": db.to_string_lossy() });
    let errors = app.loader().lock().unwrap().apply(next);
    assert!(errors.is_empty(), "host config failed: {errors:?}");
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
    let engine = app
        .scopes()
        .into_iter()
        .find(|s| s.plugin == "engine")
        .unwrap();
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
        .with("usage", PluginEntry::default());
    let app = CoreApp::boot(config).await.unwrap();
    let _ = dir;

    let commands: Vec<String> = app.commands().into_iter().map(|c| c.name).collect();
    assert!(commands.contains(&"git.status".to_string()));
    assert!(commands.contains(&"usage.report".to_string()));
    assert!(!commands.iter().any(|name| name.starts_with("sessions.")));
    // Only the loader itself, which the root provides so a plugin manager has something to manage.
    let services: Vec<String> = app.services().into_iter().map(|s| s.name).collect();
    assert_eq!(
        services,
        ["loader", "plugin-config", "plugin-manager"],
        "neither plugin publishes a feature service"
    );
}

#[tokio::test]
async fn the_plugin_manager_lists_what_is_installable_with_its_schema() {
    let (app, _dir) = boot().await;
    let entries = app.call("kernel.plugins", Value::Null).await.unwrap();
    let entries = entries.as_array().unwrap();

    let store = entries
        .iter()
        .find(|entry| entry["name"] == "store")
        .unwrap();
    assert_eq!(store["running"], true);
    assert_eq!(store["status"], "active");
    assert!(
        store["schema"]["properties"]["path"].is_object(),
        "a settings form can be generated"
    );

    let installed = app.call("plugins.list", Value::Null).await.unwrap();
    assert_eq!(
        installed.as_array().map(Vec::len),
        Some(0),
        "no bundles installed in a temp dir"
    );
}

#[tokio::test]
async fn stopping_unloads_the_whole_graph() {
    let (app, _dir) = boot().await;
    app.stop().await;
    let services: Vec<String> = app.services().into_iter().map(|s| s.name).collect();
    assert_eq!(
        services,
        ["loader", "plugin-config", "plugin-manager"],
        "everything but the root management services is gone"
    );
    assert!(app.commands().is_empty());
}
