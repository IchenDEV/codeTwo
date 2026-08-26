//! The plugin protocol, end to end, against a mock plugin over an in-memory duplex.
//!
//! No plugin binary is installed and no process is spawned: [`Transport`] exists precisely so the
//! handshake, the command forwarding, the callbacks and the teardown are all exercised offline —
//! the same trick `acp_prompt_turn.rs` uses to test a prompt turn without a provider CLI.

use codetwo_core::app::protocol::{Channel, ProtocolPlugin, Transport, PROTOCOL_VERSION};
use codetwo_core::app::{AppConfig, CoreApp};
use codetwo_core::plugin::PluginRuntimeCommand;
use codetwo_kernel::{async_trait, CommandRealm, FnPlugin, PluginError, Status};
use serde_json::{json, Value};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader, DuplexStream};
use tokio::sync::Notify;

// ---- the mock plugin ---------------------------------------------------------------------------

/// What our fake plugin process should do at the handshake.
#[derive(Clone)]
struct Behaviour {
    protocol_version: String,
    /// Never answer `initialize` — the failure mode that would otherwise hang the whole graph.
    silent: bool,
    /// Try to shadow a global host command from a project command realm.
    shadows_global_command: bool,
    /// Return an implementation schema that disagrees with the static manifest.
    schema_mismatch: bool,
    /// Hold the first transport start so a scope reload can supersede it.
    start_gate: Option<Arc<StartGate>>,
}

impl Default for Behaviour {
    fn default() -> Self {
        Behaviour {
            protocol_version: PROTOCOL_VERSION.to_string(),
            silent: false,
            shadows_global_command: false,
            schema_mismatch: false,
            start_gate: None,
        }
    }
}

#[derive(Default)]
struct StartGate {
    started: AtomicBool,
    entered: Notify,
    release: Notify,
}

/// Everything the mock observed, so tests can assert on the plugin's side of the conversation.
#[derive(Default)]
struct Observed {
    events: Mutex<Vec<(String, Value)>>,
    initialize_params: Mutex<Vec<Value>>,
    initialized: AtomicBool,
}

struct MockTransport {
    behaviour: Behaviour,
    observed: Arc<Observed>,
    shutdown_called: Arc<AtomicBool>,
    start_count: Arc<AtomicUsize>,
}

#[async_trait]
impl Transport for MockTransport {
    async fn start(&self) -> Result<Channel, PluginError> {
        self.start_count.fetch_add(1, Ordering::SeqCst);
        if let Some(gate) = &self.behaviour.start_gate {
            if !gate.started.swap(true, Ordering::SeqCst) {
                gate.entered.notify_one();
                gate.release.notified().await;
            }
        }
        let (host_side, plugin_side) = tokio::io::duplex(64 * 1024);
        let (reader, writer) = tokio::io::split(host_side);

        let behaviour = self.behaviour.clone();
        let observed = self.observed.clone();
        let task = tokio::spawn(async move { run_mock(plugin_side, behaviour, observed).await });

        let shutdown_called = self.shutdown_called.clone();
        Ok(Channel {
            reader: Box::new(reader),
            writer: Box::new(writer),
            shutdown: Box::new(move || {
                shutdown_called.store(true, Ordering::SeqCst);
                task.abort();
            }),
        })
    }
}

async fn send(writer: &mut tokio::io::WriteHalf<DuplexStream>, value: Value) {
    writer.write_all(format!("{value}\n").as_bytes()).await.ok();
}

/// A plugin process, in about forty lines. That it is this small is the point of the protocol.
async fn run_mock(stream: DuplexStream, behaviour: Behaviour, observed: Arc<Observed>) {
    let (reader, mut writer) = tokio::io::split(stream);
    let mut lines = BufReader::new(reader).lines();

    while let Ok(Some(line)) = lines.next_line().await {
        let message: Value = match serde_json::from_str(&line) {
            Ok(value) => value,
            Err(_) => continue,
        };
        let method = message
            .get("method")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();
        let id = message.get("id").cloned();
        let params = message.get("params").cloned().unwrap_or(Value::Null);

        match method.as_str() {
            "initialize" => {
                observed
                    .initialize_params
                    .lock()
                    .unwrap()
                    .push(params.clone());
                observed.initialized.store(true, Ordering::SeqCst);
                if behaviour.silent {
                    continue;
                }
                let commands = if behaviour.shadows_global_command {
                    json!([{ "name": "demo.internal" }])
                } else if behaviour.schema_mismatch {
                    json!([
                        { "name": "mock.echo", "schema": { "type": "array" } },
                        { "name": "mock.viaHost" },
                        { "name": "mock.internalViaHost" }
                    ])
                } else {
                    json!([
                        { "name": "mock.echo", "description": "Echo the arguments back." },
                        { "name": "mock.viaHost" },
                        { "name": "mock.internalViaHost" }
                    ])
                };
                let result = json!({
                    "name": "mock",
                    "version": "0.1.0",
                    "protocolVersion": behaviour.protocol_version,
                    "commands": commands,
                    "events": ["skills/changed"]
                });
                send(
                    &mut writer,
                    json!({ "jsonrpc": "2.0", "id": id, "result": result }),
                )
                .await;
            }
            "command/invoke" => {
                let name = params
                    .get("name")
                    .and_then(Value::as_str)
                    .unwrap_or_default();
                let args = params.get("args").cloned().unwrap_or(Value::Null);
                match name {
                    "mock.echo" => {
                        send(
                            &mut writer,
                            json!({ "jsonrpc": "2.0", "id": id, "result": args }),
                        )
                        .await;
                    }
                    // Call back into the host, and answer with what the host said.
                    "mock.viaHost" | "mock.internalViaHost" => {
                        let target = if name == "mock.viaHost" {
                            "demo.answer"
                        } else {
                            "demo.internal"
                        };
                        let call = json!({
                            "jsonrpc": "2.0", "id": 9001, "method": "command/call",
                            "params": { "name": target, "args": {} }
                        });
                        writer.write_all(format!("{call}\n").as_bytes()).await.ok();
                        // The host's response arrives on the same stream.
                        let Ok(Some(line)) = lines.next_line().await else {
                            return;
                        };
                        let response: Value = serde_json::from_str(&line).unwrap_or(Value::Null);
                        let answer = if let Some(host_said) = response.get("result") {
                            json!({ "host": host_said })
                        } else {
                            json!({
                                "error": response["error"]["message"]
                                    .as_str()
                                    .unwrap_or("host call failed")
                            })
                        };
                        send(
                            &mut writer,
                            json!({ "jsonrpc": "2.0", "id": id, "result": answer }),
                        )
                        .await;
                    }
                    other => {
                        send(
                            &mut writer,
                            json!({ "jsonrpc": "2.0", "id": id,
                                    "error": { "code": -32601, "message": format!("no {other}") } }),
                        )
                        .await;
                    }
                }
            }
            "event/emit" => {
                let name = params
                    .get("name")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string();
                let payload = params.get("payload").cloned().unwrap_or(Value::Null);
                observed.events.lock().unwrap().push((name, payload));
            }
            _ => {}
        }
    }
}

// ---- harness -----------------------------------------------------------------------------------

struct Fixture {
    app: CoreApp,
    observed: Arc<Observed>,
    shutdown_called: Arc<AtomicBool>,
    start_count: Arc<AtomicUsize>,
    _dir: tempfile::TempDir,
}

async fn load(behaviour: Behaviour) -> (Fixture, codetwo_kernel::Fork) {
    load_in_realm(behaviour, CommandRealm::Global).await
}

async fn load_in_realm(
    behaviour: Behaviour,
    realm: CommandRealm,
) -> (Fixture, codetwo_kernel::Fork) {
    load_in_realm_with_commands(behaviour, realm, None).await
}

async fn load_static(behaviour: Behaviour) -> (Fixture, codetwo_kernel::Fork) {
    load_in_realm_with_commands(behaviour, CommandRealm::Global, Some(static_commands())).await
}

fn static_commands() -> Vec<PluginRuntimeCommand> {
    vec![
        PluginRuntimeCommand {
            id: "mock.echo".into(),
            title: "Echo".into(),
            description: "Static echo description.".into(),
            args_schema: None,
        },
        PluginRuntimeCommand {
            id: "mock.viaHost".into(),
            title: "Call public host command".into(),
            description: String::new(),
            args_schema: None,
        },
        PluginRuntimeCommand {
            id: "mock.internalViaHost".into(),
            title: "Try internal host command".into(),
            description: String::new(),
            args_schema: None,
        },
    ]
}

async fn load_in_realm_with_commands(
    behaviour: Behaviour,
    realm: CommandRealm,
    declared_commands: Option<Vec<PluginRuntimeCommand>>,
) -> (Fixture, codetwo_kernel::Fork) {
    let dir = tempfile::tempdir().unwrap();
    // A bare host: this test is about the protocol, not about the rest of the app.
    let app = CoreApp::boot(AppConfig::bare()).await.unwrap();

    // One host command for the plugin to call back into.
    app.ctx().plugin(
        FnPlugin::new("demo", |ctx: codetwo_kernel::Context, _| async move {
            ctx.command_extension_public("demo.answer", |_| async move { Ok(Value::from(42)) })?;
            ctx.command("demo.internal", |_| async move { Ok(Value::from(7)) })?;
            Ok(())
        }),
        Value::Null,
    );
    app.ctx()
        .with_command_realm(CommandRealm::project("project-a"))
        .plugin(
            FnPlugin::new(
                "project-a-plugin",
                |ctx: codetwo_kernel::Context, _| async move {
                    ctx.command_extension_public(
                        "project-a.only",
                        |_| async move { Ok(Value::Null) },
                    )?;
                    ctx.command("project-a.internal", |_| async move { Ok(Value::Null) })?;
                    Ok(())
                },
            ),
            Value::Null,
        );
    app.ctx()
        .with_command_realm(CommandRealm::project("project-b"))
        .plugin(
            FnPlugin::new(
                "project-b-plugin",
                |ctx: codetwo_kernel::Context, _| async move {
                    ctx.command_extension_public(
                        "project-b.only",
                        |_| async move { Ok(Value::Null) },
                    )?;
                    Ok(())
                },
            ),
            Value::Null,
        );
    app.flush().await;

    let observed = Arc::new(Observed::default());
    let shutdown_called = Arc::new(AtomicBool::new(false));
    let start_count = Arc::new(AtomicUsize::new(0));
    let transport = MockTransport {
        behaviour,
        observed: observed.clone(),
        shutdown_called: shutdown_called.clone(),
        start_count: start_count.clone(),
    };
    let mut plugin = ProtocolPlugin::new("mock", Arc::new(transport))
        .with_handshake_timeout(Duration::from_millis(200));
    if let Some(commands) = declared_commands {
        plugin = plugin.with_declared_commands(commands);
    }
    let fork = app
        .ctx()
        .with_command_realm(realm)
        .plugin(plugin, json!({ "greeting": "hi" }));
    app.flush().await;

    (
        Fixture {
            app,
            observed,
            shutdown_called,
            start_count,
            _dir: dir,
        },
        fork,
    )
}

// ---- tests -------------------------------------------------------------------------------------

#[tokio::test]
async fn a_plugin_in_another_process_contributes_ordinary_commands() {
    let (fixture, fork) = load(Behaviour::default()).await;
    assert_eq!(fork.status(), Status::Active);
    assert!(
        fixture.observed.initialized.load(Ordering::SeqCst),
        "the handshake happened"
    );

    // Indistinguishable from a built-in, which is the whole claim.
    let echoed = fixture
        .app
        .call("mock.echo", json!({ "hello": "world" }))
        .await
        .unwrap();
    assert_eq!(echoed, json!({ "hello": "world" }));

    let registered = fixture.app.commands();
    let echo = registered
        .iter()
        .find(|command| command.name == "mock.echo")
        .unwrap();
    assert_eq!(echo.plugin, "mock");
    assert_eq!(
        echo.description.as_deref(),
        Some("Echo the arguments back.")
    );
}

#[tokio::test]
async fn static_commands_activate_the_process_once_on_first_use() {
    let (fixture, fork) = load_static(Behaviour::default()).await;
    assert_eq!(fork.status(), Status::Active);
    assert_eq!(fixture.start_count.load(Ordering::SeqCst), 0);
    assert!(!fixture.observed.initialized.load(Ordering::SeqCst));

    let registered = fixture.app.commands();
    let echo = registered
        .iter()
        .find(|command| command.name == "mock.echo")
        .expect("the static stub is available before activation");
    assert_eq!(
        echo.description.as_deref(),
        Some("Static echo description.")
    );

    let first = fixture.app.call("mock.echo", json!({ "call": 1 }));
    let second = fixture.app.call("mock.echo", json!({ "call": 2 }));
    let (first, second) = tokio::join!(first, second);
    assert_eq!(first.unwrap(), json!({ "call": 1 }));
    assert_eq!(second.unwrap(), json!({ "call": 2 }));
    assert_eq!(fixture.start_count.load(Ordering::SeqCst), 1);
    assert!(fixture.observed.initialized.load(Ordering::SeqCst));
}

#[tokio::test]
async fn unloading_a_dormant_static_runtime_removes_stubs_without_starting_it() {
    let (fixture, fork) = load_static(Behaviour::default()).await;
    fork.dispose();
    fixture.app.flush().await;

    assert_eq!(fixture.start_count.load(Ordering::SeqCst), 0);
    assert!(!fixture.shutdown_called.load(Ordering::SeqCst));
    assert!(fixture.app.call("mock.echo", Value::Null).await.is_err());
}

#[tokio::test]
async fn a_static_command_set_mismatch_fails_closed_for_the_scope_generation() {
    let (fixture, _fork) = load_static(Behaviour {
        shadows_global_command: true,
        ..Behaviour::default()
    })
    .await;

    let first = fixture
        .app
        .call("mock.echo", Value::Null)
        .await
        .unwrap_err();
    assert!(first.to_string().contains("do not match the manifest"));
    assert!(first.to_string().contains("disable and re-enable"));
    assert!(fixture.shutdown_called.load(Ordering::SeqCst));
    assert_eq!(fixture.start_count.load(Ordering::SeqCst), 1);

    let second = fixture
        .app
        .call("mock.echo", Value::Null)
        .await
        .unwrap_err();
    assert_eq!(second.to_string(), first.to_string());
    assert_eq!(fixture.start_count.load(Ordering::SeqCst), 1);
}

#[tokio::test]
async fn a_static_command_schema_mismatch_is_rejected_before_invoke() {
    let mut commands = static_commands();
    commands[0].args_schema = Some(json!({ "type": "object" }));
    let (fixture, _fork) = load_in_realm_with_commands(
        Behaviour {
            schema_mismatch: true,
            ..Behaviour::default()
        },
        CommandRealm::Global,
        Some(commands),
    )
    .await;

    let error = fixture
        .app
        .call("mock.echo", Value::Null)
        .await
        .unwrap_err();
    assert!(error
        .to_string()
        .contains("does not match the manifest argsSchema"));
    assert!(fixture.shutdown_called.load(Ordering::SeqCst));
    assert_eq!(fixture.start_count.load(Ordering::SeqCst), 1);
}

#[tokio::test]
async fn cancelling_first_activation_stops_the_child_and_allows_a_clean_retry() {
    let (fixture, _fork) = load_static(Behaviour {
        silent: true,
        ..Behaviour::default()
    })
    .await;

    let mut first = Box::pin(fixture.app.call("mock.echo", Value::Null));
    tokio::select! {
        result = &mut first => panic!("silent activation unexpectedly completed: {result:?}"),
        _ = tokio::time::sleep(Duration::from_millis(20)) => {}
    }
    drop(first);
    assert!(fixture.shutdown_called.load(Ordering::SeqCst));
    assert_eq!(fixture.start_count.load(Ordering::SeqCst), 1);

    fixture.shutdown_called.store(false, Ordering::SeqCst);
    let retried = fixture
        .app
        .call("mock.echo", Value::Null)
        .await
        .unwrap_err();
    assert!(retried.to_string().contains("initialize"));
    assert_eq!(fixture.start_count.load(Ordering::SeqCst), 2);
    assert!(fixture.shutdown_called.load(Ordering::SeqCst));
}

#[tokio::test]
async fn unloading_during_initialize_stops_the_pending_activation_before_flush_returns() {
    let (fixture, fork) = load_static(Behaviour {
        silent: true,
        ..Behaviour::default()
    })
    .await;

    let mut call = Box::pin(fixture.app.call("mock.echo", Value::Null));
    let initialized = tokio::time::timeout(Duration::from_millis(100), async {
        while !fixture.observed.initialized.load(Ordering::SeqCst) {
            tokio::task::yield_now().await;
        }
    });
    tokio::select! {
        result = &mut call => panic!("silent activation unexpectedly completed: {result:?}"),
        result = initialized => result.expect("initialize should reach the silent plugin"),
    }

    fork.dispose();
    fixture.app.flush().await;
    assert!(fixture.shutdown_called.load(Ordering::SeqCst));
    assert!(tokio::time::timeout(Duration::from_millis(100), &mut call)
        .await
        .expect("unload should release the pending invocation")
        .is_err());
}

#[tokio::test]
async fn a_start_from_an_old_scope_generation_cannot_attach_after_reload() {
    let gate = Arc::new(StartGate::default());
    let (fixture, fork) = load_static(Behaviour {
        start_gate: Some(gate.clone()),
        ..Behaviour::default()
    })
    .await;

    let mut stale_call = Box::pin(fixture.app.call("mock.echo", json!({ "old": true })));
    tokio::select! {
        result = &mut stale_call => panic!("gated start unexpectedly completed: {result:?}"),
        _ = gate.entered.notified() => {}
    }

    fork.update(json!({ "greeting": "reloaded" }));
    fixture.app.flush().await;
    gate.release.notify_one();

    assert!(
        tokio::time::timeout(Duration::from_millis(100), &mut stale_call)
            .await
            .expect("the stale start should be rejected")
            .is_err()
    );
    assert!(fixture.shutdown_called.load(Ordering::SeqCst));
    assert_eq!(fixture.start_count.load(Ordering::SeqCst), 1);

    let current = fixture
        .app
        .call("mock.echo", json!({ "current": true }))
        .await
        .unwrap();
    assert_eq!(current, json!({ "current": true }));
    assert_eq!(fixture.start_count.load(Ordering::SeqCst), 2);
}

#[tokio::test]
async fn initialize_identifies_only_project_scoped_instances() {
    let (global, _fork) = load(Behaviour::default()).await;
    let global_params = global.observed.initialize_params.lock().unwrap()[0].clone();
    assert!(
        global_params.get("projectPath").is_none(),
        "global instances must not masquerade as a project"
    );

    let project = tempfile::tempdir().unwrap();
    let normalized = project
        .path()
        .canonicalize()
        .unwrap()
        .to_string_lossy()
        .into_owned();
    let (local, _fork) = load_in_realm(
        Behaviour::default(),
        CommandRealm::project(normalized.clone()),
    )
    .await;
    let local_params = local.observed.initialize_params.lock().unwrap()[0].clone();
    assert_eq!(local_params["projectPath"], normalized);
}

#[tokio::test]
async fn initialize_exposes_commands_from_only_the_instance_realm_and_global_fallback() {
    let (global, _fork) = load(Behaviour::default()).await;
    let global_params = global.observed.initialize_params.lock().unwrap()[0].clone();
    let global_commands: Vec<String> =
        serde_json::from_value(global_params["host"]["commands"].clone()).unwrap();
    assert!(global_commands.contains(&"demo.answer".into()));
    assert!(!global_commands.contains(&"demo.internal".into()));
    assert!(!global_commands.contains(&"project-a.only".into()));
    assert!(!global_commands.contains(&"project-b.only".into()));

    let (project, _fork) =
        load_in_realm(Behaviour::default(), CommandRealm::project("project-a")).await;
    let project_params = project.observed.initialize_params.lock().unwrap()[0].clone();
    let project_commands: Vec<String> =
        serde_json::from_value(project_params["host"]["commands"].clone()).unwrap();
    assert!(project_commands.contains(&"demo.answer".into()));
    assert!(project_commands.contains(&"project-a.only".into()));
    assert!(!project_commands.contains(&"demo.internal".into()));
    assert!(!project_commands.contains(&"project-a.internal".into()));
    assert!(!project_commands.contains(&"project-b.only".into()));
}

#[tokio::test]
async fn a_project_extension_cannot_shadow_a_global_host_command() {
    let (fixture, fork) = load_in_realm(
        Behaviour {
            shadows_global_command: true,
            ..Behaviour::default()
        },
        CommandRealm::project("project-a"),
    )
    .await;

    assert_eq!(fork.status(), Status::Failed);
    let scope = fixture
        .app
        .scopes()
        .into_iter()
        .find(|scope| scope.id == fork.id())
        .unwrap();
    assert!(
        scope
            .error
            .unwrap()
            .contains("conflicts with global command owned by `demo`"),
        "the extension should fail before registering the shadow"
    );
    assert_eq!(
        fixture
            .app
            .ctx()
            .with_command_realm(CommandRealm::project("project-a"))
            .call("demo.internal", Value::Null)
            .await
            .unwrap(),
        7
    );
}

#[tokio::test]
async fn a_plugin_can_call_back_into_the_host() {
    let (fixture, _fork) = load(Behaviour::default()).await;
    let answered = fixture.app.call("mock.viaHost", Value::Null).await.unwrap();
    assert_eq!(
        answered,
        json!({ "host": 42 }),
        "the plugin reached a host command by name, through the same registry"
    );
}

#[tokio::test]
async fn a_plugin_cannot_call_an_internal_host_command_even_if_it_knows_the_name() {
    let (fixture, _fork) = load(Behaviour::default()).await;

    assert_eq!(
        fixture
            .app
            .call("demo.internal", Value::Null)
            .await
            .unwrap(),
        7,
        "the command remains available to the trusted host"
    );
    let refused = fixture
        .app
        .call("mock.internalViaHost", Value::Null)
        .await
        .unwrap();
    assert_eq!(
        refused,
        json!({
            "error": "command `demo.internal` is internal and is not available to extension processes"
        })
    );
}

#[tokio::test]
async fn a_plugin_receives_the_host_events_it_subscribed_to() {
    let (fixture, _fork) = load(Behaviour::default()).await;

    fixture
        .app
        .ctx()
        .emit_json("skills/changed", json!({ "count": 3 }))
        .await;
    fixture
        .app
        .ctx()
        .emit_json("nobody/listens", json!({}))
        .await;
    tokio::time::sleep(Duration::from_millis(50)).await;

    let events = fixture.observed.events.lock().unwrap().clone();
    assert_eq!(events.len(), 1, "only the subscription it declared");
    assert_eq!(events[0].0, "skills/changed");
    assert_eq!(events[0].1, json!({ "count": 3 }));
}

#[tokio::test]
async fn unloading_stops_the_process_and_takes_its_commands_with_it() {
    let (fixture, fork) = load(Behaviour::default()).await;
    assert!(fixture.app.call("mock.echo", Value::Null).await.is_ok());

    fork.dispose();
    fixture.app.flush().await;

    assert!(
        fixture.shutdown_called.load(Ordering::SeqCst),
        "the process was stopped"
    );
    assert!(
        fixture.app.call("mock.echo", Value::Null).await.is_err(),
        "an unloaded plugin leaves no surface behind"
    );
    assert!(!fixture
        .app
        .commands()
        .iter()
        .any(|command| command.plugin == "mock"));
}

#[tokio::test]
async fn a_plugin_speaking_a_different_protocol_is_refused_and_stopped() {
    let behaviour = Behaviour {
        protocol_version: "2.0.0".into(),
        ..Behaviour::default()
    };
    let (fixture, fork) = load(behaviour).await;

    assert_eq!(fork.status(), Status::Failed);
    let scope = fixture
        .app
        .scopes()
        .into_iter()
        .find(|scope| scope.id == fork.id())
        .unwrap();
    assert!(scope.error.unwrap().contains("2.0.0"));
    assert!(
        fixture.shutdown_called.load(Ordering::SeqCst),
        "a refused plugin is not left running"
    );
}

#[tokio::test]
async fn a_plugin_that_never_answers_fails_instead_of_hanging_the_graph() {
    let behaviour = Behaviour {
        silent: true,
        ..Behaviour::default()
    };
    let (fixture, fork) = load(behaviour).await;

    assert_eq!(fork.status(), Status::Failed);
    let scope = fixture
        .app
        .scopes()
        .into_iter()
        .find(|scope| scope.id == fork.id())
        .unwrap();
    assert!(scope.error.unwrap().contains("initialize"));
    assert!(fixture.shutdown_called.load(Ordering::SeqCst));

    // The rest of the graph is untouched — the point of bounding the wait.
    assert_eq!(
        fixture.app.call("demo.answer", Value::Null).await.unwrap(),
        42
    );
}

// ---- trust -------------------------------------------------------------------------------------

/// Write an installed-bundle record by hand: an install that ships a process.
fn install_record(plugins_dir: &std::path::Path, id: &str, trusted: bool) {
    let dir = plugins_dir.join(id);
    std::fs::create_dir_all(dir.join("bundle")).unwrap();
    let record = json!({
        "schema_version": 3,
        "id": id,
        "name": id,
        "version": "1.0.0",
        "description": "Protocol trust fixture",
        "author": "C2",
        "source": "github",
        "repository": "https://github.com/example/plugin",
        "standard_version": "1.0.0",
        "enabled": true,
        "trusted": trusted,
        "scope": "user",
        "counts": { "skills": 0, "subagents": 0, "mcp_servers": 0, "scaffolds": 0, "runtime": 1 },
        "components": [],
        "scaffolds": [],
        "extension_components": [],
        "ui_contributions": [],
        "lsp_servers": [],
        "diagnostics": [],
        "runtime": {
            "protocol": "1.0.0",
            // Never started in this test — the assertion is that it is not.
            "command": "definitely-not-a-real-binary"
        }
    });
    std::fs::write(dir.join("installed-plugin.json"), record.to_string()).unwrap();
}

#[tokio::test]
async fn an_untrusted_bundle_that_ships_a_process_is_not_started() {
    let dir = tempfile::tempdir().unwrap();
    let app = CoreApp::boot(
        AppConfig::bare()
            .with(
                "paths",
                codetwo_kernel::PluginEntry::with_config(
                    json!({ "data_dir": dir.path().to_string_lossy() }),
                ),
            )
            .with("plugin-hub", codetwo_kernel::PluginEntry::default())
            .with("extensions", codetwo_kernel::PluginEntry::default()),
    )
    .await
    .unwrap();

    let plugins_dir = dir.path().join("plugins");
    install_record(&plugins_dir, "untrusted-one", false);
    install_record(&plugins_dir, "trusted-one", true);

    // Exactly what installing one does: announce it, and let the plugin rebuild itself.
    app.ctx()
        .emit(codetwo_core::app::events::PluginsChanged)
        .await;
    app.flush().await;

    let listed = app.call("extensions.list", Value::Null).await.unwrap();
    let untrusted: Vec<String> = serde_json::from_value(listed["untrusted"].clone()).unwrap();
    assert_eq!(
        untrusted,
        ["untrusted-one"],
        "trust is what gates execution, not installation"
    );

    // The trusted one *was* attempted — and failed honestly, because its command does not exist.
    let trusted_scope = app
        .scopes()
        .into_iter()
        .find(|scope| scope.plugin == "bundle:trusted-one");
    let trusted_scope = trusted_scope.expect("the trusted plugin was loaded into the graph");
    assert_eq!(trusted_scope.status, Status::Failed);
    assert!(trusted_scope
        .error
        .unwrap()
        .contains("definitely-not-a-real-binary"));
}
