//! The plugin protocol, end to end, against a mock plugin over an in-memory duplex.
//!
//! No plugin binary is installed and no process is spawned: [`Transport`] exists precisely so the
//! handshake, the command forwarding, the callbacks and the teardown are all exercised offline —
//! the same trick `acp_prompt_turn.rs` uses to test a prompt turn without a provider CLI.

use codetwo_core::app::protocol::{Channel, ProtocolPlugin, Transport, PROTOCOL_VERSION};
use codetwo_core::app::{AppConfig, CoreApp};
use codetwo_kernel::{async_trait, FnPlugin, PluginError, Status};
use serde_json::{json, Value};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader, DuplexStream};

// ---- the mock plugin ---------------------------------------------------------------------------

/// What our fake plugin process should do at the handshake.
#[derive(Clone)]
struct Behaviour {
    protocol_version: String,
    /// Never answer `initialize` — the failure mode that would otherwise hang the whole graph.
    silent: bool,
}

impl Default for Behaviour {
    fn default() -> Self {
        Behaviour { protocol_version: PROTOCOL_VERSION.to_string(), silent: false }
    }
}

/// Everything the mock observed, so tests can assert on the plugin's side of the conversation.
#[derive(Default)]
struct Observed {
    events: Mutex<Vec<(String, Value)>>,
    initialized: AtomicBool,
}

struct MockTransport {
    behaviour: Behaviour,
    observed: Arc<Observed>,
    shutdown_called: Arc<AtomicBool>,
}

#[async_trait]
impl Transport for MockTransport {
    async fn start(&self) -> Result<Channel, PluginError> {
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
        let method = message.get("method").and_then(Value::as_str).unwrap_or_default().to_string();
        let id = message.get("id").cloned();
        let params = message.get("params").cloned().unwrap_or(Value::Null);

        match method.as_str() {
            "initialize" => {
                observed.initialized.store(true, Ordering::SeqCst);
                if behaviour.silent {
                    continue;
                }
                let result = json!({
                    "name": "mock",
                    "version": "0.1.0",
                    "protocolVersion": behaviour.protocol_version,
                    "commands": [
                        { "name": "mock.echo", "description": "Echo the arguments back." },
                        { "name": "mock.viaHost" }
                    ],
                    "events": ["skills/changed"]
                });
                send(&mut writer, json!({ "jsonrpc": "2.0", "id": id, "result": result })).await;
            }
            "command/invoke" => {
                let name = params.get("name").and_then(Value::as_str).unwrap_or_default();
                let args = params.get("args").cloned().unwrap_or(Value::Null);
                match name {
                    "mock.echo" => {
                        send(&mut writer, json!({ "jsonrpc": "2.0", "id": id, "result": args }))
                            .await;
                    }
                    // Call back into the host, and answer with what the host said.
                    "mock.viaHost" => {
                        let call = json!({
                            "jsonrpc": "2.0", "id": 9001, "method": "command/call",
                            "params": { "name": "demo.answer", "args": {} }
                        });
                        writer.write_all(format!("{call}\n").as_bytes()).await.ok();
                        // The host's response arrives on the same stream.
                        let Ok(Some(line)) = lines.next_line().await else { return };
                        let response: Value = serde_json::from_str(&line).unwrap_or(Value::Null);
                        let host_said = response.get("result").cloned().unwrap_or(Value::Null);
                        send(
                            &mut writer,
                            json!({ "jsonrpc": "2.0", "id": id, "result": { "host": host_said } }),
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
                let name =
                    params.get("name").and_then(Value::as_str).unwrap_or_default().to_string();
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
    _dir: tempfile::TempDir,
}

async fn load(behaviour: Behaviour) -> (Fixture, codetwo_kernel::Fork) {
    let dir = tempfile::tempdir().unwrap();
    // A bare host: this test is about the protocol, not about the rest of the app.
    let app = CoreApp::boot(AppConfig::bare()).await.unwrap();

    // One host command for the plugin to call back into.
    app.ctx().plugin(
        FnPlugin::new("demo", |ctx: codetwo_kernel::Context, _| async move {
            ctx.command("demo.answer", |_| async move { Ok(Value::from(42)) })?;
            Ok(())
        }),
        Value::Null,
    );
    app.flush().await;

    let observed = Arc::new(Observed::default());
    let shutdown_called = Arc::new(AtomicBool::new(false));
    let transport = MockTransport {
        behaviour,
        observed: observed.clone(),
        shutdown_called: shutdown_called.clone(),
    };
    let fork = app.ctx().plugin(
        ProtocolPlugin::new("mock", Arc::new(transport))
            .with_handshake_timeout(Duration::from_millis(200)),
        json!({ "greeting": "hi" }),
    );
    app.flush().await;

    (Fixture { app, observed, shutdown_called, _dir: dir }, fork)
}

// ---- tests -------------------------------------------------------------------------------------

#[tokio::test]
async fn a_plugin_in_another_process_contributes_ordinary_commands() {
    let (fixture, fork) = load(Behaviour::default()).await;
    assert_eq!(fork.status(), Status::Active);
    assert!(fixture.observed.initialized.load(Ordering::SeqCst), "the handshake happened");

    // Indistinguishable from a built-in, which is the whole claim.
    let echoed = fixture.app.call("mock.echo", json!({ "hello": "world" })).await.unwrap();
    assert_eq!(echoed, json!({ "hello": "world" }));

    let registered = fixture.app.commands();
    let echo = registered.iter().find(|command| command.name == "mock.echo").unwrap();
    assert_eq!(echo.plugin, "mock");
    assert_eq!(echo.description.as_deref(), Some("Echo the arguments back."));
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
async fn a_plugin_receives_the_host_events_it_subscribed_to() {
    let (fixture, _fork) = load(Behaviour::default()).await;

    fixture.app.ctx().emit_json("skills/changed", json!({ "count": 3 })).await;
    fixture.app.ctx().emit_json("nobody/listens", json!({})).await;
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

    assert!(fixture.shutdown_called.load(Ordering::SeqCst), "the process was stopped");
    assert!(
        fixture.app.call("mock.echo", Value::Null).await.is_err(),
        "an unloaded plugin leaves no surface behind"
    );
    assert!(!fixture.app.commands().iter().any(|command| command.plugin == "mock"));
}

#[tokio::test]
async fn a_plugin_speaking_a_different_protocol_is_refused_and_stopped() {
    let behaviour = Behaviour { protocol_version: "2.0.0".into(), ..Behaviour::default() };
    let (fixture, fork) = load(behaviour).await;

    assert_eq!(fork.status(), Status::Failed);
    let scope = fixture.app.scopes().into_iter().find(|scope| scope.id == fork.id()).unwrap();
    assert!(scope.error.unwrap().contains("2.0.0"));
    assert!(fixture.shutdown_called.load(Ordering::SeqCst), "a refused plugin is not left running");
}

#[tokio::test]
async fn a_plugin_that_never_answers_fails_instead_of_hanging_the_graph() {
    let behaviour = Behaviour { silent: true, ..Behaviour::default() };
    let (fixture, fork) = load(behaviour).await;

    assert_eq!(fork.status(), Status::Failed);
    let scope = fixture.app.scopes().into_iter().find(|scope| scope.id == fork.id()).unwrap();
    assert!(scope.error.unwrap().contains("initialize"));
    assert!(fixture.shutdown_called.load(Ordering::SeqCst));

    // The rest of the graph is untouched — the point of bounding the wait.
    assert_eq!(fixture.app.call("demo.answer", Value::Null).await.unwrap(), 42);
}

// ---- trust -------------------------------------------------------------------------------------

/// Write an installed-bundle record by hand: an install that ships a process.
fn install_record(plugins_dir: &std::path::Path, id: &str, trusted: bool) {
    let dir = plugins_dir.join(id);
    std::fs::create_dir_all(dir.join("bundle")).unwrap();
    let record = json!({
        "schema_version": 2,
        "id": id,
        "name": id,
        "version": "1.0.0",
        "source": "github",
        "repository": "https://github.com/example/plugin",
        "enabled": true,
        "trusted": trusted,
        "counts": { "skills": 0, "subagents": 0, "mcp_servers": 0, "scaffolds": 0, "runtime": 1 },
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
    app.ctx().emit(codetwo_core::app::events::PluginsChanged).await;
    app.flush().await;

    let listed = app.call("extensions.list", Value::Null).await.unwrap();
    let untrusted: Vec<String> = serde_json::from_value(listed["untrusted"].clone()).unwrap();
    assert_eq!(untrusted, ["untrusted-one"], "trust is what gates execution, not installation");

    // The trusted one *was* attempted — and failed honestly, because its command does not exist.
    let trusted_scope = app.scopes().into_iter().find(|scope| scope.plugin == "trusted-one");
    let trusted_scope = trusted_scope.expect("the trusted plugin was loaded into the graph");
    assert_eq!(trusted_scope.status, Status::Failed);
    assert!(trusted_scope.error.unwrap().contains("definitely-not-a-real-binary"));
}
