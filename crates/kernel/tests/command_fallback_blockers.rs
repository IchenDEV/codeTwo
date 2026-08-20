use codetwo_kernel::{App, CommandRealm, Context, FnPlugin, KernelError};
use serde_json::{json, Value};

fn global_command(ctx: &Context) -> codetwo_kernel::Fork {
    ctx.plugin(
        FnPlugin::new("global-command", |ctx: Context, _| async move {
            ctx.command("demo.value", |_| async { Ok(json!("global")) })?;
            Ok(())
        }),
        Value::Null,
    )
}

fn fallback_blocker(ctx: &Context, enabled: bool) -> codetwo_kernel::Fork {
    ctx.plugin(
        FnPlugin::new("fallback-blocker", |ctx: Context, config| async move {
            if config.as_bool().unwrap_or(false) {
                ctx.block_command_fallback("demo.value")?;
            }
            Ok(())
        }),
        Value::Bool(enabled),
    )
}

#[tokio::test]
async fn project_blocker_prevents_global_fallback_but_not_a_local_handler() {
    let app = App::new();
    let _global = global_command(&app.ctx());
    let project = app
        .ctx()
        .with_command_realm(CommandRealm::project("/projects/alpha"));
    let blocker = fallback_blocker(&project, true);
    app.flush().await;

    assert!(matches!(
        project.call("demo.value", Value::Null).await,
        Err(KernelError::CommandFallbackBlocked { name, .. }) if name == "demo.value"
    ));

    let local = project.plugin(
        FnPlugin::new("local-command", |ctx: Context, _| async move {
            ctx.command("demo.value", |_| async { Ok(json!("local")) })?;
            Ok(())
        }),
        Value::Null,
    );
    app.flush().await;
    assert_eq!(
        project.call("demo.value", Value::Null).await.unwrap(),
        json!("local")
    );

    local.dispose();
    app.flush().await;
    assert!(matches!(
        project.call("demo.value", Value::Null).await,
        Err(KernelError::CommandFallbackBlocked { .. })
    ));

    blocker.dispose();
    app.flush().await;
    assert_eq!(
        project.call("demo.value", Value::Null).await.unwrap(),
        json!("global")
    );
}

#[tokio::test]
async fn blocker_is_removed_and_recreated_with_its_scope_reload() {
    let app = App::new();
    let _global = global_command(&app.ctx());
    let project = app
        .ctx()
        .with_command_realm(CommandRealm::project("/projects/alpha"));
    let blocker = fallback_blocker(&project, true);
    app.flush().await;
    assert!(matches!(
        project.call("demo.value", Value::Null).await,
        Err(KernelError::CommandFallbackBlocked { .. })
    ));

    blocker.update(Value::Bool(false));
    app.flush().await;
    assert_eq!(
        project.call("demo.value", Value::Null).await.unwrap(),
        json!("global")
    );

    blocker.update(Value::Bool(true));
    app.flush().await;
    assert!(matches!(
        project.call("demo.value", Value::Null).await,
        Err(KernelError::CommandFallbackBlocked { .. })
    ));
}
