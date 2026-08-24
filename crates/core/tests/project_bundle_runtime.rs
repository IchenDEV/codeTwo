use codetwo_core::app::events::PluginsChanged;
use codetwo_core::app::{
    AppConfig, CoreApp, PluginChangeRequest, PluginManagerError, PluginOverride, PluginScope,
};
use codetwo_kernel::{
    CommandRealm, KernelError, PluginEntry, PluginOrigin, PluginScopeSupport, Status,
};
use serde_json::{json, Value};
use std::path::Path;

#[cfg(unix)]
fn install_runtime_bundle(data_dir: &Path, id: &str, project_capable: bool) {
    use std::os::unix::fs::PermissionsExt;

    let plugin_dir = data_dir.join("plugins").join(id);
    let bundle_dir = plugin_dir.join("bundle");
    std::fs::create_dir_all(&bundle_dir).unwrap();
    let server = bundle_dir.join("server.sh");
    std::fs::write(
        &server,
        r#"#!/bin/sh
IFS= read -r initialize || exit 1
initialize_id=$(printf '%s' "$initialize" | sed -n 's/.*"id":\([0-9][0-9]*\).*/\1/p')
data_dir=$(printf '%s' "$initialize" | sed -n 's/.*"dataDir":"\([^"]*\)".*/\1/p')
project_path=$(printf '%s' "$initialize" | sed -n 's/.*"projectPath":"\([^"]*\)".*/\1/p')
printf '{"jsonrpc":"2.0","id":%s,"result":{"name":"fixture","version":"1.0.0","protocolVersion":"1.0.0","commands":[{"name":"bundle.where"}],"events":[]}}\n' "$initialize_id"
while IFS= read -r request; do
  request_id=$(printf '%s' "$request" | sed -n 's/.*"id":\([0-9][0-9]*\).*/\1/p')
  printf '{"jsonrpc":"2.0","id":%s,"result":{"pid":%s,"dataDir":"%s","projectPath":"%s"}}\n' "$request_id" "$$" "$data_dir" "$project_path"
done
"#,
    )
    .unwrap();
    std::fs::set_permissions(&server, std::fs::Permissions::from_mode(0o755)).unwrap();

    let mut runtime = json!({
        "protocol": "1.0.0",
        "command": server,
    });
    if project_capable {
        runtime["scopeSupport"] = json!(["user", "project"]);
    }
    let record = json!({
        "schema_version": 3,
        "id": id,
        "name": "Project Fixture",
        "version": "1.0.0",
        "description": "A process bundle used to verify project isolation.",
        "author": "CodeTwo",
        "source": "local-test",
        "repository": bundle_dir,
        "standard_version": "1.0.0",
        "enabled": true,
        "trusted": true,
        "scope": "user",
        "counts": {
            "skills": 0,
            "subagents": 0,
            "mcp_servers": 0,
            "scenes": 0,
            "pipelines": 0,
            "scaffolds": 0,
            "runtime": 1
        },
        "components": [],
        "scaffolds": [],
        "extension_components": [],
        "ui_contributions": [],
        "lsp_servers": [],
        "diagnostics": [],
        "runtime": runtime
    });
    std::fs::write(
        plugin_dir.join("installed-plugin.json"),
        serde_json::to_vec_pretty(&record).unwrap(),
    )
    .unwrap();
}

async fn boot(data_dir: &Path) -> CoreApp {
    CoreApp::boot(
        AppConfig::bare_in(data_dir)
            .with(
                "paths",
                PluginEntry::with_config(json!({ "data_dir": data_dir })),
            )
            .with("plugin-hub", PluginEntry::default())
            .with("extensions", PluginEntry::default()),
    )
    .await
    .unwrap()
}

async fn change(
    app: &CoreApp,
    plugin: &str,
    scope: PluginScope,
    state: PluginOverride,
) -> Result<(), PluginManagerError> {
    let plan = app.plugin_manager().plan(PluginChangeRequest {
        plugin: plugin.to_string(),
        scope,
        state: Some(state),
        config: None,
        component: None,
    })?;
    let result = app.plugin_manager().apply(&plan.id)?;
    app.plugin_manager()
        .settle_and_mark_last_good(&result)
        .await
}

#[cfg(unix)]
#[tokio::test]
async fn an_installed_process_bundle_is_a_managed_project_plugin() {
    let data = tempfile::tempdir().unwrap();
    let project_a = tempfile::tempdir().unwrap();
    let project_b = tempfile::tempdir().unwrap();
    install_runtime_bundle(data.path(), "fixture", true);
    let app = boot(data.path()).await;

    let user_catalog = app.plugin_manager().catalog(PluginScope::User).unwrap();
    let bundle = user_catalog
        .plugins
        .iter()
        .find(|entry| entry.id == "bundle:fixture")
        .expect("installed process bundles belong to the unified catalog");
    assert_eq!(bundle.metadata.origin, PluginOrigin::ThirdParty);
    assert_eq!(
        bundle.metadata.scope_support,
        [PluginScopeSupport::User, PluginScopeSupport::Project]
    );
    assert_eq!(bundle.status, Some(Status::Active));

    let global = app.call("bundle.where", Value::Null).await.unwrap();
    let local_a = app
        .call_in_project(project_a.path(), "bundle.where", Value::Null)
        .await
        .unwrap();
    let local_b = app
        .call_in_project(project_b.path(), "bundle.where", Value::Null)
        .await
        .unwrap();
    let normalized_a = project_a
        .path()
        .canonicalize()
        .unwrap()
        .to_string_lossy()
        .into_owned();
    let normalized_b = project_b
        .path()
        .canonicalize()
        .unwrap()
        .to_string_lossy()
        .into_owned();

    assert_eq!(global["projectPath"], "");
    assert_eq!(local_a["projectPath"], normalized_a);
    assert_eq!(local_b["projectPath"], normalized_b);
    assert_ne!(global["pid"], local_a["pid"]);
    assert_ne!(local_a["pid"], local_b["pid"]);
    assert_ne!(global["dataDir"], local_a["dataDir"]);
    assert_ne!(local_a["dataDir"], local_b["dataDir"]);

    change(
        &app,
        "bundle:fixture",
        PluginScope::project(project_a.path()),
        PluginOverride::Disabled,
    )
    .await
    .unwrap();
    let blocked = app
        .call_in_project(project_a.path(), "bundle.where", Value::Null)
        .await
        .unwrap_err();
    assert!(matches!(
        blocked,
        KernelError::CommandFallbackBlocked { .. }
    ));
    assert!(app
        .call_in_project(project_b.path(), "bundle.where", Value::Null)
        .await
        .is_ok());
    assert!(app.call("bundle.where", Value::Null).await.is_ok());

    let realms = app
        .scopes()
        .into_iter()
        .filter(|scope| scope.plugin == "bundle:fixture" && scope.status == Status::Active)
        .map(|scope| scope.command_realm)
        .collect::<Vec<_>>();
    assert!(realms.contains(&CommandRealm::Global));
    assert!(realms.contains(&CommandRealm::project(normalized_b)));
    assert!(!realms.contains(&CommandRealm::project(normalized_a)));
}

#[cfg(unix)]
#[tokio::test]
async fn installed_bundle_events_reconcile_factories_without_a_restart() {
    let data = tempfile::tempdir().unwrap();
    let app = boot(data.path()).await;
    let stale_plan = app
        .plugin_manager()
        .plan(PluginChangeRequest {
            plugin: "extensions".into(),
            scope: PluginScope::User,
            state: Some(PluginOverride::Disabled),
            config: None,
            component: None,
        })
        .unwrap();
    assert!(app
        .plugin_manager()
        .catalog(PluginScope::User)
        .unwrap()
        .plugins
        .iter()
        .all(|entry| entry.id != "bundle:late"));

    install_runtime_bundle(data.path(), "late", true);
    app.ctx().emit(PluginsChanged).await;
    app.flush().await;
    assert!(matches!(
        app.plugin_manager().apply(&stale_plan.id),
        Err(PluginManagerError::StalePlan)
    ));
    assert!(app
        .plugin_manager()
        .catalog(PluginScope::User)
        .unwrap()
        .plugins
        .iter()
        .any(|entry| entry.id == "bundle:late"));
    assert!(app.call("bundle.where", Value::Null).await.is_ok());

    std::fs::remove_dir_all(data.path().join("plugins").join("late")).unwrap();
    app.ctx().emit(PluginsChanged).await;
    app.flush().await;
    assert!(app
        .plugin_manager()
        .catalog(PluginScope::User)
        .unwrap()
        .plugins
        .iter()
        .all(|entry| entry.id != "bundle:late"));
    assert!(app.call("bundle.where", Value::Null).await.is_err());
}

#[cfg(unix)]
#[tokio::test]
async fn runtime_manifests_are_user_only_unless_project_support_is_explicit() {
    let data = tempfile::tempdir().unwrap();
    let project = tempfile::tempdir().unwrap();
    install_runtime_bundle(data.path(), "user-only", false);
    let app = boot(data.path()).await;

    let project_catalog = app
        .plugin_manager()
        .catalog(PluginScope::project(project.path()))
        .unwrap();
    let bundle = project_catalog
        .plugins
        .iter()
        .find(|entry| entry.id == "bundle:user-only")
        .expect("user-only runtimes remain visible from a project as their global instance");
    assert_eq!(bundle.metadata.scope_support, [PluginScopeSupport::User]);
    assert_eq!(bundle.status, Some(Status::Active));

    let global = app.call("bundle.where", Value::Null).await.unwrap();
    let from_project = app
        .call_in_project(project.path(), "bundle.where", Value::Null)
        .await
        .unwrap();
    assert_eq!(from_project["pid"], global["pid"]);
    assert_eq!(from_project["projectPath"], "");

    let error = app
        .plugin_manager()
        .plan(PluginChangeRequest {
            plugin: "bundle:user-only".into(),
            scope: PluginScope::project(project.path()),
            state: Some(PluginOverride::Disabled),
            config: None,
            component: None,
        })
        .unwrap_err();
    assert!(matches!(
        error,
        PluginManagerError::UnsupportedProjectScope(plugin) if plugin == "bundle:user-only"
    ));
}

#[cfg(unix)]
#[tokio::test]
async fn uninstall_stops_all_realms_before_removing_a_bundle_and_forgets_runtime_policy() {
    let data = tempfile::tempdir().unwrap();
    let project = tempfile::tempdir().unwrap();
    install_runtime_bundle(data.path(), "fixture", true);
    let app = boot(data.path()).await;

    change(
        &app,
        "bundle:fixture",
        PluginScope::User,
        PluginOverride::Disabled,
    )
    .await
    .unwrap();
    change(
        &app,
        "bundle:fixture",
        PluginScope::project(project.path()),
        PluginOverride::Enabled,
    )
    .await
    .unwrap();
    assert!(app.call("bundle.where", Value::Null).await.is_err());
    assert!(app
        .call_in_project(project.path(), "bundle.where", Value::Null)
        .await
        .is_ok());

    app.call(
        "plugins.uninstall",
        json!({ "id": "fixture", "keep_data": false }),
    )
    .await
    .unwrap();
    assert!(!data.path().join("plugins").join("fixture").exists());
    assert!(app
        .scopes()
        .into_iter()
        .all(|scope| scope.plugin != "bundle:fixture"));
    assert!(app
        .call_in_project(project.path(), "bundle.where", Value::Null)
        .await
        .is_err());

    install_runtime_bundle(data.path(), "fixture", true);
    app.ctx().emit(PluginsChanged).await;
    app.flush().await;
    assert!(
        app.call("bundle.where", Value::Null).await.is_ok(),
        "the previous explicit user disable must not survive uninstall and reinstall"
    );
}

#[cfg(unix)]
#[tokio::test]
async fn concurrent_bundle_mutations_cannot_restart_a_runtime_during_uninstall() {
    let data = tempfile::tempdir().unwrap();
    let project = tempfile::tempdir().unwrap();
    install_runtime_bundle(data.path(), "fixture", true);
    let app = boot(data.path()).await;
    assert!(app
        .call_in_project(project.path(), "bundle.where", Value::Null)
        .await
        .is_ok());

    let uninstall = app.call(
        "plugins.uninstall",
        json!({ "id": "fixture", "keep_data": false }),
    );
    let retrust = app.call(
        "plugins.set_trusted",
        json!({ "id": "fixture", "value": true }),
    );
    let (uninstall_result, _retrust_result) = tokio::join!(uninstall, retrust);
    uninstall_result.unwrap();

    assert!(!data.path().join("plugins").join("fixture").exists());
    assert!(app
        .scopes()
        .into_iter()
        .all(|scope| scope.plugin != "bundle:fixture"));
    assert!(app.call("bundle.where", Value::Null).await.is_err());
    assert!(app
        .call_in_project(project.path(), "bundle.where", Value::Null)
        .await
        .is_err());
}
