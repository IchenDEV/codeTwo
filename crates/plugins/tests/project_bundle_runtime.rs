use codetwo_kernel::{
    CommandRealm, KernelError, PluginEntry, PluginOrigin, PluginScopeSupport, Status,
};
use codetwo_plugins::events::PluginsChanged;
use codetwo_plugins::testing::CoreAppTestExt;
use codetwo_plugins::{
    AppConfig, CoreApp, PluginChangeRequest, PluginManagerError, PluginOverride, PluginScope,
};
use serde_json::{json, Value};
use std::path::Path;

#[cfg(unix)]
fn install_runtime_bundle(data_dir: &Path, id: &str, project_capable: bool) {
    install_runtime_bundle_with_command(data_dir, id, project_capable, "bundle.where");
}

#[cfg(unix)]
fn install_runtime_bundle_with_command(
    data_dir: &Path,
    id: &str,
    project_capable: bool,
    command: &str,
) {
    use std::os::unix::fs::PermissionsExt;

    let plugin_dir = data_dir.join("plugins").join(id);
    let bundle_dir = plugin_dir.join("bundle");
    std::fs::create_dir_all(&bundle_dir).unwrap();
    let server = bundle_dir.join("server.sh");
    let script = r#"#!/bin/sh
printf '%s\n' "$$" >> "$C2_TEST_START_LOG"
IFS= read -r initialize || exit 1
initialize_id=$(printf '%s' "$initialize" | sed -n 's/.*"id":\([0-9][0-9]*\).*/\1/p')
data_dir=$(printf '%s' "$initialize" | sed -n 's/.*"dataDir":"\([^"]*\)".*/\1/p')
project_path=$(printf '%s' "$initialize" | sed -n 's/.*"projectPath":"\([^"]*\)".*/\1/p')
printf '{"jsonrpc":"2.0","id":%s,"result":{"name":"fixture","version":"1.0.0","protocolVersion":"1.0.0","commands":[{"name":"__COMMAND__"}],"events":[]}}\n' "$initialize_id"
while IFS= read -r request; do
  request_id=$(printf '%s' "$request" | sed -n 's/.*"id":\([0-9][0-9]*\).*/\1/p')
  printf '{"jsonrpc":"2.0","id":%s,"result":{"pid":%s,"dataDir":"%s","projectPath":"%s"}}\n' "$request_id" "$$" "$data_dir" "$project_path"
done
"#
    .replace("__COMMAND__", command);
    std::fs::write(&server, script).unwrap();
    std::fs::set_permissions(&server, std::fs::Permissions::from_mode(0o755)).unwrap();

    let mut runtime = json!({
        "protocol": "1.0.0",
        "command": server,
        "env": { "C2_TEST_START_LOG": data_dir.join(format!("{id}-runtime-starts.log")) },
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
        "standard_version": "1.2.0",
        "enabled": true,
        "trusted": true,
        "scope": "user",
        "counts": {
            "skills": 0,
            "subagents": 0,
            "mcp_servers": 0,
            "commands": 0,
            "hooks": 0,
            "lsp_servers": 0,
            "monitors": 0,
            "apps": 0,
            "scenes": 0,
            "pipelines": 0,
            "scaffolds": 0,
            "ui": 1,
            "connectors": 1,
            "runtime_commands": 1,
            "runtime": 1
        },
        "components": [],
        "scaffolds": [],
        "extension_components": [],
        "runtime_commands": [{
            "id": command,
            "title": "Locate runtime",
            "description": "Report the active runtime realm."
        }],
        "ui_contributions": [{
            "id": "where",
            "slot": "session.header",
            "label": "Locate runtime",
            "description": "Report the active runtime realm.",
            "command": command,
            "input": { "mode": "fixture" },
            "order": 0
        }],
        "connector_contributions": [{
            "id": "workspace",
            "provider": "test-chat",
            "command": command,
            "capabilities": ["conversations"]
        }],
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

#[cfg(unix)]
fn runtime_start_count(data_dir: &Path, id: &str) -> usize {
    std::fs::read_to_string(data_dir.join(format!("{id}-runtime-starts.log")))
        .map(|contents| contents.lines().count())
        .unwrap_or(0)
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
    let extensions = app.call("extensions.list", Value::Null).await.unwrap();
    assert_eq!(extensions["ready"], json!(["fixture"]));
    assert_eq!(
        runtime_start_count(data.path(), "fixture"),
        0,
        "a ready adapter must leave the process dormant"
    );

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
    assert_eq!(runtime_start_count(data.path(), "fixture"), 3);

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
async fn manifest_surfaces_invoke_only_the_owning_runtime_in_the_callers_realm() {
    let data = tempfile::tempdir().unwrap();
    let project = tempfile::tempdir().unwrap();
    install_runtime_bundle(data.path(), "fixture", true);
    let app = boot(data.path()).await;

    let listed = app.call("plugins.list", Value::Null).await.unwrap();
    assert_eq!(listed[0]["ui_contributions"][0]["id"], "where");
    assert_eq!(listed[0]["connector_contributions"][0]["id"], "workspace");

    let global = app
        .call(
            "plugins.invoke_ui",
            json!({
                "plugin_id": "fixture",
                "contribution_id": "where",
                "context": { "cwd": project.path() }
            }),
        )
        .await
        .unwrap();
    let local = app
        .call_in_project(
            project.path(),
            "plugins.invoke_ui",
            json!({
                "plugin_id": "fixture",
                "contribution_id": "where",
                "context": { "cwd": project.path() }
            }),
        )
        .await
        .unwrap();
    assert_eq!(global["projectPath"], "");
    assert_ne!(global["pid"], local["pid"]);
    assert_eq!(
        local["projectPath"],
        project
            .path()
            .canonicalize()
            .unwrap()
            .to_string_lossy()
            .as_ref()
    );

    let connector = app
        .call_in_project(
            project.path(),
            "plugins.invoke_connector",
            json!({
                "plugin_id": "fixture",
                "contribution_id": "workspace",
                "operation": "conversation.messages",
                "input": { "chatId": "chat-1" }
            }),
        )
        .await
        .unwrap();
    assert_eq!(connector["projectPath"], local["projectPath"]);

    let capability_error = app
        .call(
            "plugins.invoke_connector",
            json!({
                "plugin_id": "fixture",
                "contribution_id": "workspace",
                "operation": "document.read",
                "input": { "documentId": "doc-1" }
            }),
        )
        .await
        .unwrap_err();
    assert!(capability_error
        .to_string()
        .contains("does not declare the capability"));

    change(
        &app,
        "bundle:fixture",
        PluginScope::project(project.path()),
        PluginOverride::Disabled,
    )
    .await
    .unwrap();
    let error = app
        .call_in_project(
            project.path(),
            "plugins.invoke_ui",
            json!({
                "plugin_id": "fixture",
                "contribution_id": "where",
                "context": {}
            }),
        )
        .await
        .unwrap_err();
    assert!(error.to_string().contains("active command owned"));
}

#[cfg(unix)]
#[tokio::test]
async fn installed_bundle_events_reconcile_factories_without_a_restart() {
    let data = tempfile::tempdir().unwrap();
    install_runtime_bundle_with_command(data.path(), "existing", true, "existing.where");
    let app = boot(data.path()).await;
    let stale_plan = app
        .plugin_manager()
        .plan(PluginChangeRequest {
            plugin: "bundle:existing".into(),
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
async fn forced_bundle_reload_restarts_only_the_requested_bundle_in_every_realm() {
    let data = tempfile::tempdir().unwrap();
    let project = tempfile::tempdir().unwrap();
    install_runtime_bundle_with_command(data.path(), "alpha", true, "bundle.alpha");
    install_runtime_bundle_with_command(data.path(), "beta", true, "bundle.beta");
    let app = boot(data.path()).await;

    let alpha_global_before = app.call("bundle.alpha", Value::Null).await.unwrap()["pid"].clone();
    let alpha_project_before = app
        .call_in_project(project.path(), "bundle.alpha", Value::Null)
        .await
        .unwrap()["pid"]
        .clone();
    let beta_global_before = app.call("bundle.beta", Value::Null).await.unwrap()["pid"].clone();
    let beta_project_before = app
        .call_in_project(project.path(), "bundle.beta", Value::Null)
        .await
        .unwrap()["pid"]
        .clone();

    let alpha_server = data.path().join("plugins/alpha/bundle/server.sh");
    let mut script = std::fs::read_to_string(&alpha_server).unwrap();
    script.push_str("\n# changed runtime content\n");
    std::fs::write(alpha_server, script).unwrap();

    app.plugin_manager()
        .reload_installed_bundles(&data.path().join("plugins"), ["alpha"])
        .unwrap();
    app.flush().await;

    let alpha_global_after = app.call("bundle.alpha", Value::Null).await.unwrap()["pid"].clone();
    let alpha_project_after = app
        .call_in_project(project.path(), "bundle.alpha", Value::Null)
        .await
        .unwrap()["pid"]
        .clone();
    let beta_global_after = app.call("bundle.beta", Value::Null).await.unwrap()["pid"].clone();
    let beta_project_after = app
        .call_in_project(project.path(), "bundle.beta", Value::Null)
        .await
        .unwrap()["pid"]
        .clone();

    assert_ne!(alpha_global_before, alpha_global_after);
    assert_ne!(alpha_project_before, alpha_project_after);
    assert_eq!(beta_global_before, beta_global_after);
    assert_eq!(beta_project_before, beta_project_after);
}

#[cfg(unix)]
#[tokio::test]
async fn developer_mode_watches_installed_bundle_files_and_persists() {
    let data = tempfile::tempdir().unwrap();
    install_runtime_bundle_with_command(data.path(), "alpha", true, "bundle.alpha");
    let app = boot(data.path()).await;
    let plugins_dir = data.path().join("plugins");
    let server = plugins_dir.join("alpha/bundle/server.sh");

    let initial_status = app
        .call("plugins.developer_status", Value::Null)
        .await
        .unwrap();
    assert_eq!(initial_status["enabled"], false);
    assert_eq!(initial_status["watching"], false);

    let before_disabled_edit = app.call("bundle.alpha", Value::Null).await.unwrap()["pid"].clone();
    let mut script = std::fs::read_to_string(&server).unwrap();
    script.push_str("\n# ignored while disabled\n");
    std::fs::write(&server, &script).unwrap();
    tokio::time::sleep(std::time::Duration::from_millis(500)).await;
    assert_eq!(
        app.call("bundle.alpha", Value::Null).await.unwrap()["pid"],
        before_disabled_edit
    );

    let enabled = app
        .call("plugins.set_developer_mode", json!({ "enabled": true }))
        .await
        .unwrap();
    assert_eq!(enabled["enabled"], true);
    assert_eq!(enabled["watching"], true);
    assert!(plugins_dir.join(".developer-mode").is_file());

    let before_watched_edit = app.call("bundle.alpha", Value::Null).await.unwrap()["pid"].clone();
    script.push_str("\n# watched runtime content\n");
    std::fs::write(&server, script).unwrap();

    let mut after_watched_edit = before_watched_edit.clone();
    for _ in 0..40 {
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        if let Ok(response) = app.call("bundle.alpha", Value::Null).await {
            after_watched_edit = response["pid"].clone();
            if after_watched_edit != before_watched_edit {
                break;
            }
        }
    }
    assert_ne!(after_watched_edit, before_watched_edit);
    let reloaded = app
        .call("plugins.developer_status", Value::Null)
        .await
        .unwrap();
    assert_eq!(reloaded["last_reload"]["success"], true);
    assert_eq!(reloaded["last_reload"]["plugins"], json!(["alpha"]));

    app.stop().await;
    let restarted = boot(data.path()).await;
    let persisted = restarted
        .call("plugins.developer_status", Value::Null)
        .await
        .unwrap();
    assert_eq!(persisted["enabled"], true);
    assert_eq!(persisted["watching"], true);

    let disabled = restarted
        .call("plugins.set_developer_mode", json!({ "enabled": false }))
        .await
        .unwrap();
    assert_eq!(disabled["watching"], false);
    assert!(!plugins_dir.join(".developer-mode").exists());

    let before_manual = restarted.call("bundle.alpha", Value::Null).await.unwrap()["pid"].clone();
    restarted
        .call("plugins.reload_development", Value::Null)
        .await
        .unwrap();
    let after_manual = restarted.call("bundle.alpha", Value::Null).await.unwrap()["pid"].clone();
    assert_ne!(after_manual, before_manual);
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
