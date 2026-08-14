//! Kernel behaviour tests — the promises the rest of the app is allowed to rely on.

use codetwo_kernel::{
    async_trait, App, Context, Event, FnPlugin, Injection, Plugin, PluginError, PluginResult,
    Service, Status,
};
use serde_json::{json, Value};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

// ---- fixtures ----------------------------------------------------------------------------

#[derive(Debug)]
struct Db(String);
impl Service for Db {
    const NAME: &'static str = "db";
}

struct Cache;
impl Service for Cache {
    const NAME: &'static str = "cache";
}

type Log = Arc<Mutex<Vec<String>>>;

fn log_of(log: &Log) -> Vec<String> {
    log.lock().unwrap().clone()
}

fn push(log: &Log, line: impl Into<String>) {
    log.lock().unwrap().push(line.into());
}

/// Provides `db`, with the DSN taken from config so we can watch reconfiguration.
struct DbPlugin(Log);

#[async_trait]
impl Plugin for DbPlugin {
    fn name(&self) -> &str {
        "db"
    }
    async fn apply(&self, ctx: Context, config: Value) -> PluginResult {
        let dsn = config.get("dsn").and_then(Value::as_str).unwrap_or("default").to_string();
        push(&self.0, format!("db:apply:{dsn}"));
        let log = self.0.clone();
        ctx.effect(move || push(&log, "db:dispose"));
        ctx.provide(Arc::new(Db(dsn)))?;
        Ok(())
    }
}

/// Needs `db`; publishes a command that reads it.
struct ApiPlugin(Log);

#[async_trait]
impl Plugin for ApiPlugin {
    fn name(&self) -> &str {
        "api"
    }
    fn inject(&self) -> Injection {
        Injection::required(["db"])
    }
    async fn apply(&self, ctx: Context, _config: Value) -> PluginResult {
        let db = ctx.expect::<Db>()?;
        push(&self.0, format!("api:apply:{}", db.0));
        let log = self.0.clone();
        ctx.effect(move || push(&log, "api:dispose"));
        ctx.command("api.dsn", move |_| {
            let db = db.clone();
            async move { Ok(Value::from(db.0.clone())) }
        })?;
        Ok(())
    }
}

// ---- injection is reactive, not ordered ---------------------------------------------------

#[tokio::test]
async fn a_plugin_waits_for_its_dependency_regardless_of_load_order() {
    let log: Log = Default::default();
    let app = App::new();

    let api = app.ctx().plugin(ApiPlugin(log.clone()), Value::Null);
    app.flush().await;
    // `db` does not exist yet, so `api` is not a failure — it is simply not running.
    assert_eq!(api.status(), Status::Pending);
    assert!(app.ctx().call("api.dsn", Value::Null).await.is_err());

    app.ctx().plugin(DbPlugin(log.clone()), json!({"dsn": "primary"}));
    app.flush().await;

    assert_eq!(api.status(), Status::Active);
    assert_eq!(app.ctx().call("api.dsn", Value::Null).await.unwrap(), "primary");
    assert_eq!(log_of(&log), ["db:apply:primary", "api:apply:primary"]);
}

#[tokio::test]
async fn losing_a_dependency_unloads_the_dependents() {
    let log: Log = Default::default();
    let app = App::new();
    let db = app.ctx().plugin(DbPlugin(log.clone()), json!({"dsn": "primary"}));
    let api = app.ctx().plugin(ApiPlugin(log.clone()), Value::Null);
    app.flush().await;
    assert_eq!(api.status(), Status::Active);

    db.dispose();
    app.flush().await;

    assert_eq!(api.status(), Status::Pending, "api survives, but stops running");
    assert!(
        app.ctx().call("api.dsn", Value::Null).await.is_err(),
        "its command went with it — no dangling surface"
    );
    assert_eq!(
        log_of(&log),
        ["db:apply:primary", "api:apply:primary", "api:dispose", "db:dispose"],
        "dependents unload before what they depended on"
    );
}

#[tokio::test]
async fn reconfiguring_a_service_reloads_everything_built_on_it() {
    let log: Log = Default::default();
    let app = App::new();
    let db = app.ctx().plugin(DbPlugin(log.clone()), json!({"dsn": "primary"}));
    let api = app.ctx().plugin(ApiPlugin(log.clone()), Value::Null);
    app.flush().await;

    db.update(json!({"dsn": "replica"}));
    app.flush().await;

    assert_eq!(api.status(), Status::Active);
    assert_eq!(
        app.ctx().call("api.dsn", Value::Null).await.unwrap(),
        "replica",
        "the dependent re-read the service instead of holding a stale handle"
    );
    assert_eq!(
        log_of(&log),
        [
            "db:apply:primary",
            "api:apply:primary",
            "api:dispose",
            "db:dispose",
            "db:apply:replica",
            "api:apply:replica",
        ]
    );
}

#[tokio::test]
async fn an_unchanged_config_does_not_reload() {
    let log: Log = Default::default();
    let app = App::new();
    let db = app.ctx().plugin(DbPlugin(log.clone()), json!({"dsn": "primary"}));
    app.flush().await;
    db.update(json!({"dsn": "primary"}));
    app.flush().await;
    assert_eq!(log_of(&log), ["db:apply:primary"]);
}

// ---- unloading is exact -------------------------------------------------------------------

#[tokio::test]
async fn unloading_undoes_services_commands_listeners_and_effects() {
    struct Ping;
    impl Event for Ping {
        type Output = &'static str;
        const NAME: &'static str = "ping";
    }

    let log: Log = Default::default();
    let app = App::new();
    let inner = log.clone();
    let fork = app.ctx().plugin(
        FnPlugin::new("everything", move |ctx: Context, _| {
            let log = inner.clone();
            async move {
                ctx.provide(Arc::new(Cache))?;
                ctx.command("cache.clear", |_| async move { Ok(Value::Bool(true)) })?;
                ctx.on::<Ping, _>(|_| Some("pong"));
                ctx.on_json("cache/probe", |_| async move { Some(json!("here")) });
                ctx.effect(move || push(&log, "cleanup"));
                Ok(())
            }
        }),
        Value::Null,
    );
    app.flush().await;

    assert!(app.ctx().has("cache"));
    assert_eq!(app.ctx().bail(Ping).await, Some("pong"));
    assert_eq!(app.ctx().bail_json("cache/probe", Value::Null).await, Some(json!("here")));
    assert!(app.ctx().call("cache.clear", Value::Null).await.is_ok());

    fork.dispose();
    app.flush().await;

    assert!(!app.ctx().has("cache"), "service gone");
    assert_eq!(app.ctx().bail(Ping).await, None, "typed listener gone");
    assert_eq!(app.ctx().bail_json("cache/probe", Value::Null).await, None, "json listener gone");
    assert!(app.ctx().call("cache.clear", Value::Null).await.is_err(), "command gone");
    assert_eq!(log_of(&log), ["cleanup"], "effect ran");
    assert!(app.runtime().services().is_empty());
    assert!(app.runtime().commands().is_empty());
}

#[tokio::test]
async fn disposing_a_parent_disposes_the_children_it_loaded() {
    let log: Log = Default::default();
    let inner = log.clone();
    let app = App::new();

    let parent = app.ctx().plugin(
        FnPlugin::new("parent", move |ctx: Context, _| {
            let log = inner.clone();
            async move {
                let child_log = log.clone();
                ctx.plugin(
                    FnPlugin::new("child", move |ctx: Context, _| {
                        let log = child_log.clone();
                        async move {
                            push(&log, "child:apply");
                            ctx.effect(move || push(&log, "child:dispose"));
                            Ok(())
                        }
                    }),
                    Value::Null,
                );
                ctx.effect(move || push(&log, "parent:dispose"));
                Ok(())
            }
        }),
        Value::Null,
    );
    app.flush().await;
    assert_eq!(app.runtime().scopes().len(), 3, "root + parent + child");

    parent.dispose();
    app.flush().await;

    assert_eq!(log_of(&log), ["child:apply", "child:dispose", "parent:dispose"]);
    assert_eq!(app.runtime().scopes().len(), 1, "only the root is left");
}

// ---- failure is contained ------------------------------------------------------------------

#[tokio::test]
async fn a_failing_plugin_is_rolled_back_and_the_graph_survives() {
    let app = App::new();
    let broken = app.ctx().plugin(
        FnPlugin::new("broken", |ctx: Context, _| async move {
            ctx.command("broken.half", |_| async move { Ok(Value::Null) })?;
            Err(PluginError::new("no database around here"))
        }),
        Value::Null,
    );
    let ok = app.ctx().plugin(
        FnPlugin::new("fine", |ctx: Context, _| async move {
            ctx.command("fine.ok", |_| async move { Ok(Value::Bool(true)) })?;
            Ok(())
        }),
        Value::Null,
    );
    app.flush().await;

    assert_eq!(broken.status(), Status::Failed);
    let info = app.runtime().scopes().into_iter().find(|s| s.plugin == "broken").unwrap();
    assert_eq!(info.error.as_deref(), Some("no database around here"));
    assert!(
        app.ctx().call("broken.half", Value::Null).await.is_err(),
        "a half-applied plugin leaves nothing behind"
    );
    assert_eq!(ok.status(), Status::Active);
    assert!(app.ctx().call("fine.ok", Value::Null).await.is_ok());
}

#[tokio::test]
async fn two_plugins_cannot_provide_the_same_service() {
    let app = App::new();
    app.ctx().plugin(DbPlugin(Default::default()), Value::Null);
    let second = app.ctx().plugin(DbPlugin(Default::default()), Value::Null);
    app.flush().await;
    assert_eq!(second.status(), Status::Failed);
    let info = app.runtime().scopes().into_iter().find(|s| s.id == second.id()).unwrap();
    assert!(info.error.unwrap().contains("already provided"));
}

#[tokio::test]
async fn command_names_are_owned() {
    let app = App::new();
    let make = |tag: &'static str| {
        FnPlugin::new(tag, |ctx: Context, _| async move {
            ctx.command("dup", |_| async move { Ok(Value::Null) })?;
            Ok(())
        })
    };
    app.ctx().plugin(make("first"), Value::Null);
    let second = app.ctx().plugin(make("second"), Value::Null);
    app.flush().await;
    assert_eq!(second.status(), Status::Failed);
}

// ---- isolation ------------------------------------------------------------------------------

#[tokio::test]
async fn isolated_contexts_get_their_own_instance_of_a_service() {
    let app = App::new();
    app.ctx().plugin(DbPlugin(Default::default()), json!({"dsn": "shared"}));

    let sandbox = app.ctx().isolate(&["db"]);
    sandbox.plugin(DbPlugin(Default::default()), json!({"dsn": "sandboxed"}));

    // `api` inside the sandbox resolves the sandboxed db; outside, the shared one.
    let seen: Arc<Mutex<Vec<String>>> = Default::default();
    let record = |seen: Arc<Mutex<Vec<String>>>| {
        FnPlugin::new("reader", move |ctx: Context, _| {
            let seen = seen.clone();
            async move {
                seen.lock().unwrap().push(ctx.expect::<Db>()?.0.clone());
                Ok(())
            }
        })
        .with_inject(Injection::required(["db"]))
    };
    sandbox.plugin(record(seen.clone()), Value::Null);
    app.flush().await;
    app.ctx().plugin(record(seen.clone()), Value::Null);
    app.flush().await;

    assert_eq!(*seen.lock().unwrap(), ["sandboxed", "shared"]);
    assert_eq!(app.runtime().services().len(), 2, "same name, two realms");
}

// ---- events ----------------------------------------------------------------------------------

#[tokio::test]
async fn bail_stops_at_the_first_answer_and_collect_keeps_them_all() {
    struct Ask(u32);
    impl Event for Ask {
        type Output = String;
        const NAME: &'static str = "ask";
    }

    let calls = Arc::new(AtomicUsize::new(0));
    let app = App::new();
    let counter = calls.clone();
    app.ctx().plugin(
        FnPlugin::new("answers", move |ctx: Context, _| {
            let counter = counter.clone();
            async move {
                let a = counter.clone();
                ctx.on::<Ask, _>(move |event| {
                    a.fetch_add(1, Ordering::SeqCst);
                    (event.0 > 10).then(|| "big".to_string())
                });
                ctx.on_async::<Ask, _, _>(move |event| {
                    let value = event.0;
                    async move { Some(format!("seen {value}")) }
                });
                Ok(())
            }
        }),
        Value::Null,
    );
    app.flush().await;

    assert_eq!(app.ctx().bail(Ask(42)).await, Some("big".to_string()));
    assert_eq!(app.ctx().bail(Ask(1)).await, Some("seen 1".to_string()));
    assert_eq!(app.ctx().collect(Ask(42)).await, ["big", "seen 42"]);
    assert_eq!(calls.load(Ordering::SeqCst), 3, "the first listener ran once per dispatch");
}

#[tokio::test]
async fn lifecycle_events_describe_the_graph_to_whoever_is_watching() {
    use codetwo_kernel::events::{ServiceChanged, StatusChanged};

    let seen: Log = Default::default();
    let app = App::new();
    let inner = seen.clone();
    app.ctx().plugin(
        FnPlugin::new("watcher", move |ctx: Context, _| {
            let seen = inner.clone();
            async move {
                let a = seen.clone();
                ctx.on::<StatusChanged, _>(move |event| {
                    if event.plugin == "db" {
                        push(&a, format!("status:{:?}", event.status));
                    }
                    None
                });
                let b = seen.clone();
                ctx.on::<ServiceChanged, _>(move |event| {
                    push(&b, format!("service:{}:{}", event.name, event.active));
                    None
                });
                Ok(())
            }
        }),
        Value::Null,
    );
    app.flush().await;

    let db = app.ctx().plugin(DbPlugin(Default::default()), Value::Null);
    app.flush().await;
    db.dispose();
    app.flush().await;

    assert_eq!(
        log_of(&seen),
        [
            "status:Loading",
            "service:db:true",
            "status:Active",
            "service:db:false",
            "status:Disposed",
        ]
    );
}

// ---- ctx.inject ------------------------------------------------------------------------------

#[tokio::test]
async fn inject_runs_a_closure_only_while_its_services_exist() {
    let log: Log = Default::default();
    let app = App::new();
    let inner = log.clone();
    app.ctx().inject(&["db"], move |ctx| {
        let log = inner.clone();
        async move {
            push(&log, format!("ran with {}", ctx.expect::<Db>()?.0));
            Ok(())
        }
    });
    app.flush().await;
    assert!(log_of(&log).is_empty());

    let db = app.ctx().plugin(DbPlugin(Default::default()), json!({"dsn": "here"}));
    app.flush().await;
    db.dispose();
    app.flush().await;

    assert_eq!(log_of(&log), ["ran with here"]);
}

// ---- the loader ------------------------------------------------------------------------------

#[tokio::test]
async fn the_loader_keeps_the_graph_equal_to_the_config() {
    use codetwo_kernel::{Loader, LoaderConfig, PluginEntry, PluginRegistry};

    let log: Log = Default::default();
    let app = App::new();
    let mut registry = PluginRegistry::new();
    let db_log = log.clone();
    registry.register(move || DbPlugin(db_log.clone()));
    let api_log = log.clone();
    registry.register(move || ApiPlugin(api_log.clone()));

    let mut loader = Loader::new(app.ctx(), registry);

    // Only `api` is configured: it stays pending, and the app runs anyway.
    let errors = loader.apply(LoaderConfig::default().enable(["api"]));
    assert!(errors.is_empty());
    app.flush().await;
    assert!(app.ctx().call("api.dsn", Value::Null).await.is_err());

    // Turning `db` on is a config edit, not a restart.
    loader.apply(
        LoaderConfig::default()
            .enable(["api"])
            .with("db", PluginEntry::with_config(json!({"dsn": "from-config"}))),
    );
    app.flush().await;
    assert_eq!(app.ctx().call("api.dsn", Value::Null).await.unwrap(), "from-config");

    // …and so is turning it off again.
    loader.set_enabled("db", false);
    app.flush().await;
    assert!(app.ctx().call("api.dsn", Value::Null).await.is_err());

    loader.set_enabled("db", true);
    loader.reconfigure("db", json!({"dsn": "edited"}));
    app.flush().await;
    assert_eq!(app.ctx().call("api.dsn", Value::Null).await.unwrap(), "edited");

    let entries = loader.entries();
    let db_entry = entries.iter().find(|entry| entry.name == "db").unwrap();
    assert!(db_entry.enabled && db_entry.running);
    assert_eq!(db_entry.status, Some(Status::Active));
}

#[tokio::test]
async fn an_unknown_plugin_name_is_reported_without_taking_the_app_down() {
    use codetwo_kernel::{Loader, LoaderConfig, PluginRegistry};

    let app = App::new();
    let mut registry = PluginRegistry::new();
    registry.register(|| DbPlugin(Default::default()));
    let mut loader = Loader::new(app.ctx(), registry);

    let errors = loader.apply(LoaderConfig::default().enable(["db", "typo"]));
    app.flush().await;

    assert_eq!(errors.len(), 1);
    assert!(errors[0].to_string().contains("typo"));
    assert!(app.ctx().has("db"), "the rest of the config still applied");
}

// ---- introspection ---------------------------------------------------------------------------

#[tokio::test]
async fn the_graph_can_explain_itself() {
    let app = App::new();
    app.ctx().plugin(ApiPlugin(Default::default()), Value::Null);
    app.flush().await;

    let api = app.runtime().scopes().into_iter().find(|s| s.plugin == "api").unwrap();
    assert_eq!(api.status, Status::Pending);
    assert_eq!(api.missing, ["db"], "a pending plugin says exactly what it is waiting for");

    app.ctx().plugin(DbPlugin(Default::default()), Value::Null);
    app.flush().await;

    let services = app.runtime().services();
    assert_eq!(services[0].name, "db");
    assert_eq!(services[0].plugin, "db");
    let commands = app.runtime().commands();
    assert_eq!(commands[0].name, "api.dsn");
    assert_eq!(commands[0].plugin, "api");
}

#[tokio::test]
async fn stopping_the_app_unloads_everything() {
    let log: Log = Default::default();
    let app = App::new();
    app.ctx().plugin(DbPlugin(log.clone()), Value::Null);
    app.ctx().plugin(ApiPlugin(log.clone()), Value::Null);
    app.flush().await;

    app.stop().await;

    assert_eq!(app.runtime().scopes().len(), 1);
    assert!(app.runtime().services().is_empty());
    assert!(app.runtime().commands().is_empty());
    assert!(log_of(&log).contains(&"db:dispose".to_string()));
}
