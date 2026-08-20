//! Command-realm behaviour tests. These exercise only the public kernel surface used by hosts.

use codetwo_kernel::{App, CommandRealm, Context, FnPlugin, Plugin};
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
