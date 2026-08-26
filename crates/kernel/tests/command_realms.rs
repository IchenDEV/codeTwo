//! Command-realm behaviour tests. These exercise only the public kernel surface used by hosts.

use codetwo_kernel::{
    App, CommandRealm, CommandVisibility, Context, FnPlugin, KernelError, Plugin,
};
use serde_json::{json, Value};

fn responding_plugin(
    plugin_name: &'static str,
    command_name: &'static str,
    response: &'static str,
) -> impl Plugin {
    FnPlugin::new(plugin_name, move |ctx: Context, _| async move {
        ctx.command(command_name, move |_| async move { Ok(json!(response)) })?;
        Ok(())
    })
}

#[tokio::test]
async fn a_project_command_can_shadow_a_global_command_with_the_same_name() {
    let app = App::new();
    let global = app.ctx();
    let project = global.with_command_realm(CommandRealm::project("/projects/alpha"));

    global.plugin(
        responding_plugin("global-workspace", "workspace.describe", "global"),
        Value::Null,
    );
    project.plugin(
        responding_plugin("alpha-workspace", "workspace.describe", "alpha"),
        Value::Null,
    );
    app.flush().await;

    assert_eq!(
        global
            .call("workspace.describe", Value::Null)
            .await
            .unwrap(),
        "global"
    );
    assert_eq!(
        project
            .call("workspace.describe", Value::Null)
            .await
            .unwrap(),
        "alpha"
    );
}

#[tokio::test]
async fn a_project_context_falls_back_to_global_commands() {
    let app = App::new();
    let global = app.ctx();
    let project = global.with_command_realm(CommandRealm::project("/projects/alpha"));

    global.plugin(
        responding_plugin("global-health", "system.health", "healthy"),
        Value::Null,
    );
    app.flush().await;

    assert_eq!(
        project.call("system.health", Value::Null).await.unwrap(),
        "healthy"
    );
}

#[tokio::test]
async fn a_fallback_handler_can_authorize_against_the_callers_realm() {
    let app = App::new();
    let global = app.ctx();
    let project_realm = CommandRealm::project("/projects/alpha");
    let project = global.with_command_realm(project_realm.clone());

    global.plugin(
        FnPlugin::new("realm-router", |ctx: Context, _| async move {
            ctx.command_with_realm("system.realm", |realm, _| async move {
                Ok(serde_json::to_value(realm).unwrap())
            })?;
            Ok(())
        }),
        Value::Null,
    );
    app.flush().await;

    assert_eq!(
        global.call("system.realm", Value::Null).await.unwrap(),
        "global"
    );
    assert_eq!(
        project.call("system.realm", Value::Null).await.unwrap(),
        json!({ "project": "/projects/alpha" })
    );
}

#[tokio::test]
async fn unloading_a_scope_removes_only_its_command_realm_contribution() {
    let app = App::new();
    let global = app.ctx();
    let alpha = global.with_command_realm(CommandRealm::project("/projects/alpha"));
    let beta = global.with_command_realm(CommandRealm::project("/projects/beta"));

    let global_command = global.plugin(
        responding_plugin("global-workspace", "workspace.describe", "global"),
        Value::Null,
    );
    let alpha_command = alpha.plugin(
        responding_plugin("alpha-workspace", "workspace.describe", "alpha"),
        Value::Null,
    );
    beta.plugin(
        responding_plugin("beta-workspace", "workspace.describe", "beta"),
        Value::Null,
    );
    app.flush().await;

    alpha_command.dispose();
    app.flush().await;

    assert_eq!(
        alpha.call("workspace.describe", Value::Null).await.unwrap(),
        "global"
    );
    assert_eq!(
        beta.call("workspace.describe", Value::Null).await.unwrap(),
        "beta"
    );
    assert_eq!(
        global
            .call("workspace.describe", Value::Null)
            .await
            .unwrap(),
        "global"
    );

    global_command.dispose();
    app.flush().await;

    assert!(global
        .call("workspace.describe", Value::Null)
        .await
        .is_err());
    assert!(alpha.call("workspace.describe", Value::Null).await.is_err());
    assert_eq!(
        beta.call("workspace.describe", Value::Null).await.unwrap(),
        "beta"
    );
}

#[tokio::test]
async fn command_and_scope_introspection_include_their_realms() {
    let app = App::new();
    let project_realm = CommandRealm::project("/projects/alpha");
    let project = app.ctx().with_command_realm(project_realm.clone());

    project.plugin(
        responding_plugin("alpha-workspace", "workspace.describe", "alpha"),
        Value::Null,
    );
    app.flush().await;

    let command = app.runtime().commands().into_iter().next().unwrap();
    assert_eq!(command.realm, project_realm);
    let scope = app
        .runtime()
        .scopes()
        .into_iter()
        .find(|scope| scope.plugin == "alpha-workspace")
        .unwrap();
    assert_eq!(scope.command_realm, project_realm);
}

#[tokio::test]
async fn extension_process_calls_are_default_deny_and_explicitly_published() {
    let app = App::new();
    app.ctx().plugin(
        FnPlugin::new("commands", |ctx: Context, _| async move {
            ctx.command("commands.internal", |_| async { Ok(json!("internal")) })?;
            ctx.command_extension_public("commands.public", |_| async { Ok(json!("public")) })?;
            Ok(())
        }),
        Value::Null,
    );
    app.flush().await;

    assert_eq!(
        app.ctx()
            .call("commands.internal", Value::Null)
            .await
            .unwrap(),
        "internal",
        "trusted host calls keep their existing command surface"
    );
    assert!(matches!(
        app.ctx()
            .call_extension_public("commands.internal", Value::Null)
            .await,
        Err(KernelError::CommandNotExtensionPublic(name)) if name == "commands.internal"
    ));
    assert_eq!(
        app.ctx()
            .call_extension_public("commands.public", Value::Null)
            .await
            .unwrap(),
        "public"
    );

    let commands = app.runtime().commands();
    assert_eq!(
        commands
            .iter()
            .find(|command| command.name == "commands.internal")
            .unwrap()
            .visibility,
        CommandVisibility::Internal
    );
    assert_eq!(
        commands
            .iter()
            .find(|command| command.name == "commands.public")
            .unwrap()
            .visibility,
        CommandVisibility::ExtensionPublic
    );
    assert_eq!(
        app.ctx()
            .extension_public_commands()
            .into_iter()
            .map(|command| command.name)
            .collect::<Vec<_>>(),
        ["commands.public"]
    );
}

#[tokio::test]
async fn an_internal_project_command_does_not_reexpose_a_public_global_fallback() {
    let app = App::new();
    let global = app.ctx();
    let project = global.with_command_realm(CommandRealm::project("/projects/alpha"));

    global.plugin(
        FnPlugin::new("global", |ctx: Context, _| async move {
            ctx.command_extension_public("workspace.describe", |_| async { Ok(json!("global")) })?;
            Ok(())
        }),
        Value::Null,
    );
    project.plugin(
        FnPlugin::new("project", |ctx: Context, _| async move {
            ctx.command("workspace.describe", |_| async { Ok(json!("project")) })?;
            Ok(())
        }),
        Value::Null,
    );
    app.flush().await;

    assert_eq!(
        project
            .call("workspace.describe", Value::Null)
            .await
            .unwrap(),
        "project"
    );
    assert!(matches!(
        project
            .call_extension_public("workspace.describe", Value::Null)
            .await,
        Err(KernelError::CommandNotExtensionPublic(name)) if name == "workspace.describe"
    ));
    assert!(!project
        .extension_public_commands()
        .iter()
        .any(|command| command.name == "workspace.describe"));
    assert_eq!(
        global
            .call_extension_public("workspace.describe", Value::Null)
            .await
            .unwrap(),
        "global"
    );
}
